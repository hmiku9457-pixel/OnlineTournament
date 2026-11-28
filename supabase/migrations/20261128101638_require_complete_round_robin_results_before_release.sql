create or replace function tournament_private.validate_online_round_robin() returns trigger
language plpgsql set search_path='' as $$
declare e jsonb:=new.payload->'entries'; h jsonb:=tournament_private.report_header(new.id,new.payload);
 life jsonb:=((e->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0;
 old_life jsonb; old_h jsonb; old_draws jsonb; old_assign jsonb;
 draws jsonb:=(e->>'online-tournament:mock-draw-config:v1')::jsonb;
 results jsonb:=(e->>'online-tournament:mock-match-results:v2')::jsonb;
 runtime jsonb:=(e->>'online-tournament:mock-match-runtime:v1')::jsonb;
 result_index jsonb; stage jsonb; sid text; entrants jsonb; assignments jsonb; groups int; item jsonb; pair jsonb; active_ids text[]; pid text; expected_count bigint; recorded_count bigint;
begin
 if tg_op='UPDATE' then
  old_life:=((old.payload->'entries'->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0;
  old_h:=tournament_private.report_header(old.id,old.payload);
  old_draws:=(old.payload->'entries'->>'online-tournament:mock-draw-config:v1')::jsonb;
 end if;
 select coalesce(jsonb_object_agg(value->>'matchId',value),'{}') into result_index from jsonb_array_elements(results);
 for stage in select value from jsonb_array_elements(h->'stages') where value->>'type' in ('GROUPS','ROUND_ROBIN') loop
  sid:=stage->>'id';
  if not coalesce(life->'startedStageIds' ? sid,false) then continue; end if;
  entrants:=life->'stageEntrants'->sid;
  if jsonb_typeof(entrants) is distinct from 'array' then raise exception 'started round robin needs entrants' using errcode='22023'; end if;
  if tg_op='UPDATE' and coalesce(old_life->'startedStageIds' ? sid,false) and old_life->'stageEntrants'->sid is not null
   and entrants is distinct from old_life->'stageEntrants'->sid then raise exception 'started round robin field cannot change' using errcode='22023'; end if;
  assignments:=null;
  if stage->>'type'='GROUPS' then
   groups:=greatest(1,coalesce((stage->'settings'->>'groups')::int,1));
   if groups>4096 then raise exception 'invalid group count' using errcode='22023'; end if;
   select value->'groupAssignments' into assignments from jsonb_array_elements(draws) where value->>'stageId'=sid;
   if assignments is not null then
    if jsonb_typeof(assignments) is distinct from 'object' or (select count(*) from jsonb_object_keys(assignments))<>jsonb_array_length(entrants)
      or exists(select 1 from jsonb_each(assignments) j where not(entrants ? j.key) or jsonb_typeof(j.value)<>'number' or not coalesce((j.value#>>'{}') ~ '^[0-9]{1,4}$',false) or (j.value#>>'{}')::int>=groups)
    then raise exception 'invalid frozen group assignments' using errcode='22023'; end if;
   end if;
   if tg_op='UPDATE' and coalesce(old_life->'startedStageIds' ? sid,false) then
    select value->'groupAssignments' into old_assign from jsonb_array_elements(old_draws) where value->>'stageId'=sid;
    if exists(select 1 from jsonb_array_elements_text(entrants) with ordinality j(v,pos)
      where coalesce((old_assign->>v)::int,mod(pos-1,groups)::int) is distinct from coalesce((assignments->>v)::int,mod(pos-1,groups)::int)) then raise exception 'started group draw cannot change' using errcode='22023'; end if;
    if (select s->'settings'->'groups' from jsonb_array_elements(old_h->'stages') s where s->>'id'=sid) is distinct from stage->'settings'->'groups' then raise exception 'started group count cannot change' using errcode='22023'; end if;
   end if;
  end if;
  if jsonb_array_length(entrants)<2 then raise exception 'round robin needs at least two entrants' using errcode='22023'; end if;
  if stage->>'type'='GROUPS' then
   if exists(select 1 from generate_series(0,groups-1) g where (select count(*) from jsonb_array_elements_text(entrants) with ordinality j(v,pos) where coalesce((assignments->>v)::int,mod(pos-1,groups)::int)=g)<2)
   then raise exception 'started group is empty or has one entrant' using errcode='22023'; end if;
   select coalesce(sum(n*(n-1)/2),0) into expected_count from (
    select count(*) n from jsonb_array_elements_text(entrants) with ordinality j(v,pos)
    group by coalesce((assignments->>v)::int,mod(pos-1,groups)::int)
   ) counts;
  else expected_count:=jsonb_array_length(entrants)::bigint*(jsonb_array_length(entrants)-1)/2;
  end if;
  if coalesce(life->'completedStageIds' ? sid,false) then
   select count(*) into recorded_count from jsonb_array_elements(results) r where starts_with(r->>'matchId',sid||'-') and r->>'status'='FINISHED';
   if recorded_count<>expected_count then raise exception 'round robin phase has unfinished fixtures' using errcode='22023'; end if;
  end if;
  active_ids:='{}';
  for item in select value from jsonb_array_elements(results||runtime) where starts_with(value->>'matchId',sid||'-') loop
   if item->>'status'='CANCELLED' and item->>'startedAt' is null and jsonb_array_length(coalesce(item->'sets','[]'::jsonb))=0 then continue; end if;
   pair:=tournament_private.round_robin_pair(stage,entrants,assignments,item->>'matchId');
   if pair is null then raise exception 'unknown round robin match' using errcode='22023'; end if;
   if item ? 'forcedWinner' and not coalesce(item->>'forcedWinner' in (pair->>0,pair->>1,'ot:slot:unclaimed'),false) then raise exception 'forced winner outside round robin pairing' using errcode='22023'; end if;
   -- Only runtime records hold a real table; the result record may repeat the
   -- same ID. Check active assignments independently in the second loop.
  end loop;
  if not coalesce(life->'completedStageIds' ? sid,false) and h->>'status' in ('RUNNING','PAUSED') then
   for item in select value from jsonb_array_elements(runtime) where starts_with(value->>'matchId',sid||'-') and value->>'status' in ('LIVE','READY','CONFIRMATION') and value->>'table' like 'Tisch %' loop
    if result_index->(item->>'matchId')->>'status' in ('FINISHED','CANCELLED') then continue; end if;
    pair:=tournament_private.round_robin_pair(stage,entrants,assignments,item->>'matchId');
    foreach pid in array array[pair->>0,pair->>1] loop
     if pid=any(active_ids) then raise exception 'duplicate active round robin participant' using errcode='22023'; end if;
     active_ids:=array_append(active_ids,pid);
    end loop;
   end loop;
  end if;
 end loop;
 return new;
end $$;

