-- Guard fundamental lifecycle and score invariants without duplicating the
-- full sport-specific engine (pairing, qualification, corrections, etc.).
create function tournament_private.validate_online_runtime()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  v_entries jsonb := new.payload->'entries';
  v_t jsonb := ((v_entries->>('online-tournament:local-prototype-tournaments:v1:record:'||new.id))::jsonb)->'tournament';
  v_results jsonb := (v_entries->>'online-tournament:mock-match-results:v2')::jsonb;
  v_runtime jsonb := (v_entries->>'online-tournament:mock-match-runtime:v1')::jsonb;
  v_lifecycle jsonb := (v_entries->>'online-tournament:mock-phase-lifecycle:v1')::jsonb;
  v_phase_ids text[];
  v_started text[];
  v_completed text[];
  v_item jsonb;
  v_set jsonb;
  v_field text;
  v_status text;
  v_number numeric;
  v_position integer;
  v_old jsonb;
begin
  select array_agg(value->>'id') into v_phase_ids from jsonb_array_elements(v_t->'stages');
  if tg_op='UPDATE' then
    v_old := ((old.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||old.id))::jsonb)->'tournament';
    if v_old->>'status' in ('FINISHED','ABORTED') and v_t->>'status' is distinct from v_old->>'status' then
      raise exception 'terminal tournament cannot be reopened' using errcode='22023';
    end if;
    if v_old->>'hasStarted'='true' and v_t->>'hasStarted' is distinct from 'true' then
      raise exception 'started tournament cannot be reset' using errcode='22023';
    end if;
  end if;
  if jsonb_array_length(v_lifecycle)>1 then raise exception 'duplicate lifecycle' using errcode='22023'; end if;
  if jsonb_array_length(v_lifecycle)=1 then
    v_item:=v_lifecycle->0;
    if jsonb_typeof(v_item->'startedStageIds') is distinct from 'array' or jsonb_typeof(v_item->'completedStageIds') is distinct from 'array' then
      raise exception 'invalid phase lifecycle' using errcode='22023';
    end if;
    select coalesce(array_agg(value),'{}') into v_started from jsonb_array_elements_text(v_item->'startedStageIds');
    select coalesce(array_agg(value),'{}') into v_completed from jsonb_array_elements_text(v_item->'completedStageIds');
    if not (v_started <@ v_phase_ids) or not (v_completed <@ v_started)
       or cardinality(v_started)<>(select count(distinct x) from unnest(v_started) x)
       or cardinality(v_completed)<>(select count(distinct x) from unnest(v_completed) x) then
      raise exception 'inconsistent phase lifecycle' using errcode='22023';
    end if;
  end if;
  if (select count(distinct value->>'matchId') from jsonb_array_elements(v_results))<>jsonb_array_length(v_results)
     or (select count(distinct value->>'matchId') from jsonb_array_elements(v_runtime))<>jsonb_array_length(v_runtime) then
    raise exception 'duplicate match record' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(v_results) loop
    if not exists(select 1 from unnest(v_phase_ids) s where starts_with(v_item->>'matchId',s||'-'))
       or coalesce(v_item->>'status','') not in ('LIVE','READY','WAITING','CONFIRMATION','FINISHED','CANCELLED')
       or jsonb_typeof(v_item->'sets') is distinct from 'array' then
      raise exception 'invalid match result' using errcode='22023';
    end if;
    v_position:=0;
    for v_set in select value from jsonb_array_elements(v_item->'sets') loop
      v_position:=v_position+1;
      foreach v_field in array array['number','sideAScore','sideBScore'] loop
        if jsonb_typeof(v_set->v_field) is distinct from 'number' then raise exception 'invalid score' using errcode='22023'; end if;
        v_number:=(v_set->>v_field)::numeric;
        if v_number<0 or v_number>9007199254740991 or mod(v_number,1)<>0 then raise exception 'invalid score' using errcode='22023'; end if;
      end loop;
      if (v_set->>'number')::numeric<>v_position then raise exception 'invalid set sequence' using errcode='22023'; end if;
    end loop;
  end loop;
  for v_item in select value from jsonb_array_elements(v_runtime) loop
    if not exists(select 1 from unnest(v_phase_ids) s where starts_with(v_item->>'matchId',s||'-')) then
      raise exception 'unknown runtime phase' using errcode='22023';
    end if;
    v_status:=v_item->>'status';
    if v_status is not null and v_status not in ('LIVE','READY','WAITING','CONFIRMATION','FINISHED','CANCELLED') then
      raise exception 'invalid match status' using errcode='22023';
    end if;
    if v_item ? 'table' and coalesce(v_item->>'table','') <> 'Noch offen' then
      if coalesce(v_item->>'table','') !~ '^Tisch [1-9][0-9]{0,3}$' then raise exception 'invalid table' using errcode='22023'; end if;
      if substring(v_item->>'table' from 7)::int > (v_t->>'tables')::int then raise exception 'invalid table' using errcode='22023'; end if;
    end if;
  end loop;
  if exists(
    select r->>'table' from jsonb_array_elements(v_runtime) r
    where r->>'status' in ('LIVE','READY','CONFIRMATION') and r->>'table' like 'Tisch %'
      and not exists(select 1 from jsonb_array_elements(v_results) m where m->>'matchId'=r->>'matchId' and m->>'status'='FINISHED')
      and exists(select 1 from unnest(coalesce(v_started,'{}')) s where not (s=any(coalesce(v_completed,'{}'))) and starts_with(r->>'matchId',s||'-'))
    group by r->>'table' having count(*)>1
  ) then raise exception 'duplicate active table assignment' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function tournament_private.validate_online_runtime() from public,anon,authenticated;
create trigger zz_validate_online_runtime before insert or update on tournament_private.online_tournaments
for each row execute function tournament_private.validate_online_runtime();
