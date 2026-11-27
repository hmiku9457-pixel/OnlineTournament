-- Player reports are proposals, never writes to the sporting snapshot.
create table tournament_private.online_report_fixtures (
 tournament_id text not null references tournament_private.online_tournaments(id) on delete cascade,
 match_id text not null, revision integer not null,
 a_id text not null,b_id text not null, started_at bigint not null,
 best_of integer not null, requires_winner boolean not null,
 primary key(tournament_id,match_id)
);
create table tournament_private.online_result_reports (
 tournament_id text not null references tournament_private.online_tournaments(id) on delete cascade,
 match_id text not null, participant_id text not null,
 a_id text not null,b_id text not null,started_at bigint not null,best_of integer not null,requires_winner boolean not null,
 sets jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(tournament_id,match_id,participant_id)
);
alter table tournament_private.online_report_fixtures enable row level security;
alter table tournament_private.online_result_reports enable row level security;
revoke all on tournament_private.online_report_fixtures,tournament_private.online_result_reports from public,anon,authenticated;
create function tournament_private.report_header(p_id text,p_payload jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$ select ((p_payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||p_id))::jsonb)->'tournament'; $$;
create function tournament_private.report_sport(h jsonb) returns text
language sql immutable security invoker set search_path='' as $$ select case lower(h->>'sport') when 'tischtennis' then 'table_tennis' when 'fußball' then 'football' when 'beachvolleyball' then 'beach_volleyball' when 'eishockey' then 'ice_hockey' else lower(h->>'sport') end; $$;
-- Recheck against the actual current snapshot, not just the presentation.
create function tournament_private.report_fixture_live(f tournament_private.online_report_fixtures,t tournament_private.online_tournaments) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(t.revision=f.revision and tournament_private.report_header(t.id,t.payload)->>'status' in ('RUNNING','PAUSED')
 and exists(select 1 from jsonb_array_elements((t.payload->'entries'->>'online-tournament:mock-match-runtime:v1')::jsonb) r
 where r->>'matchId'=f.match_id and r->>'status' in ('LIVE','READY') and r->>'startedAt'=f.started_at::text and r->>'table' ~ '^Tisch [1-9][0-9]*$')
 and not exists(select 1 from jsonb_array_elements((t.payload->'entries'->>'online-tournament:mock-match-results:v2')::jsonb) r
 where r->>'matchId'=f.match_id and (r->>'status' in ('FINISHED','CANCELLED','CONFIRMATION') or jsonb_array_length(coalesce(r->'sets','[]'::jsonb))>0 or r ? 'forcedWinner' or r ? 'extraTimeProgress')),false);
$$;
create function tournament_private.publish_report_fixtures(p_id text,p_token uuid,p_revision integer,p_fixtures jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner uuid:=tournament_private.owner_account(); t tournament_private.online_tournaments; h jsonb; j jsonb; f tournament_private.online_report_fixtures;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 select * into t from tournament_private.online_tournaments where id=p_id and owner_id=owner;
 if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if not exists(select 1 from tournament_private.online_workspace_leases where tournament_id=p_id and token=p_token and expires_at>clock_timestamp()) then raise exception 'workspace lease missing or expired' using errcode='55P03'; end if;
 if t.revision is distinct from p_revision then raise exception 'revision conflict' using errcode='40001'; end if;
 if jsonb_typeof(p_fixtures) is distinct from 'array' or jsonb_array_length(p_fixtures)>500 or octet_length(p_fixtures::text)>524288 then raise exception 'invalid fixtures' using errcode='22023'; end if;
 h:=tournament_private.report_header(p_id,t.payload);
 delete from tournament_private.online_report_fixtures where tournament_id=p_id;
 for j in select value from jsonb_array_elements(p_fixtures) loop
  if jsonb_typeof(j) is distinct from 'object' or (j-array['matchId','aId','bId','startedAt','bestOf','requiresWinner'])<>'{}'::jsonb
   or not coalesce(starts_with(j->>'matchId',p_id||'-phase-'),false)
   or not coalesce(j->>'startedAt' ~ '^[1-9][0-9]{0,14}$',false) or not coalesce(j->>'bestOf' ~ '^[1-9][0-9]?$' ,false)
   or jsonb_typeof(j->'requiresWinner') is distinct from 'boolean'
   or not exists(select 1 from jsonb_each_text(h->'participantIds') i where i.value=j->>'aId')
   or not exists(select 1 from jsonb_each_text(h->'participantIds') i where i.value=j->>'bId')
   or j->>'aId'=j->>'bId' then raise exception 'invalid fixture' using errcode='22023'; end if;
  f:=row(p_id,j->>'matchId',p_revision,j->>'aId',j->>'bId',(j->>'startedAt')::bigint,(j->>'bestOf')::integer,(j->>'requiresWinner')::boolean);
  if not tournament_private.report_fixture_live(f,t) then raise exception 'fixture is not reportable' using errcode='22023'; end if;
  insert into tournament_private.online_report_fixtures values(f.*);
 end loop;
 -- Proposals survive unrelated revisions but never a changed match identity.
 delete from tournament_private.online_result_reports r where r.tournament_id=p_id and not exists(select 1 from tournament_private.online_report_fixtures f
 where f.tournament_id=r.tournament_id and f.match_id=r.match_id and f.a_id=r.a_id and f.b_id=r.b_id and f.started_at=r.started_at and f.best_of=r.best_of and f.requires_winner=r.requires_winner);
 return true;
end $$;
create function tournament_private.submit_player_report(p_token uuid,p_match_id text,p_revision integer,p_sets jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
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
end $$;
create function tournament_private.report_rows(p_id text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('matchId',f.match_id,'aId',f.a_id,'bId',f.b_id,'startedAt',f.started_at,'bestOf',f.best_of,'requiresWinner',f.requires_winner,
 'aSets',a.sets,'bSets',b.sets,'revision',f.revision) order by f.match_id),'[]'::jsonb)
 from tournament_private.online_report_fixtures f join tournament_private.online_tournaments t on t.id=f.tournament_id
 left join tournament_private.online_result_reports a on a.tournament_id=f.tournament_id and a.match_id=f.match_id and a.participant_id=f.a_id
 left join tournament_private.online_result_reports b on b.tournament_id=f.tournament_id and b.match_id=f.match_id and b.participant_id=f.b_id
 where f.tournament_id=p_id and tournament_private.report_fixture_live(f,t);
$$;
create function tournament_private.read_player_reports(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l tournament_private.online_player_links; h jsonb;
begin
 select * into l from tournament_private.online_player_links where token=p_token;
 if not found or exists(select 1 from tournament_private.online_archives where tournament_id=l.tournament_id) then return null; end if;
 select tournament_private.report_header(t.id,t.payload) into h from tournament_private.online_tournaments t where t.id=l.tournament_id;
 return (select coalesce(jsonb_agg(jsonb_build_object('matchId',r->>'matchId','side',case when r->>'aId'=l.participant_id then 'A' else 'B' end,
 'sideA',(select i.key from jsonb_each_text(h->'participantIds') i where i.value=r->>'aId'),'sideB',(select i.key from jsonb_each_text(h->'participantIds') i where i.value=r->>'bId'),
 'bestOf',r->'bestOf','requiresWinner',r->'requiresWinner','revision',r->'revision','aSets',r->'aSets','bSets',r->'bSets')),'[]'::jsonb)
 from jsonb_array_elements(tournament_private.report_rows(l.tournament_id)) r where l.participant_id in (r->>'aId',r->>'bId'));
end $$;
create function tournament_private.owner_reports(p_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from tournament_private.online_tournaments where id=p_id and owner_id=tournament_private.owner_account()) then raise exception 'tournament unavailable' using errcode='42501'; end if;
 return tournament_private.report_rows(p_id);
end $$;
create function tournament_private.reset_reports(p_id text,p_token uuid,p_match_id text,p_revision integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 if not exists(select 1 from tournament_private.online_tournaments where id=p_id and owner_id=tournament_private.owner_account() and revision=p_revision) then raise exception 'tournament unavailable or changed' using errcode='42501'; end if;
 if not exists(select 1 from tournament_private.online_workspace_leases where tournament_id=p_id and token=p_token and expires_at>clock_timestamp()) then raise exception 'workspace lease missing or expired' using errcode='55P03'; end if;
 delete from tournament_private.online_result_reports where tournament_id=p_id and match_id=p_match_id;
 return true;
end $$;
create function public.publish_online_report_fixtures(p_id text,p_token uuid,p_revision integer,p_fixtures jsonb) returns boolean language sql security invoker set search_path='' as $$select tournament_private.publish_report_fixtures(p_id,p_token,p_revision,p_fixtures);$$;
create function public.submit_online_player_report(p_token uuid,p_match_id text,p_revision integer,p_sets jsonb) returns boolean language sql security invoker set search_path='' as $$select tournament_private.submit_player_report(p_token,p_match_id,p_revision,p_sets);$$;
create function public.read_online_player_reports(p_token uuid) returns jsonb language sql stable security invoker set search_path='' as $$select tournament_private.read_player_reports(p_token);$$;
create function public.list_online_result_reports(p_id text) returns jsonb language sql stable security invoker set search_path='' as $$select tournament_private.owner_reports(p_id);$$;
create function public.reset_online_result_reports(p_id text,p_token uuid,p_match_id text,p_revision integer) returns boolean language sql security invoker set search_path='' as $$select tournament_private.reset_reports(p_id,p_token,p_match_id,p_revision);$$;
revoke all on function tournament_private.report_header(text,jsonb),tournament_private.report_sport(jsonb),tournament_private.report_fixture_live(tournament_private.online_report_fixtures,tournament_private.online_tournaments),tournament_private.report_rows(text),tournament_private.publish_report_fixtures(text,uuid,integer,jsonb),tournament_private.submit_player_report(uuid,text,integer,jsonb),tournament_private.read_player_reports(uuid),tournament_private.owner_reports(text),tournament_private.reset_reports(text,uuid,text,integer),public.publish_online_report_fixtures(text,uuid,integer,jsonb),public.submit_online_player_report(uuid,text,integer,jsonb),public.read_online_player_reports(uuid),public.list_online_result_reports(text),public.reset_online_result_reports(text,uuid,text,integer) from public,anon,authenticated;
grant execute on function tournament_private.publish_report_fixtures(text,uuid,integer,jsonb),tournament_private.owner_reports(text),tournament_private.reset_reports(text,uuid,text,integer),public.publish_online_report_fixtures(text,uuid,integer,jsonb),public.list_online_result_reports(text),public.reset_online_result_reports(text,uuid,text,integer) to authenticated;
grant execute on function tournament_private.submit_player_report(uuid,text,integer,jsonb),tournament_private.read_player_reports(uuid),public.submit_online_player_report(uuid,text,integer,jsonb),public.read_online_player_reports(uuid) to anon,authenticated;
