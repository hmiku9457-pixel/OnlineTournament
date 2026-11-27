-- Run against a development database only. All fixtures are rolled back.
begin;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-0000000000a1','online-test-a@example.invalid'),('00000000-0000-4000-8000-0000000000b2','online-test-b@example.invalid');
set local role authenticated;
do $$
declare
  v_id text := 'local-rpc-test';
  v_payload jsonb := jsonb_build_object('version',1,'tournamentId','local-rpc-test','entries',jsonb_build_object('online-tournament:local-prototype-tournaments:v1:record:local-rpc-test','{"tournament":{"id":"local-rpc-test","name":"Test","stages":[],"participantNames":[]}}'));
  op1 uuid := '10000000-0000-4000-8000-000000000001';
  op2 uuid := '10000000-0000-4000-8000-000000000002';
  op3 uuid := '10000000-0000-4000-8000-000000000003';
begin
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
 if public.commit_online_tournament(v_id,'Test',0,op1,v_payload) <> 1 then raise exception 'create'; end if;
 if public.commit_online_tournament(v_id,'Test',0,op1,v_payload) <> 1 then raise exception 'retry'; end if;
 if public.commit_online_tournament(v_id,'Test',1,op2,v_payload) <> 2 then raise exception 'update'; end if;
 if public.commit_online_tournament(v_id,'Test',0,op1,v_payload) <> 1 then raise exception 'late retry'; end if;
 begin perform public.commit_online_tournament(v_id,'Test',1,op3,v_payload); raise exception 'stale update accepted'; exception when serialization_failure then null; end;
 begin perform public.commit_online_tournament(v_id,'Test',2,op2,v_payload); raise exception 'operation reuse accepted'; exception when invalid_parameter_value then null; end;
 if (public.load_online_tournament(v_id)->>'revision')::int <> 2 then raise exception 'wrong revision'; end if;
 if (select count(*) from public.list_online_tournaments() where id=v_id) <> 1 then raise exception 'list'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b2',true);
 if exists(select 1 from public.list_online_tournaments() where id=v_id) then raise exception 'cross-owner list'; end if;
 begin perform public.load_online_tournament(v_id); raise exception 'cross-owner read'; exception when insufficient_privilege then null; end;
 begin perform public.commit_online_tournament(v_id,'Test',2,op3,v_payload); raise exception 'cross-owner update'; exception when insufficient_privilege then null; end;
 begin perform public.commit_online_tournament(v_id,'Test',0,op3,v_payload); raise exception 'cross-owner create'; exception when insufficient_privilege then null; end;
 if has_table_privilege('authenticated','tournament_private.online_tournaments','UPDATE') or has_function_privilege('anon','public.commit_online_tournament(text,text,integer,uuid,jsonb)','EXECUTE') then raise exception 'privilege leak'; end if;
end $$;
rollback;
select 'create, retry, update, conflict, owner isolation passed' as result;
