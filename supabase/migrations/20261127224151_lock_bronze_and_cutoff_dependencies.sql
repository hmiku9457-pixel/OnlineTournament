-- Freeze played results once a dependent competition or round has started.
-- Review/confirmation flags can still change; sporting content cannot.
create or replace function tournament_private.validate_online_corrections() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  old_e jsonb:=old.payload->'entries'; new_e jsonb:=new.payload->'entries';
  t jsonb:=((old_e->>('online-tournament:local-prototype-tournaments:v1:record:'||old.id))::jsonb)->'tournament';
  old_results jsonb:=(old_e->>'online-tournament:mock-match-results:v2')::jsonb;
  new_results jsonb:=(new_e->>'online-tournament:mock-match-results:v2')::jsonb;
  old_runtime jsonb:=(old_e->>'online-tournament:mock-match-runtime:v1')::jsonb;
  started jsonb:=coalesce(((old_e->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0->'startedStageIds','[]'::jsonb);
  r jsonb; replacement jsonb; stage jsonb; s_id text; match_id text; suffix text; prefix text; round_no integer;
  dep boolean; terminal boolean; entrant_count integer; final_round integer;
  life jsonb:=((old_e->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0;
begin
  terminal:=t->>'status' in ('FINISHED','ABORTED');
  for r in select value from jsonb_array_elements(old_results) loop
    if r->>'status'<>'FINISHED' then continue; end if;
    match_id:=r->>'matchId';
    select value into replacement from jsonb_array_elements(new_results) where value->>'matchId'=match_id;
    if (r - array['confirmedA','confirmedB','adminConfirmed','reviewConfirmed','finishedAt']) is not distinct from
       (replacement - array['confirmedA','confirmedB','adminConfirmed','reviewConfirmed','finishedAt']) then continue; end if;
    if terminal or r->>'thirdPlaceSkipped'='true' then raise exception 'finished result locked' using errcode='22023'; end if;
    select value into stage from jsonb_array_elements(t->'stages') where starts_with(match_id,(value->>'id')||'-') limit 1;
    if stage is null then continue; end if;
    s_id:=stage->>'id';
    select exists(select 1 from jsonb_array_elements(t->'stages') s
      where (s->>'orderIndex')::integer>(stage->>'orderIndex')::integer and s->>'type'<>'BREAK' and started ? (s->>'id')) into dep;
    if dep then raise exception 'dependent phase already started' using errcode='22023'; end if;
    suffix:=substring(match_id from length(s_id)+2);
    -- Swiss cutoff deciding sets have sequential winner dependencies.
    if stage->>'type'='SWISS' and suffix ~ '^sw-cutoff-set-m[1-9][0-9]{0,5}$' then
      round_no:=substring(suffix from '-m([0-9]+)$')::int;
      select exists(
        select 1 from jsonb_array_elements(old_runtime||old_results) e
        where starts_with(e->>'matchId',s_id||'-sw-cutoff-set-m')
        and (e->>'startedAt' is not null or e->>'status'='FINISHED' or jsonb_array_length(coalesce(e->'sets','[]'::jsonb))>0)
        and case when substring(e->>'matchId' from length(s_id)+2) ~ '^sw-cutoff-set-m[1-9][0-9]{0,5}$'
          then substring(e->>'matchId' from '-m([0-9]+)$')::int>round_no else false end
      ) into dep;
      if dep then raise exception 'dependent cutoff match already started' using errcode='22023'; end if;
    end if;
    prefix:=case when suffix ~ '^sw-r[0-9]+-m[0-9]+$' then 'sw-r'
      when suffix ~ '^r[0-9]+-m[0-9]+$' then 'r' else null end;
    if prefix is null then continue; end if;
    round_no:=substring(suffix from ('^'||prefix||'([0-9]+)-'))::integer;
    -- Bronze and final are on the same level. Freeze only earlier rounds
    -- and derive the bracket depth from the actual qualified stage roster.
    if stage->>'type'='KNOCKOUT' and prefix='r' then
      entrant_count:=coalesce(jsonb_array_length(life->'stageEntrants'->s_id),
        jsonb_array_length(t->'participantNames'));
      final_round:=ceil(log(2::numeric,greatest(2,entrant_count)::numeric))::int;
      if round_no<final_round and exists(
        select 1 from jsonb_array_elements(old_runtime||old_results) e
        where e->>'matchId'=s_id||'-third-place'
        and (e->>'startedAt' is not null or e->>'status'='FINISHED' or jsonb_array_length(coalesce(e->'sets','[]'::jsonb))>0)
      ) then raise exception 'dependent third-place match already started' using errcode='22023'; end if;
    end if;
    select exists(
      select 1 from (
        select value from jsonb_array_elements(old_runtime) where value->>'startedAt' is not null
        union all select value from jsonb_array_elements(old_results) where value->>'status'='FINISHED' or jsonb_array_length(value->'sets')>0
      ) e where starts_with(e.value->>'matchId',s_id||'-'||prefix)
      and case when substring(e.value->>'matchId' from length(s_id)+2) ~ ('^'||prefix||'[0-9]+-m[0-9]+$')
        then substring(substring(e.value->>'matchId' from length(s_id)+2) from ('^'||prefix||'([0-9]+)-'))::integer > round_no else false end
    ) into dep;
    if dep then raise exception 'dependent round already started' using errcode='22023'; end if;
  end loop;
  return new;
end $$;
revoke all on function tournament_private.validate_online_corrections() from public,anon,authenticated;

-- Exercise the trigger on synthetic rows only; no real tournament is touched.
do $test$
declare
  e jsonb; p jsonb; changed jsonb; sem jsonb; final_result jsonb; cutoff jsonb;
  k text:='online-tournament:mock-match-results:v2';
  rk text:='online-tournament:mock-match-runtime:v1';
begin
  create temporary table online_dependency_probe(id text, payload jsonb) on commit drop;
  create trigger dependency_probe before update on online_dependency_probe
    for each row execute function tournament_private.validate_online_corrections();
  sem:='{"matchId":"ko-r1-m1","status":"FINISHED","sets":[{"number":1,"sideAScore":11,"sideBScore":7}]}';
  final_result:=jsonb_set(sem,'{matchId}','"ko-r2-m1"');
  e:=jsonb_build_object(
    'online-tournament:local-prototype-tournaments:v1:record:probe',
    '{"tournament":{"status":"RUNNING","participantNames":["A","B","C","D","E","F","G","H"],"stages":[{"id":"ko","type":"KNOCKOUT","orderIndex":0}]}}',
    'online-tournament:mock-phase-lifecycle:v1',
    '[{"startedStageIds":["ko"],"stageEntrants":{"ko":["a","b","c","d"]}}]',
    k,jsonb_build_array(sem)::text,rk,'[]');
  p:=jsonb_build_object('entries',e);
  insert into online_dependency_probe values('probe',p);
  changed:=jsonb_set(sem,'{sets,0,sideBScore}','8');
  update online_dependency_probe set payload=jsonb_set(p,'{entries}',e||jsonb_build_object(k,jsonb_build_array(changed)::text));
  e:=e||jsonb_build_object(k,jsonb_build_array(changed)::text,rk,
    '[{"matchId":"ko-third-place","status":"WAITING","table":"Noch offen","startedAt":12345}]');
  update online_dependency_probe set payload=jsonb_build_object('entries',e);
  begin
    update online_dependency_probe set payload=jsonb_build_object('entries',e||jsonb_build_object(k,jsonb_build_array(sem)::text));
    raise exception 'semifinal correction accepted after bronze start';
  exception when invalid_parameter_value then
    if sqlerrm<>'dependent third-place match already started' then raise; end if;
  end;
  e:=e||jsonb_build_object(k,jsonb_build_array(changed,final_result)::text);
  update online_dependency_probe set payload=jsonb_build_object('entries',e);
  -- The final is independent of the bronze match.
  update online_dependency_probe set payload=jsonb_build_object('entries',e||jsonb_build_object(k,
    jsonb_build_array(changed,jsonb_set(final_result,'{sets,0,sideBScore}','8'))::text));
  delete from online_dependency_probe;
  cutoff:=jsonb_set(sem,'{matchId}','"sw-sw-cutoff-set-m1"');
  e:=jsonb_build_object(
    'online-tournament:local-prototype-tournaments:v1:record:probe',
    '{"tournament":{"status":"RUNNING","participantNames":["A","B","C"],"stages":[{"id":"sw","type":"SWISS","orderIndex":0}]}}',
    'online-tournament:mock-phase-lifecycle:v1','[{"startedStageIds":["sw"]}]',
    k,jsonb_build_array(cutoff)::text,rk,'[{"matchId":"sw-sw-cutoff-set-m2","status":"WAITING","startedAt":12345}]');
  insert into online_dependency_probe values('probe',jsonb_build_object('entries',e));
  begin
    update online_dependency_probe set payload=jsonb_build_object('entries',e||jsonb_build_object(k,jsonb_build_array(jsonb_set(cutoff,'{sets,0,sideBScore}','8'))::text));
    raise exception 'cutoff correction accepted after next deciding set';
  exception when invalid_parameter_value then
    if sqlerrm<>'dependent cutoff match already started' then raise; end if;
  end;
end $test$;
