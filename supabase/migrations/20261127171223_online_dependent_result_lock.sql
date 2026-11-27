-- Freeze played results once a dependent competition or round has started.
-- Review/confirmation flags can still change; sporting content cannot.
create function tournament_private.validate_online_corrections() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  old_e jsonb:=old.payload->'entries'; new_e jsonb:=new.payload->'entries';
  t jsonb:=((old_e->>('online-tournament:local-prototype-tournaments:v1:record:'||old.id))::jsonb)->'tournament';
  old_results jsonb:=(old_e->>'online-tournament:mock-match-results:v2')::jsonb;
  new_results jsonb:=(new_e->>'online-tournament:mock-match-results:v2')::jsonb;
  old_runtime jsonb:=(old_e->>'online-tournament:mock-match-runtime:v1')::jsonb;
  started jsonb:=coalesce(((old_e->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0->'startedStageIds','[]'::jsonb);
  r jsonb; replacement jsonb; stage jsonb; s_id text; match_id text; suffix text; prefix text; round_no integer;
  dep boolean; terminal boolean;
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
    prefix:=case when suffix ~ '^sw-r[0-9]+-m[0-9]+$' then 'sw-r'
      when suffix ~ '^r[0-9]+-m[0-9]+$' then 'r' else null end;
    if prefix is null then continue; end if;
    round_no:=substring(suffix from ('^'||prefix||'([0-9]+)-'))::integer;
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
create trigger zzzz_validate_online_corrections before update on tournament_private.online_tournaments
for each row execute function tournament_private.validate_online_corrections();
