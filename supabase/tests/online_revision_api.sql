-- Run against a development database only. All fixtures are rolled back.
begin;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-0000000000a1','online-test-a@example.invalid'),('00000000-0000-4000-8000-0000000000b2','online-test-b@example.invalid');
set local role authenticated;
do $$
declare
  v_id text := 'local-rpc-test';
  v_payload jsonb;
  v_entries jsonb;
  v_invalid jsonb;
  op1 uuid := '10000000-0000-4000-8000-000000000001';
  op2 uuid := '10000000-0000-4000-8000-000000000002';
  op3 uuid := '10000000-0000-4000-8000-000000000003';
begin
 v_entries := jsonb_build_object(
   'online-tournament:local-prototype-tournaments:v1:record:local-rpc-test',
   '{"sortOrder":1,"tournament":{"id":"local-rpc-test","name":"Test","status":"READY","visibility":"PRIVATE","discipline":"SINGLES","hasStarted":false,"tables":2,"participantNames":["A","B"],"participantIds":{"A":"p-a","B":"p-b"},"stages":[{"id":"local-rpc-test-phase-1","tournamentId":"local-rpc-test","type":"ROUND_ROBIN","settings":{}}]}}',
   'online-tournament:mock-draw-config:v1','[]','online-tournament:mock-phase-lifecycle:v1','[]',
   'online-tournament:mock-audit:v1','[]','online-tournament:mock-inline-breaks:v2','[]',
   'online-tournament:group-cutoff-decisions:v1','[]','online-tournament:mock-match-results:v2','[]',
   'online-tournament:mock-match-runtime:v1','[]','online-tournament:swiss-round-fixtures:v1','[]',
   'online-tournament:withdrawn-participants:v1','{}','online-tournament:withdrawal-timing:v1','{}',
   'online-tournament:withdrawal-restore:v1','{}','online-tournament:mock-blocked-tables:v1','{}',
   'online-tournament:swiss-cutoff-decisions:v1','{}','online-tournament:swiss-round-robin-history:v1','{}',
   'online-tournament:swiss-extra-rounds:v1','{}');
 v_payload := jsonb_build_object('version',1,'tournamentId',v_id,'exportedAt','2026-11-27T00:00:00Z','entries',v_entries);
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
 if public.commit_online_tournament(v_id,'Test',0,op1,v_payload) <> 1 then raise exception 'create'; end if;
 if public.commit_online_tournament(v_id,'Test',0,op1,v_payload) <> 1 then raise exception 'retry'; end if;
 if public.commit_online_tournament(v_id,'Test',1,op2,v_payload) <> 2 then raise exception 'update'; end if;
 if public.commit_online_tournament(v_id,'Test',0,op1,v_payload) <> 1 then raise exception 'late retry'; end if;
 begin perform public.commit_online_tournament(v_id,'Test',1,op3,v_payload); raise exception 'stale update accepted'; exception when serialization_failure then null; end;
 begin perform public.commit_online_tournament(v_id,'Test',2,op2,v_payload); raise exception 'operation reuse accepted'; exception when invalid_parameter_value then null; end;
 v_invalid := jsonb_set(v_payload,'{entries}',v_entries-'online-tournament:mock-match-results:v2');
 begin perform public.commit_online_tournament(v_id,'Test',2,op3,v_invalid); raise exception 'incomplete snapshot accepted'; exception when invalid_parameter_value then null; end;
 v_invalid := jsonb_set(v_payload,'{entries}',v_entries || jsonb_build_object('online-tournament:mock-match-results:v2','[{"matchId":"local-foreign-phase-1-match-1"}]'));
 begin perform public.commit_online_tournament(v_id,'Test',2,op3,v_invalid); raise exception 'foreign match accepted'; exception when invalid_parameter_value then null; end;
 if (select count(*) from public.list_online_checkpoints(v_id)) <> 2 then raise exception 'checkpoint count'; end if;
 if public.load_online_checkpoint(v_id,1) is distinct from v_payload then raise exception 'checkpoint payload'; end if;
 if (public.load_online_tournament(v_id)->>'revision')::int <> 2 then raise exception 'wrong revision'; end if;
 if (select count(*) from public.list_online_tournaments() where id=v_id) <> 1 then raise exception 'list'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b2',true);
 begin perform public.load_online_checkpoint(v_id,1); raise exception 'foreign checkpoint read'; exception when insufficient_privilege then null; end;
 begin perform public.list_online_checkpoints(v_id); raise exception 'foreign checkpoint list'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.list_online_tournaments() where id=v_id) then raise exception 'cross-owner list'; end if;
 begin perform public.load_online_tournament(v_id); raise exception 'cross-owner read'; exception when insufficient_privilege then null; end;
 begin perform public.commit_online_tournament(v_id,'Test',2,op3,v_payload); raise exception 'cross-owner update'; exception when insufficient_privilege then null; end;
 begin perform public.commit_online_tournament(v_id,'Test',0,op3,v_payload); raise exception 'cross-owner create'; exception when insufficient_privilege then null; end;
 if has_table_privilege('authenticated','tournament_private.online_tournaments','UPDATE') or has_function_privilege('anon','public.commit_online_tournament(text,text,integer,uuid,jsonb)','EXECUTE') then raise exception 'privilege leak'; end if;
end $$;
rollback;
select 'create, retry, update, conflict, owner isolation passed' as result;
