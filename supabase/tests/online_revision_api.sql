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
  v_header jsonb;
  v_live jsonb;
  v_corrected jsonb;
  v_later jsonb;
  v_match jsonb;
  lease1 uuid := '20000000-0000-4000-8000-000000000001';
  lease2 uuid := '20000000-0000-4000-8000-000000000002';
  op1 uuid := '10000000-0000-4000-8000-000000000001';
  op2 uuid := '10000000-0000-4000-8000-000000000002';
  op3 uuid := '10000000-0000-4000-8000-000000000003';
begin
 v_entries := jsonb_build_object(
   'online-tournament:local-prototype-tournaments:v1:record:local-rpc-test',
   '{"sortOrder":1,"tournament":{"id":"local-rpc-test","name":"Test","status":"READY","visibility":"PRIVATE","discipline":"SINGLES","sport":"Tischtennis","hasStarted":false,"tables":2,"participantNames":["A","B"],"participantIds":{"A":"p-a","B":"p-b"},"stages":[{"id":"local-rpc-test-phase-1","tournamentId":"local-rpc-test","type":"ROUND_ROBIN","bestOf":1,"settings":{}}]}}',
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
 if not public.set_online_tournament_archive(v_id,1,true) then raise exception 'archive failed'; end if;
 if not exists(select 1 from public.catalog_online_tournaments() c where c.id=v_id and c.archived_at is not null and c.status='READY') then raise exception 'archive catalog'; end if;
 if public.load_online_tournament(v_id)->'payload' is distinct from v_payload then raise exception 'archived backup unavailable'; end if;
 begin perform public.claim_online_workspace(v_id,lease1,false); raise exception 'archived event claimed'; exception when object_not_in_prerequisite_state then null; end;
 if not public.set_online_tournament_archive(v_id,1,false) then raise exception 'unarchive failed'; end if;
 begin perform public.set_online_tournament_archive(v_id,0,true); raise exception 'stale archive accepted'; exception when serialization_failure then null; end;
 if not public.claim_online_workspace(v_id,lease1,false) then raise exception 'claim failed'; end if;
 begin perform public.set_online_tournament_archive(v_id,1,true); raise exception 'active workspace archived'; exception when lock_not_available then null; end;
 if public.claim_online_workspace(v_id,lease2,false) then raise exception 'second workspace acquired'; end if;
 if not public.claim_online_workspace(v_id,lease1,true) then raise exception 'renew failed'; end if;
 if public.release_online_workspace(v_id,lease2) then raise exception 'foreign token released lease'; end if;
 begin perform public.commit_online_tournament(v_id,'Test',1,op2,v_payload); raise exception 'old API bypass'; exception when lock_not_available then null; end;
 begin perform public.commit_leased_online_tournament(v_id,'Test',1,op2,v_payload,lease2); raise exception 'wrong lease write'; exception when lock_not_available then null; end;
 if public.commit_leased_online_tournament(v_id,'Test',1,op2,v_payload,lease1) <> 2 then raise exception 'update'; end if;
 if public.commit_online_tournament(v_id,'Test',0,op1,v_payload) <> 1 then raise exception 'late retry'; end if;
 begin perform public.commit_leased_online_tournament(v_id,'Test',1,op3,v_payload,lease1); raise exception 'stale update accepted'; exception when serialization_failure then null; end;
 begin perform public.commit_leased_online_tournament(v_id,'Test',2,op2,v_payload,lease1); raise exception 'operation reuse accepted'; exception when invalid_parameter_value then null; end;
 v_invalid := jsonb_set(v_payload,'{entries}',v_entries-'online-tournament:mock-match-results:v2');
 begin perform public.commit_leased_online_tournament(v_id,'Test',2,op3,v_invalid,lease1); raise exception 'incomplete snapshot accepted'; exception when invalid_parameter_value then null; end;
 v_invalid := jsonb_set(v_payload,'{entries}',v_entries || jsonb_build_object('online-tournament:mock-match-results:v2','[{"matchId":"local-foreign-phase-1-match-1"}]'));
 begin perform public.commit_leased_online_tournament(v_id,'Test',2,op3,v_invalid,lease1); raise exception 'foreign match accepted'; exception when invalid_parameter_value then null; end;
 v_invalid := jsonb_set(v_payload,'{entries}',v_entries || jsonb_build_object('online-tournament:mock-match-results:v2','[{"matchId":"local-rpc-test-phase-1-m1","status":"FINISHED","sets":[{"number":1,"sideAScore":-1,"sideBScore":11}]}]'));
 begin perform public.commit_leased_online_tournament(v_id,'Test',2,op3,v_invalid,lease1); raise exception 'negative score accepted'; exception when invalid_parameter_value then null; end;
 v_invalid := jsonb_set(v_payload,'{entries}',v_entries || jsonb_build_object('online-tournament:mock-phase-lifecycle:v1','[{"tournamentId":"local-rpc-test","startedStageIds":[],"completedStageIds":["local-rpc-test-phase-1"]}]'));
 begin perform public.commit_leased_online_tournament(v_id,'Test',2,op3,v_invalid,lease1); raise exception 'unstarted phase completed'; exception when invalid_parameter_value then null; end;
 v_invalid := jsonb_set(v_payload,'{entries}',v_entries || jsonb_build_object('online-tournament:mock-phase-lifecycle:v1','[{"tournamentId":"local-rpc-test","startedStageIds":["local-rpc-test-phase-1"],"completedStageIds":[]}]','online-tournament:mock-match-runtime:v1','[{"matchId":"local-rpc-test-phase-1-m1","status":"LIVE","table":"Tisch 1"},{"matchId":"local-rpc-test-phase-1-m2","status":"LIVE","table":"Tisch 1"}]'));
 begin perform public.commit_leased_online_tournament(v_id,'Test',2,op3,v_invalid,lease1); raise exception 'duplicate table accepted'; exception when invalid_parameter_value then null; end;
 v_invalid := jsonb_set(v_payload,'{entries}',v_entries || jsonb_build_object('online-tournament:mock-match-results:v2','[{"matchId":"local-rpc-test-phase-1-m1","status":"FINISHED","sets":[{"number":1,"sideAScore":9,"sideBScore":7}]}]'));
 begin perform public.commit_leased_online_tournament(v_id,'Test',2,op3,v_invalid,lease1); raise exception 'invalid TT set accepted'; exception when invalid_parameter_value then null; end;
 if (select count(*) from public.list_online_checkpoints(v_id)) <> 2 then raise exception 'checkpoint count'; end if;
 if public.load_online_checkpoint(v_id,1) is distinct from v_payload then raise exception 'checkpoint payload'; end if;
 if (public.load_online_tournament(v_id)->>'revision')::int <> 2 then raise exception 'wrong revision'; end if;
 if (select count(*) from public.list_online_tournaments() where id=v_id) <> 1 then raise exception 'list'; end if;
 for i in 2..24 loop
   perform public.commit_leased_online_tournament(v_id,'Test',i,gen_random_uuid(),v_payload,lease1);
 end loop;
 if (select count(*) from public.list_online_checkpoints(v_id)) <> 20 then raise exception 'checkpoint retention'; end if;
 if (select min(revision) from public.list_online_checkpoints(v_id)) <> 6 then raise exception 'checkpoint retention order'; end if;
 -- Exercise correction before and after the next Swiss round begins.
 v_header := (v_entries->>'online-tournament:local-prototype-tournaments:v1:record:local-rpc-test')::jsonb;
 v_header := jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_header,'{tournament,status}','"RUNNING"'),'{tournament,hasStarted}','true'),'{tournament,stages,0,type}','"SWISS"'),'{tournament,stages,0,orderIndex}','0');
 v_match := '{"matchId":"local-rpc-test-phase-1-sw-r1-m1","status":"FINISHED","sets":[{"number":1,"sideAScore":11,"sideBScore":7}]}';
 v_live := jsonb_set(v_payload,'{entries}',v_entries || jsonb_build_object(
   'online-tournament:local-prototype-tournaments:v1:record:local-rpc-test',v_header::text,
   'online-tournament:mock-phase-lifecycle:v1','[{"tournamentId":"local-rpc-test","startedStageIds":["local-rpc-test-phase-1"],"completedStageIds":[]}]',
   'online-tournament:mock-match-results:v2',jsonb_build_array(v_match)::text));
 if public.commit_leased_online_tournament(v_id,'Test',25,gen_random_uuid(),v_live,lease1)<>26 then raise exception 'valid initial result rejected'; end if;
 v_corrected := jsonb_set(v_live,'{entries}',(v_live->'entries') || jsonb_build_object('online-tournament:mock-match-results:v2',jsonb_build_array(jsonb_set(v_match,'{sets,0,sideBScore}','8'))::text));
 if public.commit_leased_online_tournament(v_id,'Test',26,gen_random_uuid(),v_corrected,lease1)<>27 then raise exception 'valid correction rejected'; end if;
 v_later := jsonb_set(v_corrected,'{entries}',(v_corrected->'entries') || jsonb_build_object(
   'online-tournament:mock-match-runtime:v1','[{"matchId":"local-rpc-test-phase-1-sw-r2-m1","table":"Noch offen","status":"WAITING","startedAt":12345}]'));
 if public.commit_leased_online_tournament(v_id,'Test',27,gen_random_uuid(),v_later,lease1)<>28 then raise exception 'valid round start rejected'; end if;
 v_invalid := jsonb_set(v_later,'{entries}',(v_later->'entries') || jsonb_build_object('online-tournament:mock-match-results:v2',jsonb_build_array(v_match)::text));
 begin perform public.commit_leased_online_tournament(v_id,'Test',28,gen_random_uuid(),v_invalid,lease1); raise exception 'locked result correction accepted'; exception when invalid_parameter_value then null; end;
 v_invalid := jsonb_set(v_later,'{entries}',(v_later->'entries') || jsonb_build_object('online-tournament:mock-match-results:v2',jsonb_build_array(jsonb_set(v_match,'{sets,0,sideBScore}','8') || '{"reviewConfirmed":true}'::jsonb)::text));
 if public.commit_leased_online_tournament(v_id,'Test',28,gen_random_uuid(),v_invalid,lease1)<>29 then raise exception 'valid review flag rejected'; end if;
 if not public.release_online_workspace(v_id,lease1) then raise exception 'release failed'; end if;
 if public.claim_online_workspace(v_id,lease1,true) then raise exception 'released lease renewed'; end if;
 if not public.claim_online_workspace(v_id,lease2,false) then raise exception 'takeover after release failed'; end if;
 begin perform public.commit_leased_online_tournament(v_id,'Test',29,gen_random_uuid(),v_later,lease1); raise exception 'old token accepted'; exception when lock_not_available then null; end;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b2',true);
 begin perform public.set_online_tournament_archive(v_id,29,true); raise exception 'foreign archive accepted'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.catalog_online_tournaments() c where c.id=v_id) then raise exception 'foreign catalog visible'; end if;
 begin perform public.claim_online_workspace(v_id,lease2,false); raise exception 'foreign lease claimed'; exception when insufficient_privilege then null; end;
 begin perform public.release_online_workspace(v_id,lease2); raise exception 'foreign lease released'; exception when insufficient_privilege then null; end;
 if has_function_privilege('authenticated','tournament_private.commit_online(text,text,integer,uuid,jsonb)','EXECUTE') or has_function_privilege('anon','public.claim_online_workspace(text,uuid,boolean)','EXECUTE') then raise exception 'lease privilege leak'; end if;
 begin perform public.load_online_checkpoint(v_id,25); raise exception 'foreign checkpoint read'; exception when insufficient_privilege then null; end;
 begin perform public.list_online_checkpoints(v_id); raise exception 'foreign checkpoint list'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.list_online_tournaments() where id=v_id) then raise exception 'cross-owner list'; end if;
 begin perform public.load_online_tournament(v_id); raise exception 'cross-owner read'; exception when insufficient_privilege then null; end;
 begin perform public.commit_leased_online_tournament(v_id,'Test',2,op3,v_payload,lease1); raise exception 'cross-owner update'; exception when insufficient_privilege then null; end;
 begin perform public.commit_online_tournament(v_id,'Test',0,op3,v_payload); raise exception 'cross-owner create'; exception when insufficient_privilege then null; end;
 if has_table_privilege('authenticated','tournament_private.online_tournaments','UPDATE') or has_function_privilege('anon','public.commit_online_tournament(text,text,integer,uuid,jsonb)','EXECUTE') then raise exception 'privilege leak'; end if;
end $$;
-- Expire the existing fixture lease without waiting 90 seconds.
reset role;
update tournament_private.online_workspace_leases set expires_at=clock_timestamp()-interval '1 second' where tournament_id='local-rpc-test';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
do $$
declare v_id text:='local-rpc-test'; old_token uuid:='20000000-0000-4000-8000-000000000002'; new_token uuid:='20000000-0000-4000-8000-000000000003'; snapshot jsonb;
begin
  snapshot:=public.load_online_tournament(v_id)->'payload';
  if public.claim_online_workspace(v_id,old_token,true) then raise exception 'expired lease renewed'; end if;
  begin perform public.commit_leased_online_tournament(v_id,'Test',29,gen_random_uuid(),snapshot,old_token); raise exception 'expired lease write accepted'; exception when lock_not_available then null; end;
  if not public.claim_online_workspace(v_id,new_token,false) then raise exception 'expired lease takeover failed'; end if;
  if public.release_online_workspace(v_id,old_token) then raise exception 'old token released new lease'; end if;
  if public.commit_leased_online_tournament(v_id,'Test',29,gen_random_uuid(),snapshot,new_token)<>30 then raise exception 'new owner write failed'; end if;
  perform public.release_online_workspace(v_id,new_token);
  begin perform public.set_online_tournament_archive(v_id,30,true); raise exception 'running event archived'; exception when invalid_parameter_value then null; end;
  begin insert into public.tournament_backups(tournament_id,tournament_name,payload) values(v_id,'Broken','{}'); raise exception 'invalid backup accepted'; exception when check_violation then null; end;
end $$;
rollback;
select 'create, retry, update, conflict, owner isolation passed' as result;
