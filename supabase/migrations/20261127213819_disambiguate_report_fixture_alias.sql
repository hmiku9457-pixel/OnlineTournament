CREATE OR REPLACE FUNCTION tournament_private.publish_report_fixtures(p_id text, p_token uuid, p_revision integer, p_fixtures jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 delete from tournament_private.online_result_reports r where r.tournament_id=p_id and not exists(select 1 from tournament_private.online_report_fixtures existing_fixture
 where existing_fixture.tournament_id=r.tournament_id and existing_fixture.match_id=r.match_id and existing_fixture.a_id=r.a_id and existing_fixture.b_id=r.b_id and existing_fixture.started_at=r.started_at and existing_fixture.best_of=r.best_of and existing_fixture.requires_winner=r.requires_winner);
 return true;
end $function$
