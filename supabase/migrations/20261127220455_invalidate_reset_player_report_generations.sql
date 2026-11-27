-- A reset invalidates every older confirmation, including older clients.
create table tournament_private.online_report_generations (
 tournament_id text not null references tournament_private.online_tournaments(id) on delete cascade,
 match_id text not null, generation integer not null check(generation>0),
 primary key(tournament_id,match_id)
);
alter table tournament_private.online_report_generations enable row level security;
revoke all on tournament_private.online_report_generations from public,anon,authenticated;
CREATE OR REPLACE FUNCTION tournament_private.submit_player_report_v2(p_token uuid, p_match_id text, p_revision integer, p_sets jsonb, p_generation integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l tournament_private.online_player_links; f tournament_private.online_report_fixtures; t tournament_private.online_tournaments; s jsonb; n integer:=0; previous jsonb;
begin
 select * into l from tournament_private.online_player_links where token=p_token;
 if not found then raise exception 'player link unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(l.tournament_id,0));
 select * into l from tournament_private.online_player_links where token=p_token;
 if not found then raise exception 'player link unavailable' using errcode='42501'; end if;
 select * into t from tournament_private.online_tournaments where id=l.tournament_id;
 select * into f from tournament_private.online_report_fixtures where tournament_id=l.tournament_id and match_id=p_match_id;
 if not found or l.participant_id not in (f.a_id,f.b_id) or exists(select 1 from tournament_private.online_archives where tournament_id=l.tournament_id) then raise exception 'match unavailable' using errcode='42501'; end if;
 if p_generation is distinct from coalesce((select generation from tournament_private.online_report_generations where tournament_id=l.tournament_id and match_id=f.match_id),0) then raise exception 'report reset or changed' using errcode='40001'; end if;
 if t.revision is distinct from p_revision or not tournament_private.report_fixture_live(f,t) then raise exception 'match state changed' using errcode='40001'; end if;
 if jsonb_typeof(p_sets) is distinct from 'array' or jsonb_array_length(p_sets)<1 or jsonb_array_length(p_sets)>99 or octet_length(p_sets::text)>16384 then raise exception 'invalid score' using errcode='22023'; end if;
 for s in select value from jsonb_array_elements(p_sets) loop
  n:=n+1;
  if jsonb_typeof(s) is distinct from 'object' or (s-array['number','sideAScore','sideBScore'])<>'{}'::jsonb or s->>'number' is distinct from n::text
   or not coalesce(s->>'sideAScore' ~ '^[0-9]{1,12}$',false) or not coalesce(s->>'sideBScore' ~ '^[0-9]{1,12}$',false) then raise exception 'invalid score' using errcode='22023'; end if;
 end loop;
 if not coalesce(tournament_private.valid_online_score(tournament_private.report_sport(tournament_private.report_header(t.id,t.payload)),f.best_of,p_sets,true,f.requires_winner,null),false) then raise exception 'invalid sport result' using errcode='22023'; end if;
 select sets into previous from tournament_private.online_result_reports where tournament_id=l.tournament_id and match_id=f.match_id and participant_id=l.participant_id;
 if found then
  if previous is distinct from p_sets then raise exception 'report already submitted' using errcode='22023'; end if;
  return true;
 end if;
 insert into tournament_private.online_result_reports(tournament_id,match_id,participant_id,a_id,b_id,started_at,best_of,requires_winner,sets)
 values(l.tournament_id,f.match_id,l.participant_id,f.a_id,f.b_id,f.started_at,f.best_of,f.requires_winner,p_sets);
 return true;
end $function$
;
-- Old clients can still submit untouched fixtures; reset fixtures require v2.
create or replace function tournament_private.submit_player_report(p_token uuid,p_match_id text,p_revision integer,p_sets jsonb)
returns boolean language sql security definer set search_path='' as $$
 select tournament_private.submit_player_report_v2(p_token,p_match_id,p_revision,p_sets,0);
$$;
CREATE OR REPLACE FUNCTION tournament_private.report_rows(p_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('matchId',f.match_id,'aId',f.a_id,'bId',f.b_id,'startedAt',f.started_at,'generation',coalesce(g.generation,0),'bestOf',f.best_of,'requiresWinner',f.requires_winner,
 'aSets',a.sets,'bSets',b.sets,'revision',f.revision) order by f.match_id),'[]'::jsonb)
 from tournament_private.online_report_fixtures f join tournament_private.online_tournaments t on t.id=f.tournament_id
 left join tournament_private.online_result_reports a on a.tournament_id=f.tournament_id and a.match_id=f.match_id and a.participant_id=f.a_id
 left join tournament_private.online_result_reports b on b.tournament_id=f.tournament_id and b.match_id=f.match_id and b.participant_id=f.b_id
 left join tournament_private.online_report_generations g on g.tournament_id=f.tournament_id and g.match_id=f.match_id
 where f.tournament_id=p_id and tournament_private.report_fixture_live(f,t);
$function$
;
CREATE OR REPLACE FUNCTION tournament_private.read_player_reports(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l tournament_private.online_player_links; h jsonb;
begin
 select * into l from tournament_private.online_player_links where token=p_token;
 if not found or exists(select 1 from tournament_private.online_archives where tournament_id=l.tournament_id) then return null; end if;
 select tournament_private.report_header(t.id,t.payload) into h from tournament_private.online_tournaments t where t.id=l.tournament_id;
 return (select coalesce(jsonb_agg(jsonb_build_object('matchId',r->>'matchId','side',case when r->>'aId'=l.participant_id then 'A' else 'B' end,
 'sideA',(select i.key from jsonb_each_text(h->'participantIds') i where i.value=r->>'aId'),'sideB',(select i.key from jsonb_each_text(h->'participantIds') i where i.value=r->>'bId'),
 'startedAt',r->'startedAt','generation',r->'generation','bestOf',r->'bestOf','requiresWinner',r->'requiresWinner','revision',r->'revision','aSets',r->'aSets','bSets',r->'bSets')),'[]'::jsonb)
 from jsonb_array_elements(tournament_private.report_rows(l.tournament_id)) r where l.participant_id in (r->>'aId',r->>'bId'));
end $function$
;
CREATE OR REPLACE FUNCTION tournament_private.reset_reports(p_id text, p_token uuid, p_match_id text, p_revision integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 if not exists(select 1 from tournament_private.online_tournaments where id=p_id and owner_id=tournament_private.owner_account() and revision=p_revision) then raise exception 'tournament unavailable or changed' using errcode='42501'; end if;
 if not exists(select 1 from tournament_private.online_workspace_leases where tournament_id=p_id and token=p_token and expires_at>clock_timestamp()) then raise exception 'workspace lease missing or expired' using errcode='55P03'; end if;
 if not exists(select 1 from tournament_private.online_report_fixtures where tournament_id=p_id and match_id=p_match_id and revision=p_revision) then raise exception 'match unavailable or changed' using errcode='40001'; end if;
 insert into tournament_private.online_report_generations(tournament_id,match_id,generation) values(p_id,p_match_id,1)
 on conflict(tournament_id,match_id) do update set generation=tournament_private.online_report_generations.generation+1;
 delete from tournament_private.online_result_reports where tournament_id=p_id and match_id=p_match_id;
 return true;
end $function$
;
create function public.submit_online_player_report_v2(p_token uuid,p_match_id text,p_revision integer,p_sets jsonb,p_generation integer)
returns boolean language sql security invoker set search_path='' as $$
 select tournament_private.submit_player_report_v2(p_token,p_match_id,p_revision,p_sets,p_generation);
$$;
revoke all on function tournament_private.submit_player_report_v2(uuid,text,integer,jsonb,integer),public.submit_online_player_report_v2(uuid,text,integer,jsonb,integer) from public,anon,authenticated;
grant execute on function tournament_private.submit_player_report_v2(uuid,text,integer,jsonb,integer),public.submit_online_player_report_v2(uuid,text,integer,jsonb,integer) to anon,authenticated;
