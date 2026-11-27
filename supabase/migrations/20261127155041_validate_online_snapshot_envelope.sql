-- Validate the compatibility envelope at the server boundary. This is not yet
-- a full sport-specific domain command validator.
create function tournament_private.validate_online_snapshot()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_entries jsonb := new.payload->'entries';
  v_record_key text := 'online-tournament:local-prototype-tournaments:v1:record:' || new.id;
  v_record jsonb;
  v_tournament jsonb;
  v_key text;
  v_value jsonb;
  v_item jsonb;
  v_name text;
  v_index integer := 0;
  v_arrays text[] := array[
    'online-tournament:mock-draw-config:v1','online-tournament:mock-phase-lifecycle:v1',
    'online-tournament:mock-audit:v1','online-tournament:mock-inline-breaks:v2',
    'online-tournament:group-cutoff-decisions:v1','online-tournament:mock-match-results:v2',
    'online-tournament:mock-match-runtime:v1','online-tournament:swiss-round-fixtures:v1'
  ];
  v_maps text[] := array[
    'online-tournament:withdrawn-participants:v1','online-tournament:withdrawal-timing:v1',
    'online-tournament:withdrawal-restore:v1','online-tournament:mock-blocked-tables:v1',
    'online-tournament:swiss-cutoff-decisions:v1','online-tournament:swiss-round-robin-history:v1',
    'online-tournament:swiss-extra-rounds:v1'
  ];
begin
  if jsonb_typeof(v_entries) is distinct from 'object'
     or jsonb_typeof(new.payload->'exportedAt') is distinct from 'string'
     or (select count(*) from jsonb_object_keys(v_entries)) <> 16
     or not (v_entries ?& (array[v_record_key] || v_arrays || v_maps)) then
    raise exception 'incomplete snapshot' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_each(v_entries) e where jsonb_typeof(e.value) <> 'string') then
    raise exception 'invalid snapshot value' using errcode='22023';
  end if;
  v_record := (v_entries->>v_record_key)::jsonb;
  v_tournament := v_record->'tournament';
  if jsonb_typeof(v_record->'sortOrder') is distinct from 'number'
     or v_tournament->>'id' is distinct from new.id
     or v_tournament->>'name' is distinct from new.name
     or coalesce(v_tournament->>'status','') not in ('DRAFT','REGISTRATION','READY','RUNNING','PAUSED','ABORTED','FINISHED','ARCHIVED')
     or v_tournament->>'visibility' is distinct from 'PRIVATE'
     or coalesce(v_tournament->>'discipline','') not in ('SINGLES','DOUBLES','TEAMS')
     or jsonb_typeof(v_tournament->'hasStarted') is distinct from 'boolean'
     or jsonb_typeof(v_tournament->'tables') is distinct from 'number'
     or (v_tournament->>'tables')::numeric not between 1 and 9999
     or mod((v_tournament->>'tables')::numeric,1) <> 0
     or jsonb_typeof(v_tournament->'participantNames') is distinct from 'array'
     or jsonb_typeof(v_tournament->'participantIds') is distinct from 'object'
     or jsonb_typeof(v_tournament->'stages') is distinct from 'array' then
    raise exception 'invalid tournament header' using errcode='22023';
  end if;
  if (select count(*) from jsonb_object_keys(v_tournament->'participantIds')) <> jsonb_array_length(v_tournament->'participantNames')
     or (select count(distinct value) from jsonb_array_elements(v_tournament->'participantNames')) <> jsonb_array_length(v_tournament->'participantNames')
     or (select count(distinct value) from jsonb_each(v_tournament->'participantIds')) <> jsonb_array_length(v_tournament->'participantNames') then
    raise exception 'invalid participant identities' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(v_tournament->'participantNames') loop
    v_name := v_item #>> '{}';
    if jsonb_typeof(v_item) <> 'string' or length(trim(v_name))=0
       or jsonb_typeof(v_tournament->'participantIds'->v_name) is distinct from 'string'
       or length(v_tournament->'participantIds'->>v_name)=0 then
      raise exception 'invalid participant identity' using errcode='22023';
    end if;
  end loop;
  if jsonb_array_length(v_tournament->'stages') < 1 then raise exception 'missing tournament phases' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(v_tournament->'stages') loop
    v_index := v_index + 1;
    if v_item->>'id' is distinct from new.id || '-phase-' || v_index
       or v_item->>'tournamentId' is distinct from new.id
       or coalesce(v_item->>'type','') not in ('ROUND_ROBIN','GROUPS','SWISS','KNOCKOUT','DOUBLE_ELIMINATION','PLACEMENT','BREAK')
       or jsonb_typeof(v_item->'settings') is distinct from 'object' then
      raise exception 'invalid tournament phase' using errcode='22023';
    end if;
  end loop;
  foreach v_key in array v_arrays loop
    v_value := (v_entries->>v_key)::jsonb;
    if jsonb_typeof(v_value) is distinct from 'array' then raise exception 'invalid runtime list' using errcode='22023'; end if;
    for v_item in select value from jsonb_array_elements(v_value) loop
      if jsonb_typeof(v_item) is distinct from 'object' then raise exception 'invalid runtime entry' using errcode='22023'; end if;
      if v_key in ('online-tournament:mock-match-results:v2','online-tournament:mock-match-runtime:v1') then
        if not starts_with(coalesce(v_item->>'matchId',''),new.id || '-phase-') then raise exception 'foreign match' using errcode='22023'; end if;
      elsif v_item->>'tournamentId' is distinct from new.id then
        raise exception 'foreign tournament entry' using errcode='22023';
      end if;
    end loop;
  end loop;
  foreach v_key in array v_maps loop
    v_value := (v_entries->>v_key)::jsonb;
    if jsonb_typeof(v_value) is distinct from 'object' then raise exception 'invalid runtime map' using errcode='22023'; end if;
    for v_name in select jsonb_object_keys(v_value) loop
      if v_key in ('online-tournament:swiss-cutoff-decisions:v1','online-tournament:swiss-round-robin-history:v1','online-tournament:swiss-extra-rounds:v1') then
        if not starts_with(v_name,new.id || ':') then raise exception 'foreign phase map' using errcode='22023'; end if;
      elsif v_name <> new.id then raise exception 'foreign tournament map' using errcode='22023';
      end if;
    end loop;
  end loop;
  return new;
end $$;
revoke all on function tournament_private.validate_online_snapshot() from public,anon,authenticated;
create trigger validate_online_snapshot before insert or update on tournament_private.online_tournaments
for each row execute function tournament_private.validate_online_snapshot();
