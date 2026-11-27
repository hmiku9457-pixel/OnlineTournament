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
  bracket_fixture jsonb := '[{"phase":"KO","rounds":[{"label":"Halbfinale","matches":[{"a":{"kind":"participant","name":"A"},"b":{"kind":"bye"},"score":"Freilos","winner":"A","status":"FINISHED","sets":[]}]},{"label":"Finale","matches":[{"a":{"kind":"participant","name":"A"},"b":{"kind":"pending"},"score":"–","winner":"NONE","status":"WAITING","sets":[]}]}]}]';
  ranking_fixture jsonb := '[{"phase":"Liga","label":"Tabelle","kind":"ROUND_ROBIN","rows":[{"rank":1,"name":"A","played":1,"wins":1,"losses":0,"draws":0,"points":3,"buchholz":0.5,"sets":"1:0","setDifference":1,"balls":"11:8","ballDifference":3}]}]';
  detail_match jsonb := '[{"sideA":"A","sideB":"B","phase":"Liga","round":"Runde 1","status":"FINISHED","table":"Noch offen","score":"1:0","sets":[{"sideAScore":11,"sideBScore":8}]}]';
  player_a uuid;
  player_c uuid;
  player_new uuid;
  spectator uuid;
  rotated uuid;
  projection jsonb;
  lease1 uuid := '20000000-0000-4000-8000-000000000001';
  lease2 uuid := '20000000-0000-4000-8000-000000000002';
  op1 uuid := '10000000-0000-4000-8000-000000000001';
  op2 uuid := '10000000-0000-4000-8000-000000000002';
  op3 uuid := '10000000-0000-4000-8000-000000000003';
begin
 v_entries := jsonb_build_object(
   'online-tournament:local-prototype-tournaments:v1:record:local-rpc-test',
   '{"sortOrder":1,"tournament":{"id":"local-rpc-test","name":"Test","status":"READY","visibility":"PRIVATE","discipline":"SINGLES","sport":"Tischtennis","hasStarted":false,"tables":2,"participantNames":["A","B","C"],"participantIds":{"A":"p-a","B":"p-b","C":"p-c"},"stages":[{"id":"local-rpc-test-phase-1","tournamentId":"local-rpc-test","type":"ROUND_ROBIN","bestOf":1,"settings":{}}]}}',
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
 if public.manage_online_spectator(v_id,'read') is not null then raise exception 'spectator enabled by default'; end if;
 spectator:=public.manage_online_spectator(v_id,'enable');
 if spectator is null or public.manage_online_spectator(v_id,'enable') is distinct from spectator then raise exception 'spectator enable not idempotent'; end if;
 projection:=public.read_online_spectator(spectator);
 if projection->>'name'<>'Test' or (projection->>'participantCount')::int<>3 or projection ?| array['payload','entries','participantNames','participantCodes','id','owner_id'] then raise exception 'invalid spectator projection'; end if;
 rotated:=public.manage_online_spectator(v_id,'rotate');
 if rotated=spectator or public.read_online_spectator(spectator) is not null then raise exception 'old link valid'; end if;
 if public.online_player_access_active(v_id) then raise exception 'player links enabled by default'; end if;
 player_a:=public.manage_online_player_access(v_id,'p-a','enable');
 if player_a is null or public.manage_online_player_access(v_id,'p-a','enable') is distinct from player_a then raise exception 'player enable not idempotent'; end if;
 if not public.set_online_tournament_archive(v_id,1,true) then raise exception 'archive failed'; end if;
 if not exists(select 1 from public.catalog_online_tournaments() c where c.id=v_id and c.archived_at is not null and c.status='READY') then raise exception 'archive catalog'; end if;
 if public.load_online_tournament(v_id)->'payload' is distinct from v_payload then raise exception 'archived backup unavailable'; end if;
 begin perform public.claim_online_workspace(v_id,lease1,false); raise exception 'archived event claimed'; exception when object_not_in_prerequisite_state then null; end;
 if public.read_online_player_access(player_a) is not null then raise exception 'archived player link survived'; end if;
 if public.read_online_spectator(rotated) is not null then raise exception 'archive did not revoke spectator'; end if;
 if not public.set_online_tournament_archive(v_id,1,false) then raise exception 'unarchive failed'; end if;
 begin perform public.set_online_tournament_archive(v_id,0,true); raise exception 'stale archive accepted'; exception when serialization_failure then null; end;
 if not public.claim_online_workspace(v_id,lease1,false) then raise exception 'claim failed'; end if;
 if public.publish_online_player_projection(v_id,lease1,1,detail_match,1) then raise exception 'player publication without access'; end if;
 player_a:=public.manage_online_player_access(v_id,'p-a','enable');
 player_c:=public.manage_online_player_access(v_id,'p-c','enable');
 if player_a=player_c or not public.online_player_access_active(v_id) then raise exception 'invalid player link'; end if;
 if (select count(*) from public.list_online_player_access(v_id) where token is not null)<>2 then raise exception 'owner access list'; end if;
 begin perform public.manage_online_player_access(v_id,'foreign','enable'); raise exception 'foreign participant enabled'; exception when invalid_parameter_value then null; end;
 begin perform public.publish_online_player_projection(v_id,lease2,1,detail_match,1); raise exception 'wrong lease published'; exception when lock_not_available then null; end;
 begin perform public.publish_online_player_projection(v_id,lease1,0,detail_match,1); raise exception 'old revision published'; exception when serialization_failure then null; end;
 begin perform public.publish_online_player_projection(v_id,lease1,1,jsonb_set(detail_match,'{0,privateCode}','"1234"'),1); raise exception 'private data exposed'; exception when invalid_parameter_value then null; end;
 if not public.publish_online_player_projection(v_id,lease1,1,detail_match,1) then raise exception 'player publication failed'; end if;
 if public.online_projection_plan_v2(v_id,1)->'player' is distinct from 'true'::jsonb then raise exception 'missing context not planned'; end if;
 if not public.publish_online_player_projection_v2(v_id,lease1,1,detail_match,1,'{"p-a":{"phaseStatus":"Aktiv","placement":null,"lastFinishedAt":12345,"breakUntil":null,"rankings":[{"phase":"Liga","label":"Tabelle","rank":1}]},"p-c":{"phaseStatus":"Nicht qualifiziert","placement":null,"lastFinishedAt":null,"breakUntil":null,"rankings":[]}}') then raise exception 'personal context publication failed'; end if;
 if public.online_projection_plan_v2(v_id,1)->'player' is distinct from 'false'::jsonb then raise exception 'current context planned again'; end if;
 if public.read_online_player_bundle(player_a)->'context'->>'phaseStatus'<>'Aktiv' or public.read_online_player_bundle(player_c)->'context'->>'phaseStatus'<>'Nicht qualifiziert' then raise exception 'private context mismatch'; end if;
 if public.read_online_player_bundle(gen_random_uuid())->'context' is distinct from 'null'::jsonb then raise exception 'foreign context exposed'; end if;
 begin perform public.publish_online_player_projection_v2(v_id,lease1,1,detail_match,1,'{"foreign":{}}'); raise exception 'foreign participant context accepted'; exception when invalid_parameter_value then null; end;

 projection:=public.read_online_player_bundle_v2(player_a,null);
 if projection->'view' is distinct from public.read_online_player_access(player_a) or public.read_online_player_bundle_v2(player_a,projection->>'tag')->'unchanged' is distinct from 'true'::jsonb then raise exception 'conditional player bundle mismatch'; end if;
 if public.read_online_player_bundle_v2(gen_random_uuid(),projection->>'tag')->'view' is distinct from 'null'::jsonb then raise exception 'conditional foreign access'; end if;
 if public.read_online_player_access(player_a)->'matches' is distinct from detail_match then raise exception 'own match missing'; end if;
 if public.read_online_player_access(player_c)->'matches' is distinct from '[]'::jsonb then raise exception 'other player match exposed'; end if;
 if public.read_online_player_access(player_a)->>'participant'<>'A' then raise exception 'wrong identity'; end if;
 player_new:=public.manage_online_player_access(v_id,'p-a','rotate');
 if player_new=player_a or public.read_online_player_access(player_a) is not null then raise exception 'rotated player link survived'; end if;
 perform public.manage_online_player_access(v_id,'p-c','disable');
 if public.read_online_player_access(player_c) is not null then raise exception 'revoked player link survived'; end if;

 spectator:=public.manage_online_spectator(v_id,'enable');
 if public.online_spectator_detail_setting(v_id,null) then raise exception 'details enabled by default'; end if;
 if public.publish_online_spectator_matches(v_id,lease1,1,detail_match,1) then raise exception 'opt out ignored'; end if;
 if not public.online_spectator_detail_setting(v_id,true) then raise exception 'detail enable failed'; end if;
 if public.read_online_spectator_details(spectator)->'matches' is distinct from 'null'::jsonb then raise exception 'unpublished projection visible'; end if;
 begin perform public.publish_online_spectator_matches(v_id,lease2,1,detail_match,1); raise exception 'wrong lease published'; exception when lock_not_available then null; end;
 begin perform public.publish_online_spectator_matches(v_id,lease1,0,detail_match,1); raise exception 'old revision published'; exception when serialization_failure then null; end;
 begin perform public.publish_online_spectator_matches(v_id,lease1,1,jsonb_set(detail_match,'{0,sideA}','"Other"'),1); raise exception 'foreign name published'; exception when invalid_parameter_value then null; end;
 begin perform public.publish_online_spectator_matches(v_id,lease1,1,jsonb_set(detail_match,'{0,privateCode}','"1234"'),1); raise exception 'extra field published'; exception when invalid_parameter_value then null; end;
 if not public.publish_online_spectator_matches(v_id,lease1,1,detail_match,1) then raise exception 'publish failed'; end if;
 if public.online_projection_plan_v2(v_id,1)->'matches' is distinct from 'true'::jsonb then raise exception 'overview republish missing'; end if;
 if not public.publish_online_spectator_matches_v2(v_id,lease1,1,detail_match,1,'{"recent":[{"index":0,"finishedAt":12345}],"qualification":[]}') then raise exception 'overview publish failed'; end if;
 if public.online_projection_plan_v2(v_id,1)->'matches' is distinct from 'false'::jsonb then raise exception 'overview republished'; end if;
 if public.read_online_spectator_details(spectator)->'overview'->'recent'->0->>'finishedAt'<>'12345' then raise exception 'recent result absent'; end if;
 begin perform public.publish_online_spectator_matches_v2(v_id,lease1,1,detail_match,1,'{"recent":[{"index":1,"finishedAt":12345}],"qualification":[]}'); raise exception 'bad recent reference accepted'; exception when invalid_parameter_value then null; end;
 projection:=public.read_online_spectator_bundle_v2(spectator,null);
 if public.read_online_spectator_bundle_v2(spectator,projection->>'tag')->'unchanged' is distinct from 'true'::jsonb then raise exception 'conditional spectator bundle mismatch'; end if;
 if public.read_online_spectator_details(spectator)->'matches' is distinct from detail_match then raise exception 'projection differs'; end if;
 if not public.publish_online_spectator_rankings(v_id,lease1,1,ranking_fixture) then raise exception 'ranking publication failed'; end if;
 if public.read_online_spectator_rankings(spectator)->'rankings' is distinct from ranking_fixture then raise exception 'rankings differ'; end if;
 if (public.online_projection_plan(v_id,1)->>'rankings')::boolean then raise exception 'current ranking republish planned'; end if;
 if public.read_online_spectator_bundle(spectator)->'rankings' is distinct from public.read_online_spectator_rankings(spectator) then raise exception 'bundle ranking mismatch'; end if;
 if not public.publish_online_spectator_brackets(v_id,lease1,1,bracket_fixture) then raise exception 'bracket publication failed'; end if;
 if public.read_online_spectator_brackets(spectator)->'brackets' is distinct from bracket_fixture then raise exception 'brackets differ'; end if;
 begin perform public.publish_online_spectator_brackets(v_id,lease2,1,bracket_fixture); raise exception 'wrong bracket lease accepted'; exception when lock_not_available then null; end;
 begin perform public.publish_online_spectator_brackets(v_id,lease1,1,jsonb_set(bracket_fixture,'{0,rounds,0,matches,0,a,name}','"Other"')); raise exception 'foreign bracket name accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.publish_online_spectator_brackets(v_id,lease1,1,jsonb_set(bracket_fixture,'{0,rounds,0,matches,0,b,name}','"private"')); raise exception 'technical slot leaked name'; exception when invalid_parameter_value then null; end;
 begin perform public.publish_online_spectator_rankings(v_id,lease2,1,ranking_fixture); raise exception 'wrong ranking lease accepted'; exception when lock_not_available then null; end;
 begin perform public.publish_online_spectator_rankings(v_id,lease1,1,jsonb_set(ranking_fixture,'{0,rows,0,name}','"Other"')); raise exception 'foreign ranking name accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.publish_online_spectator_rankings(v_id,lease1,1,jsonb_set(ranking_fixture,'{0,rows,0,code}','"1234"')); raise exception 'private ranking field accepted'; exception when invalid_parameter_value then null; end;

 begin perform public.set_online_tournament_archive(v_id,1,true); raise exception 'active workspace archived'; exception when lock_not_available then null; end;
 if public.claim_online_workspace(v_id,lease2,false) then raise exception 'second workspace acquired'; end if;
 if not public.claim_online_workspace(v_id,lease1,true) then raise exception 'renew failed'; end if;
 if public.release_online_workspace(v_id,lease2) then raise exception 'foreign token released lease'; end if;
 begin perform public.commit_online_tournament(v_id,'Test',1,op2,v_payload); raise exception 'old API bypass'; exception when lock_not_available then null; end;
 begin perform public.commit_leased_online_tournament(v_id,'Test',1,op2,v_payload,lease2); raise exception 'wrong lease write'; exception when lock_not_available then null; end;
 if public.commit_leased_online_tournament(v_id,'Test',1,op2,v_payload,lease1) <> 2 then raise exception 'update'; end if;
 if public.read_online_player_access(player_new)->'matches' is distinct from 'null'::jsonb then raise exception 'stale player projection exposed'; end if;
 if public.read_online_spectator_details(spectator)->'matches' is distinct from 'null'::jsonb then raise exception 'stale projection exposed'; end if;
 if public.read_online_spectator_details(spectator)->'overview' is distinct from 'null'::jsonb then raise exception 'stale overview exposed'; end if;
 if not (public.online_projection_plan(v_id,2)->>'rankings')::boolean then raise exception 'stale ranking not planned'; end if;
 if public.read_online_spectator_brackets(spectator)->'brackets' is distinct from 'null'::jsonb then raise exception 'stale bracket exposed'; end if;
 if public.read_online_spectator_rankings(spectator)->'rankings' is distinct from 'null'::jsonb then raise exception 'stale ranking exposed'; end if;
 perform public.online_spectator_detail_setting(v_id,false);
 if public.read_online_spectator_brackets(spectator) is not null then raise exception 'disabled bracket exposed'; end if;
 if public.read_online_spectator_rankings(spectator) is not null then raise exception 'disabled ranking exposed'; end if;
 if public.read_online_spectator_details(spectator) is not null then raise exception 'disabled details visible'; end if;
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
   'online-tournament:swiss-round-fixtures:v1','[{"tournamentId":"local-rpc-test","stageId":"local-rpc-test-phase-1","round":1,"pairs":[["p-a","p-b"],["p-c","ot:slot:bye"]]},{"tournamentId":"local-rpc-test","stageId":"local-rpc-test-phase-1","round":2,"pairs":[["p-a","p-b"],["p-c","ot:slot:bye"]]}]',
   'online-tournament:mock-match-results:v2',jsonb_build_array(v_match)::text));
 v_invalid:=jsonb_set(v_live,'{entries}',(v_live->'entries')||jsonb_build_object('online-tournament:swiss-round-fixtures:v1','[{"tournamentId":"local-rpc-test","stageId":"local-rpc-test-phase-1","round":1,"pairs":[["p-a","p-b"],["p-a","ot:slot:bye"]]}]'));
 begin perform public.commit_leased_online_tournament(v_id,'Test',25,gen_random_uuid(),v_invalid,lease1); raise exception 'duplicate Swiss participant accepted'; exception when invalid_parameter_value then null; end;
 v_invalid:=jsonb_set(v_live,'{entries}',(v_live->'entries')||jsonb_build_object('online-tournament:mock-match-results:v2',jsonb_build_array(jsonb_set(v_match,'{matchId}','"local-rpc-test-phase-1-sw-r1-m2"'))::text));
 begin perform public.commit_leased_online_tournament(v_id,'Test',25,gen_random_uuid(),v_invalid,lease1); raise exception 'bye was scored'; exception when invalid_parameter_value then null; end;
 v_invalid:=jsonb_set(v_live,'{entries}',(v_live->'entries')||jsonb_build_object('online-tournament:mock-match-results:v2',jsonb_build_array(jsonb_set(v_match,'{matchId}','"local-rpc-test-phase-1-sw-r1-m99"'))::text));
 begin perform public.commit_leased_online_tournament(v_id,'Test',25,gen_random_uuid(),v_invalid,lease1); raise exception 'unknown Swiss game accepted'; exception when invalid_parameter_value then null; end;
 if public.commit_leased_online_tournament(v_id,'Test',25,gen_random_uuid(),v_live,lease1)<>26 then raise exception 'valid initial result rejected'; end if;
 v_invalid:=jsonb_set(v_live,'{entries}',(v_live->'entries')||jsonb_build_object('online-tournament:swiss-round-fixtures:v1','[{"tournamentId":"local-rpc-test","stageId":"local-rpc-test-phase-1","round":1,"pairs":[["p-a","p-c"],["p-b","ot:slot:bye"]]}]'));
 begin perform public.commit_leased_online_tournament(v_id,'Test',26,gen_random_uuid(),v_invalid,lease1); raise exception 'played Swiss pairing changed'; exception when invalid_parameter_value then null; end;
 v_invalid:=jsonb_set(v_live,'{entries}',(v_live->'entries')||jsonb_build_object('online-tournament:mock-phase-lifecycle:v1','[]','online-tournament:swiss-round-fixtures:v1','[]','online-tournament:mock-match-results:v2','[]'));
 begin perform public.commit_leased_online_tournament(v_id,'Test',26,gen_random_uuid(),v_invalid,lease1); raise exception 'phase start erased'; exception when invalid_parameter_value then null; end;
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
 begin perform public.online_spectator_detail_setting(v_id,true); raise exception 'foreign details enabled'; exception when insufficient_privilege then null; end;
 begin perform public.manage_online_player_access(v_id,'p-a','rotate'); raise exception 'foreign player management'; exception when insufficient_privilege then null; end;
 begin perform public.list_online_player_access(v_id); raise exception 'foreign player list'; exception when insufficient_privilege then null; end;
 begin perform public.manage_online_spectator(v_id,'enable'); raise exception 'foreign spectator enabled'; exception when insufficient_privilege then null; end;
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
declare v_id text:='local-rpc-test'; old_token uuid:='20000000-0000-4000-8000-000000000002'; new_token uuid:='20000000-0000-4000-8000-000000000003'; snapshot jsonb; pa uuid; pb uuid; pc uuid; fixture jsonb; score jsonb:='[{"number":1,"sideAScore":11,"sideBScore":8}]'; different jsonb:='[{"number":1,"sideAScore":11,"sideBScore":9}]';
begin
  snapshot:=public.load_online_tournament(v_id)->'payload';
  if public.claim_online_workspace(v_id,old_token,true) then raise exception 'expired lease renewed'; end if;
  begin perform public.commit_leased_online_tournament(v_id,'Test',29,gen_random_uuid(),snapshot,old_token); raise exception 'expired lease write accepted'; exception when lock_not_available then null; end;
  if not public.claim_online_workspace(v_id,new_token,false) then raise exception 'expired lease takeover failed'; end if;
  if public.release_online_workspace(v_id,old_token) then raise exception 'old token released new lease'; end if;
  if public.commit_leased_online_tournament(v_id,'Test',29,gen_random_uuid(),snapshot,new_token)<>30 then raise exception 'new owner write failed'; end if;
  snapshot:=jsonb_set(snapshot,'{entries}',(snapshot->'entries')||jsonb_build_object('online-tournament:mock-match-runtime:v1','[{"matchId":"local-rpc-test-phase-1-sw-r2-m1","table":"Tisch 1","status":"LIVE","startedAt":12345}]'));
  if public.commit_leased_online_tournament(v_id,'Test',30,gen_random_uuid(),snapshot,new_token)<>31 then raise exception 'report fixture setup'; end if;
  fixture:='[{"matchId":"local-rpc-test-phase-1-sw-r2-m1","aId":"p-a","bId":"p-b","startedAt":12345,"bestOf":1,"requiresWinner":true}]';
  begin perform public.batch_online_player_access(v_id,'["p-b","missing"]','enable'); raise exception 'invalid batch succeeded'; exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.list_online_player_access(v_id) where participant_id='p-b' and token is not null) then raise exception 'partial batch'; end if;
  if public.batch_online_player_access(v_id,'["p-a","p-b","p-c"]','enable')<>3 then raise exception 'bulk enable failed'; end if;
  select token into pa from public.list_online_player_access(v_id) where participant_id='p-a';
  select token into pb from public.list_online_player_access(v_id) where participant_id='p-b';
  select token into pc from public.list_online_player_access(v_id) where participant_id='p-c';
  perform public.batch_online_player_access(v_id,'["p-a"]','enable');
  if (select token from public.list_online_player_access(v_id) where participant_id='p-a') is distinct from pa then raise exception 'bulk enable rotated existing link'; end if;
  begin perform public.publish_online_report_fixtures(v_id,new_token,31,jsonb_set(fixture,'{0,bId}','"p-c"')); raise exception 'wrong Swiss opponent published'; exception when invalid_parameter_value then null; end;
  if not public.publish_online_report_fixtures(v_id,new_token,31,fixture) then raise exception 'publish report fixtures'; end if;
  -- The capability may acknowledge only its own current call; recall revokes old IDs.
  declare call_uuid uuid; replacement_uuid uuid;
  begin
    call_uuid:=(public.list_online_match_calls(v_id)->0->>'callId')::uuid;
    if call_uuid is null then raise exception 'missing match call'; end if;
    if jsonb_array_length(public.read_online_player_bundle(pc)->'calls')<>0 then raise exception 'foreign call exposed'; end if;
    begin perform public.ack_online_match_call(pc,call_uuid); raise exception 'foreign call accepted'; exception when insufficient_privilege then null; end;
    if not public.ack_online_match_call(pa,call_uuid) or not public.ack_online_match_call(pa,call_uuid) then raise exception 'ack retry'; end if;
    if public.list_online_match_calls(v_id)->0->'ackA' is distinct from 'true'::jsonb then raise exception 'ack missing'; end if;
    if public.read_online_player_bundle(pa)->'calls'->0->'acknowledged' is distinct from 'true'::jsonb then raise exception 'private ack missing'; end if;
    if not public.recall_online_match_call(v_id,new_token,call_uuid,31) then raise exception 'recall rejected'; end if;
    replacement_uuid:=(public.list_online_match_calls(v_id)->0->>'callId')::uuid;
    if replacement_uuid=call_uuid or public.list_online_match_calls(v_id)->0->'ackA' is distinct from 'false'::jsonb then raise exception 'recall failed'; end if;
    begin perform public.ack_online_match_call(pa,call_uuid); raise exception 'old call accepted'; exception when insufficient_privilege then null; end;
    if not public.ack_online_match_call(pb,replacement_uuid) then raise exception 'second participant ack'; end if;
  end;

  if public.read_online_player_reports(pc) is distinct from '[]'::jsonb then raise exception 'foreign report list'; end if;
  begin perform public.submit_online_player_report(pc,'local-rpc-test-phase-1-sw-r2-m1',31,score); raise exception 'foreign report'; exception when insufficient_privilege then null; end;
  begin perform public.submit_online_player_report(pa,'local-rpc-test-phase-1-sw-r2-m1',30,score); raise exception 'stale report'; exception when serialization_failure then null; end;
  begin perform public.submit_online_player_report(pa,'local-rpc-test-phase-1-sw-r2-m1',31,'[{"number":1,"sideAScore":9,"sideBScore":8}]'); raise exception 'invalid report'; exception when invalid_parameter_value then null; end;
  if not public.submit_online_player_report(pa,'local-rpc-test-phase-1-sw-r2-m1',31,score) or not public.submit_online_player_report(pa,'local-rpc-test-phase-1-sw-r2-m1',31,score) then raise exception 'report retry'; end if;
  begin perform public.submit_online_player_report(pa,'local-rpc-test-phase-1-sw-r2-m1',31,different); raise exception 'report overwritten'; exception when invalid_parameter_value then null; end;
  perform public.submit_online_player_report(pb,'local-rpc-test-phase-1-sw-r2-m1',31,different);
  if public.list_online_result_reports(v_id)->0->'aSets' is distinct from score or public.list_online_result_reports(v_id)->0->'bSets' is distinct from different then raise exception 'conflict not preserved'; end if;
  if not public.reset_online_result_reports(v_id,new_token,'local-rpc-test-phase-1-sw-r2-m1',31) then raise exception 'reset failed'; end if;
  if (public.read_online_player_reports(pa)->0->>'generation')::integer<>1 then raise exception 'generation not incremented'; end if;
  begin perform public.submit_online_player_report(pa,'local-rpc-test-phase-1-sw-r2-m1',31,score); raise exception 'old API reset bypass'; exception when serialization_failure then null; end;
  begin perform public.submit_online_player_report_v2(pa,'local-rpc-test-phase-1-sw-r2-m1',31,score,0); raise exception 'old generation accepted'; exception when serialization_failure then null; end;
  perform public.submit_online_player_report_v2(pa,'local-rpc-test-phase-1-sw-r2-m1',31,score,1);
  perform public.submit_online_player_report_v2(pb,'local-rpc-test-phase-1-sw-r2-m1',31,score,1);
  if public.list_online_result_reports(v_id)->0->'aSets' is distinct from public.list_online_result_reports(v_id)->0->'bSets' then raise exception 'matching reports lost'; end if;
  if (public.load_online_tournament(v_id)->>'revision')::int<>31 then raise exception 'player changed canonical revision'; end if;
  perform public.publish_online_report_fixtures(v_id,new_token,31,fixture);
  if (public.read_online_player_reports(pa)->0->>'generation')::integer<>1 then raise exception 'generation lost on republish'; end if;
  if public.read_online_player_bundle(pa)->'reports' is distinct from public.read_online_player_reports(pa) then raise exception 'bundle reports differ'; end if;
  if public.read_online_player_bundle(pa)->'view' is distinct from public.read_online_player_access(pa) then raise exception 'bundle view differs'; end if;
  if public.batch_online_player_access(v_id,'["p-c"]','disable')<>1 then raise exception 'bulk revoke count'; end if;
  if public.read_online_player_bundle(pc)->'view' is distinct from 'null'::jsonb then raise exception 'bulk revoke failed'; end if;
  perform set_config('test.report_token',pa::text,true);
  perform public.release_online_workspace(v_id,new_token);
  begin perform public.set_online_tournament_archive(v_id,31,true); raise exception 'running event archived'; exception when invalid_parameter_value then null; end;
  begin insert into public.tournament_backups(tournament_id,tournament_name,payload) values(v_id,'Broken','{}'); raise exception 'invalid backup accepted'; exception when check_violation then null; end;
end $$;
select set_config('test.player_token',public.manage_online_player_access('local-rpc-test','p-a','enable')::text,true);
select set_config('test.spectator_token',public.manage_online_spectator('local-rpc-test','enable')::text,true);
reset role;
set local role anon;
do $$
declare token uuid:=current_setting('test.spectator_token')::uuid; projection jsonb;
begin
 projection:=public.read_online_spectator(token);
 if projection is null or (projection->>'revision')::integer<>31 or (projection->>'recordedResults')::integer<>1 then raise exception 'anonymous public read failed'; end if;
 if public.read_online_player_access(current_setting('test.player_token')::uuid)->>'participant'<>'A' then raise exception 'anonymous player access failed'; end if;
 if public.read_online_player_bundle(current_setting('test.report_token')::uuid)->'view'->>'participant'<>'A' then raise exception 'anonymous bundle identity'; end if;
 if public.read_online_player_reports(current_setting('test.report_token')::uuid)->0->'aSets' is null then raise exception 'anon report read failed'; end if;
 if has_function_privilege('anon','public.batch_online_player_access(text,jsonb,text)','EXECUTE') or has_function_privilege('anon','public.list_online_result_reports(text)','EXECUTE') or has_function_privilege('anon','public.reset_online_result_reports(text,uuid,text,integer)','EXECUTE') or has_table_privilege('anon','tournament_private.online_result_reports','SELECT') then raise exception 'anonymous report privilege'; end if;
 if public.read_online_player_access(gen_random_uuid()) is not null then raise exception 'unknown player token accepted'; end if;
 if has_function_privilege('anon','public.manage_online_player_access(text,text,text)','EXECUTE') or has_function_privilege('anon','public.publish_online_player_projection(text,uuid,integer,jsonb,integer)','EXECUTE') or has_table_privilege('anon','tournament_private.online_player_links','SELECT') or has_table_privilege('anon','tournament_private.online_player_projection','SELECT') then raise exception 'anon player write access'; end if;
 if public.read_online_spectator_bundle(gen_random_uuid())->'progress' is distinct from 'null'::jsonb then raise exception 'unknown bundled token'; end if;
 if has_function_privilege('anon','public.online_projection_plan(text,integer)','EXECUTE') then raise exception 'anon projection plan'; end if;
 if public.read_online_spectator(gen_random_uuid()) is not null then raise exception 'unknown token readable'; end if;
 if has_function_privilege('anon','public.publish_online_spectator_rankings(text,uuid,integer,jsonb)','EXECUTE') or has_table_privilege('anon','tournament_private.online_spectator_rankings','SELECT') or has_function_privilege('anon','public.publish_online_spectator_matches(text,uuid,integer,jsonb,integer)','EXECUTE') or has_function_privilege('anon','public.online_spectator_detail_setting(text,boolean)','EXECUTE') or has_table_privilege('anon','tournament_private.online_spectator_details','SELECT') or has_function_privilege('anon','public.manage_online_spectator(text,text)','EXECUTE') or has_function_privilege('anon','public.load_online_tournament(text)','EXECUTE') or has_table_privilege('anon','tournament_private.online_tournaments','SELECT') then raise exception 'anon private access'; end if;
end $$;
reset role;
set local role authenticated;
select public.manage_online_spectator('local-rpc-test','disable');
rollback;
select 'create, retry, update, conflict, owner isolation passed' as result;

-- A synthetic trigger probe validates draw and fixture identities without
-- touching hosted data. The real director snapshots are replayed separately.
begin;
do $ko$
declare e jsonb; probe_payload jsonb; slots jsonb:='[{"kind":"participant","participantId":"a"},{"kind":"participant","participantId":"b"},{"kind":"participant","participantId":"c"},{"kind":"participant","participantId":"d"}]';
 results jsonb; expected jsonb; f tournament_private.online_report_fixtures; t tournament_private.online_tournaments;
begin
 create temporary table ko_probe(id text,payload jsonb) on commit drop;
 create trigger ko_probe_guard before insert or update on ko_probe for each row execute function tournament_private.validate_online_ko_draw();
 e:=jsonb_build_object('online-tournament:local-prototype-tournaments:v1:record:probe','{"tournament":{"stages":[{"id":"ko","type":"KNOCKOUT"}]}}',
 'online-tournament:mock-phase-lifecycle:v1','[{"startedStageIds":["ko"],"stageEntrants":{"ko":["a","b","c","d"]}}]',
 'online-tournament:mock-draw-config:v1',jsonb_build_array(jsonb_build_object('stageId','ko','bracketSlots',slots))::text,
 'online-tournament:mock-match-runtime:v1','[]','online-tournament:mock-match-results:v2','[]');
 probe_payload:=jsonb_build_object('entries',e);
 insert into ko_probe values('probe',probe_payload);
 expected:=tournament_private.ko_expected_pairs('probe',probe_payload,'ko',slots);
 if expected->'ko-r1-m1' is distinct from '["a","b"]'::jsonb or expected ? 'ko-r2-m1' then raise exception 'invalid initial bracket'; end if;
 begin update ko_probe q set payload=jsonb_set(q.payload,'{entries}',e||jsonb_build_object('online-tournament:mock-match-results:v2','[{"matchId":"ko-r2-m1","status":"FINISHED","sets":[{"sideAScore":11,"sideBScore":8}]}]')); raise exception 'unresolved final accepted'; exception when invalid_parameter_value then null; end;
 results:='[{"matchId":"ko-r1-m1","status":"FINISHED","sets":[{"sideAScore":11,"sideBScore":8}]},{"matchId":"ko-r1-m2","status":"FINISHED","sets":[{"sideAScore":7,"sideBScore":11}]}]';
 e:=e||jsonb_build_object('online-tournament:mock-match-results:v2',results::text);
 probe_payload:=jsonb_build_object('entries',e);
 update ko_probe q set payload=jsonb_build_object('entries',e) where q.id='probe';
 expected:=tournament_private.ko_expected_pairs('probe',probe_payload,'ko',slots);
 if expected->'ko-r2-m1' is distinct from '["a","d"]'::jsonb or expected->'ko-third-place' is distinct from '["b","c"]'::jsonb then raise exception 'dependent KO pairs incorrect'; end if;
 t.id:='probe';t.payload:=probe_payload;f.match_id:='ko-third-place';f.a_id:='b';f.b_id:='c';
 if not tournament_private.ko_report_pair_valid(f,t) then raise exception 'valid bronze rejected'; end if;
 f.b_id:='d';if tournament_private.ko_report_pair_valid(f,t) then raise exception 'foreign bronze accepted'; end if;
 begin update ko_probe q set payload=jsonb_build_object('entries',e||jsonb_build_object('online-tournament:mock-draw-config:v1','[]')) where q.id='probe'; raise exception 'frozen KO draw removed'; exception when invalid_parameter_value then null; end;
end $ko$;
rollback;
