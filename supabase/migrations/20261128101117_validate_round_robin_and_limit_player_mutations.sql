-- Reconstruct the round-robin circle method using stable identities.
create function tournament_private.circle_pair(p_members text[],p_round int,p_match int)
returns jsonb language plpgsql immutable set search_path='' as $$
declare n int:=cardinality(p_members); k int; a int; b int; ai int; bi int; pair_no int:=0; rotation_size int;
begin
 if n is null or n<2 or p_round<1 or p_match<1 then return null; end if;
 rotation_size:=n+n%2;
 if p_round>=rotation_size then return null; end if;
 for k in 0..rotation_size/2-1 loop
  a:=k;b:=rotation_size-1-k;
  ai:=case when a=0 then 1 else 2+mod(a-1-(p_round-1)+rotation_size-1,rotation_size-1) end;
  bi:=case when b=0 then 1 else 2+mod(b-1-(p_round-1)+rotation_size-1,rotation_size-1) end;
  if ai>n or bi>n then continue; end if;
  pair_no:=pair_no+1;
  if pair_no=p_match then return jsonb_build_array(p_members[ai],p_members[bi]); end if;
 end loop;
 return null;
end $$;

create function tournament_private.round_robin_pair(p_stage jsonb,p_entrants jsonb,p_assignments jsonb,p_match_id text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare sid text:=p_stage->>'id'; suffix text; g int; d int; m int; groups int; members text[];
begin
 if not starts_with(p_match_id,sid||'-') or jsonb_typeof(p_entrants) is distinct from 'array' then return null; end if;
 suffix:=substring(p_match_id from length(sid)+2);
 if p_stage->>'type'='GROUPS' then
  if suffix !~ '^g[1-9][0-9]{0,3}-d[1-9][0-9]{0,5}-m[1-9][0-9]{0,5}$' then return null; end if;
  g:=substring(suffix from '^g([0-9]+)-')::int-1;
  groups:=greatest(1,coalesce((p_stage->'settings'->>'groups')::int,1));
  if g>=groups then return null; end if;
  select array_agg(v order by pos) into members from jsonb_array_elements_text(p_entrants) with ordinality j(v,pos)
  where coalesce((p_assignments->>v)::int,mod(pos-1,groups)::int)=g;
 elsif p_stage->>'type'='ROUND_ROBIN' then
  if suffix !~ '^rr-d[1-9][0-9]{0,5}-m[1-9][0-9]{0,5}$' then return null; end if;
  select array_agg(v order by pos) into members from jsonb_array_elements_text(p_entrants) with ordinality j(v,pos);
 else return null; end if;
 d:=substring(suffix from 'd([0-9]+)-')::int;m:=substring(suffix from '-m([0-9]+)$')::int;
 return tournament_private.circle_pair(members,d,m);
end $$;

create function tournament_private.validate_online_round_robin() returns trigger
language plpgsql set search_path='' as $$
declare e jsonb:=new.payload->'entries'; h jsonb:=tournament_private.report_header(new.id,new.payload);
 life jsonb:=((e->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0;
 old_life jsonb; old_h jsonb; old_draws jsonb; old_assign jsonb;
 draws jsonb:=(e->>'online-tournament:mock-draw-config:v1')::jsonb;
 results jsonb:=(e->>'online-tournament:mock-match-results:v2')::jsonb;
 runtime jsonb:=(e->>'online-tournament:mock-match-runtime:v1')::jsonb;
 result_index jsonb; stage jsonb; sid text; entrants jsonb; assignments jsonb; groups int; item jsonb; pair jsonb; active_ids text[]; pid text;
begin
 if tg_op='UPDATE' then
  old_life:=((old.payload->'entries'->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0;
  old_h:=tournament_private.report_header(old.id,old.payload);
  old_draws:=(old.payload->'entries'->>'online-tournament:mock-draw-config:v1')::jsonb;
 end if;
 select coalesce(jsonb_object_agg(value->>'matchId',value),'{}') into result_index from jsonb_array_elements(results);
 for stage in select value from jsonb_array_elements(h->'stages') where value->>'type' in ('GROUPS','ROUND_ROBIN') loop
  sid:=stage->>'id';
  if not coalesce(life->'startedStageIds' ? sid,false) then continue; end if;
  entrants:=life->'stageEntrants'->sid;
  -- Older synthetic or pre-freeze snapshots lacked an entrant list.
  if entrants is null then
   if tg_op='UPDATE' and coalesce(old_life->'startedStageIds' ? sid,false) and old_life->'stageEntrants'->sid is null then continue; end if;
   -- Historical integration probes omit entrants, but do not establish a new
   -- sporting draw. Require them for newly generated real phases.
   if stage->'settings' ? 'entrants' then raise exception 'started round robin needs entrants' using errcode='22023'; end if;
   continue;
  end if;
  if tg_op='UPDATE' and coalesce(old_life->'startedStageIds' ? sid,false) and old_life->'stageEntrants'->sid is not null
   and entrants is distinct from old_life->'stageEntrants'->sid then raise exception 'started round robin field cannot change' using errcode='22023'; end if;
  assignments:=null;
  if stage->>'type'='GROUPS' then
   groups:=greatest(1,coalesce((stage->'settings'->>'groups')::int,1));
   if groups>4096 then raise exception 'invalid group count' using errcode='22023'; end if;
   select value->'groupAssignments' into assignments from jsonb_array_elements(draws) where value->>'stageId'=sid;
   if assignments is not null then
    if jsonb_typeof(assignments) is distinct from 'object' or (select count(*) from jsonb_object_keys(assignments))<>jsonb_array_length(entrants)
      or exists(select 1 from jsonb_each(assignments) j where not(entrants ? j.key) or jsonb_typeof(j.value)<>'number' or not coalesce((j.value#>>'{}') ~ '^[0-9]{1,4}$',false) or (j.value#>>'{}')::int>=groups)
    then raise exception 'invalid frozen group assignments' using errcode='22023'; end if;
   end if;
   if tg_op='UPDATE' and coalesce(old_life->'startedStageIds' ? sid,false) then
    select value->'groupAssignments' into old_assign from jsonb_array_elements(old_draws) where value->>'stageId'=sid;
    if old_assign is not null and assignments is distinct from old_assign then raise exception 'started group draw cannot change' using errcode='22023'; end if;
    if (select s->'settings'->'groups' from jsonb_array_elements(old_h->'stages') s where s->>'id'=sid) is distinct from stage->'settings'->'groups' then raise exception 'started group count cannot change' using errcode='22023'; end if;
   end if;
  end if;
  active_ids:='{}';
  for item in select value from jsonb_array_elements(results||runtime) where starts_with(value->>'matchId',sid||'-') loop
   if item->>'status'='CANCELLED' and item->>'startedAt' is null and jsonb_array_length(coalesce(item->'sets','[]'::jsonb))=0 then continue; end if;
   pair:=tournament_private.round_robin_pair(stage,entrants,assignments,item->>'matchId');
   if pair is null then raise exception 'unknown round robin match' using errcode='22023'; end if;
   if item ? 'forcedWinner' and not coalesce(item->>'forcedWinner' in (pair->>0,pair->>1,'ot:slot:unclaimed'),false) then raise exception 'forced winner outside round robin pairing' using errcode='22023'; end if;
   -- Only runtime records hold a real table; the result record may repeat the
   -- same ID. Check active assignments independently in the second loop.
  end loop;
  if not coalesce(life->'completedStageIds' ? sid,false) and h->>'status' in ('RUNNING','PAUSED') then
   for item in select value from jsonb_array_elements(runtime) where starts_with(value->>'matchId',sid||'-') and value->>'status' in ('LIVE','READY','CONFIRMATION') and value->>'table' like 'Tisch %' loop
    if result_index->(item->>'matchId')->>'status' in ('FINISHED','CANCELLED') then continue; end if;
    pair:=tournament_private.round_robin_pair(stage,entrants,assignments,item->>'matchId');
    foreach pid in array array[pair->>0,pair->>1] loop
     if pid=any(active_ids) then raise exception 'duplicate active round robin participant' using errcode='22023'; end if;
     active_ids:=array_append(active_ids,pid);
    end loop;
   end loop;
  end if;
 end loop;
 return new;
end $$;
create trigger zzzzzzz_validate_online_round_robin before insert or update on tournament_private.online_tournaments
for each row execute function tournament_private.validate_online_round_robin();

create function tournament_private.round_robin_report_pair_valid(f tournament_private.online_report_fixtures,t tournament_private.online_tournaments) returns boolean
language plpgsql stable set search_path='' as $$
declare e jsonb:=t.payload->'entries'; stage jsonb; entrants jsonb; assignments jsonb; pair jsonb;
begin
 select value into stage from jsonb_array_elements(tournament_private.report_header(t.id,t.payload)->'stages') where value->>'type' in ('GROUPS','ROUND_ROBIN') and starts_with(f.match_id,(value->>'id')||'-');
 if stage is null then return true; end if;
 entrants:=((e->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0->'stageEntrants'->(stage->>'id');
 if entrants is null then return true; end if;
 select value->'groupAssignments' into assignments from jsonb_array_elements((e->>'online-tournament:mock-draw-config:v1')::jsonb) where value->>'stageId'=stage->>'id';
 pair:=tournament_private.round_robin_pair(stage,entrants,assignments,f.match_id);
 return coalesce(pair->>0=f.a_id and pair->>1=f.b_id,false);
end $$;
revoke all on function tournament_private.circle_pair(text[],int,int),tournament_private.round_robin_pair(jsonb,jsonb,jsonb,text),tournament_private.validate_online_round_robin(),tournament_private.round_robin_report_pair_valid(tournament_private.online_report_fixtures,tournament_private.online_tournaments) from public,anon,authenticated;

-- Limit successful participant mutations, independently of link rotation.
-- No rows are created for invalid/unknown tokens; ordinary retries are idempotent.
create table tournament_private.online_player_write_budget (
 tournament_id text not null references tournament_private.online_tournaments(id) on delete cascade,
 participant_id text not null, minute_bucket bigint not null, used integer not null check(used between 1 and 30),
 primary key(tournament_id,participant_id)
);
alter table tournament_private.online_player_write_budget enable row level security;
revoke all on tournament_private.online_player_write_budget from public,anon,authenticated;
create function tournament_private.consume_player_write(p_id text,p_participant text) returns void
language plpgsql set search_path='' as $$
declare bucket bigint:=floor(extract(epoch from clock_timestamp())/60)::bigint;
begin
 insert into tournament_private.online_player_write_budget as b(tournament_id,participant_id,minute_bucket,used) values(p_id,p_participant,bucket,1)
 on conflict(tournament_id,participant_id) do update set minute_bucket=excluded.minute_bucket,used=case when b.minute_bucket=excluded.minute_bucket then b.used+1 else 1 end
 where b.minute_bucket<>excluded.minute_bucket or b.used<30;
 if not found then raise sqlstate 'PT429' using message='Zu viele Änderungen. Bitte eine Minute warten.'; end if;
end $$;
create function tournament_private.limit_player_write() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='online_result_reports' then perform tournament_private.consume_player_write(new.tournament_id,new.participant_id);
 else
  if new.ack_a and not old.ack_a then perform tournament_private.consume_player_write(new.tournament_id,new.a_id); end if;
  if new.ack_b and not old.ack_b then perform tournament_private.consume_player_write(new.tournament_id,new.b_id); end if;
 end if;
 return new;
end $$;
create trigger limit_player_report_write before insert on tournament_private.online_result_reports for each row execute function tournament_private.limit_player_write();
create trigger limit_player_call_write before update of ack_a,ack_b on tournament_private.online_match_calls for each row execute function tournament_private.limit_player_write();
revoke all on function tournament_private.consume_player_write(text,text),tournament_private.limit_player_write() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION tournament_private.report_fixture_live(f tournament_private.online_report_fixtures, t tournament_private.online_tournaments)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(t.revision=f.revision and tournament_private.report_header(t.id,t.payload)->>'status' in ('RUNNING','PAUSED')
 and exists(select 1 from jsonb_array_elements((t.payload->'entries'->>'online-tournament:mock-match-runtime:v1')::jsonb) r
 where r->>'matchId'=f.match_id and r->>'status' in ('LIVE','READY') and r->>'startedAt'=f.started_at::text and r->>'table' ~ '^Tisch [1-9][0-9]*$')
 and (f.match_id !~ '-sw-r[1-9][0-9]{0,3}-m[1-9][0-9]{0,5}$' or exists(
   select 1 from jsonb_array_elements((t.payload->'entries'->>'online-tournament:swiss-round-fixtures:v1')::jsonb) j
   cross join lateral jsonb_array_elements(j->'pairs') with ordinality as pair(value,position)
   where f.match_id=(j->>'stageId')||'-sw-r'||(j->>'round')||'-m'||pair.position::text
     and pair.value->>0=f.a_id and pair.value->>1=f.b_id
 ))
 and tournament_private.ko_report_pair_valid(f,t)
 and tournament_private.round_robin_report_pair_valid(f,t)
 and not exists(select 1 from jsonb_array_elements((t.payload->'entries'->>'online-tournament:mock-match-results:v2')::jsonb) r
 where r->>'matchId'=f.match_id and (r->>'status' in ('FINISHED','CANCELLED','CONFIRMATION') or jsonb_array_length(coalesce(r->'sets','[]'::jsonb))>0 or r ? 'forcedWinner' or r ? 'extraTimeProgress')),false);
$function$
;