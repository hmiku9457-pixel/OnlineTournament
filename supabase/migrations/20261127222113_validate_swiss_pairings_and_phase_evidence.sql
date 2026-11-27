-- Persisted Swiss rounds must refer to stable roster identities. Keep
-- start evidence and played pairing identity intact across revisions.
create function tournament_private.validate_online_pairings() returns trigger
language plpgsql security invoker set search_path='' as $$
declare e jsonb:=new.payload->'entries'; t jsonb:=tournament_private.report_header(new.id,new.payload);
 life jsonb:=((e->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0;
 rounds jsonb:=(e->>'online-tournament:swiss-round-fixtures:v1')::jsonb;
 results jsonb:=(e->>'online-tournament:mock-match-results:v2')::jsonb;
 runtime jsonb:=(e->>'online-tournament:mock-match-runtime:v1')::jsonb;
 old_life jsonb; old_rounds jsonb; old_results jsonb; old_runtime jsonb;
 roster text[]; valid_stage text[]; f jsonb; pair jsonb; participant text; seen text[]; bye_count int; round_key text; seen_rounds text[]:='{}'; prefix text;
 k text; v jsonb; row_item jsonb; suffix text; sid text; rn int; mi int; found_round jsonb; old_f jsonb; new_f jsonb;
begin
 select coalesce(array_agg(value),'{}') into roster from jsonb_each_text(t->'participantIds');
 select coalesce(array_agg(value->>'id'),'{}') into valid_stage from jsonb_array_elements(t->'stages');
 if exists(select 1 from unnest(roster) r where starts_with(r,'ot:slot:')) then raise exception 'reserved participant identity' using errcode='22023'; end if;
 if life ? 'stageEntrants' then
  if jsonb_typeof(life->'stageEntrants') is distinct from 'object' then raise exception 'invalid stage entrant map' using errcode='22023'; end if;
  for k,v in select key,value from jsonb_each(life->'stageEntrants') loop
   if not(k=any(valid_stage)) or jsonb_typeof(v) is distinct from 'array' then raise exception 'unknown entrant stage' using errcode='22023'; end if;
   if exists(select 1 from jsonb_array_elements(v) j where jsonb_typeof(j) is distinct from 'string' or not((j#>>'{}')=any(roster))) or (select count(distinct j) from jsonb_array_elements(v) j)<>jsonb_array_length(v) then raise exception 'invalid stage entrants' using errcode='22023'; end if;
  end loop;
 end if;
 for f in select value from jsonb_array_elements(rounds) loop
  sid:=f->>'stageId';
  if not exists(select 1 from jsonb_array_elements(t->'stages') s where s->>'id'=sid and s->>'type'='SWISS')
   or not coalesce(f->>'round' ~ '^[1-9][0-9]{0,3}$',false) or jsonb_typeof(f->'pairs') is distinct from 'array'
   or not coalesce(life->'startedStageIds' ? sid,false) then raise exception 'invalid Swiss fixture round' using errcode='22023'; end if;
  round_key:=sid||':'||(f->>'round');
  if round_key=any(seen_rounds) then raise exception 'duplicate Swiss fixture round' using errcode='22023'; end if;
  seen_rounds:=array_append(seen_rounds,round_key); seen:='{}'; bye_count:=0;
  for pair in select value from jsonb_array_elements(f->'pairs') loop
   if jsonb_typeof(pair) is distinct from 'array' then raise exception 'invalid Swiss pair' using errcode='22023'; end if;
   if jsonb_array_length(pair)<>2 or jsonb_typeof(pair->0) is distinct from 'string' or jsonb_typeof(pair->1) is distinct from 'string' then raise exception 'invalid Swiss pair' using errcode='22023'; end if;
   foreach participant in array array[pair->>0,pair->>1] loop
    if participant='ot:slot:bye' then
     bye_count:=bye_count+1;
     if pair->>1<>'ot:slot:bye' or pair->>0='ot:slot:bye' or bye_count>1 then raise exception 'invalid Swiss bye' using errcode='22023'; end if;
    else
     if not(participant=any(roster)) or participant=any(seen) then raise exception 'invalid or duplicate Swiss participant' using errcode='22023'; end if;
     seen:=array_append(seen,participant);
    end if;
   end loop;
  end loop;
 end loop;
 -- For regular Swiss games with sporting/start evidence, enforce the
 -- actual indexed pairing. Cancellation placeholders need no score.
 for row_item in select value from jsonb_array_elements(results||runtime) loop
  select s->>'id' into sid from jsonb_array_elements(t->'stages') s where s->>'type'='SWISS' and starts_with(row_item->>'matchId',(s->>'id')||'-');
  if sid is null then continue; end if;
  suffix:=substring(row_item->>'matchId' from length(sid)+2);
  if suffix !~ '^sw-r[1-9][0-9]{0,3}-m[1-9][0-9]{0,5}$' then continue; end if;
  if row_item->>'status'='CANCELLED' and row_item->>'startedAt' is null then continue; end if;
  rn:=substring(suffix from '^sw-r([0-9]+)-')::int; mi:=substring(suffix from '-m([0-9]+)$')::int;
  select value into found_round from jsonb_array_elements(rounds) where value->>'stageId'=sid and (value->>'round')::int=rn;
  if found_round is null or mi>jsonb_array_length(found_round->'pairs') or found_round->'pairs'->(mi-1)->>1='ot:slot:bye' then raise exception 'unknown or unplayable Swiss match' using errcode='22023'; end if;
 end loop;
 if tg_op='UPDATE' then
  old_life:=((old.payload->'entries'->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0;
  if not coalesce(coalesce(life->'startedStageIds','[]'::jsonb) @> coalesce(old_life->'startedStageIds','[]'::jsonb),false) then raise exception 'started phase evidence cannot be removed' using errcode='22023'; end if;
  old_rounds:=(old.payload->'entries'->>'online-tournament:swiss-round-fixtures:v1')::jsonb;
  old_results:=(old.payload->'entries'->>'online-tournament:mock-match-results:v2')::jsonb;
  old_runtime:=(old.payload->'entries'->>'online-tournament:mock-match-runtime:v1')::jsonb;
  for old_f in select value from jsonb_array_elements(old_rounds) loop
   sid:=old_f->>'stageId'; prefix:=sid||'-sw-r'||(old_f->>'round')||'-m';
   if exists(select 1 from jsonb_array_elements(old_results||old_runtime) r where starts_with(r->>'matchId',prefix) and (r->>'startedAt' is not null or r->>'status'='FINISHED' or jsonb_array_length(coalesce(r->'sets','[]'::jsonb))>0)) then
    select value into new_f from jsonb_array_elements(rounds) where value->>'stageId'=sid and value->>'round'=old_f->>'round';
    if new_f->'pairs' is distinct from old_f->'pairs' then raise exception 'played Swiss pairing cannot be changed' using errcode='22023'; end if;
   end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function tournament_private.validate_online_pairings() from public,anon,authenticated;
create trigger zzzzz_validate_online_pairings before insert or update on tournament_private.online_tournaments
for each row execute function tournament_private.validate_online_pairings();
