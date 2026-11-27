-- Keep scoring constraints identical to the current browser scoring engine.
-- Exact bracket topology and qualifier computation are not yet server commands.
create function tournament_private.valid_online_score(p_sport text,p_best_of integer,p_sets jsonb,p_finished boolean,p_requires_winner boolean,p_decision_side text)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare
  v_set jsonb; a numeric; b numeric; w numeric; l numeric; target integer;
  n integer:=0; wa integer:=0; wb integer:=0; needed integer;
begin
  if p_sport in ('football','futsal','handball','hockey','ice_hockey','basketball') then
    if jsonb_array_length(p_sets)>1 or (p_finished and jsonb_array_length(p_sets)<>1) then return false; end if;
    if p_finished then
      a:=(p_sets->0->>'sideAScore')::numeric; b:=(p_sets->0->>'sideBScore')::numeric;
      if a=b and (p_sport='basketball' or (p_requires_winner and coalesce(p_decision_side,'') not in ('A','B'))) then return false; end if;
    end if;
    return true;
  end if;
  if p_sport not in ('table_tennis','volleyball','beach_volleyball','tennis','badminton','padel','squash')
     or p_best_of is null or p_best_of<1 or jsonb_array_length(p_sets)>p_best_of then return false; end if;
  needed:=(p_best_of+1)/2;
  for v_set in select value from jsonb_array_elements(p_sets) loop
    if greatest(wa,wb)>=needed then return false; end if;
    n:=n+1; a:=(v_set->>'sideAScore')::numeric; b:=(v_set->>'sideBScore')::numeric;
    w:=greatest(a,b); l:=least(a,b);
    if a=b then return false; end if;
    target:=case when p_sport='badminton' then 21
      when p_sport in ('tennis','padel') then 6
      when p_sport='volleyball' then case when p_best_of>1 and n=p_best_of then 15 else 25 end
      when p_sport='beach_volleyball' then case when p_best_of>=3 and n=3 then 15 else 21 end
      else 11 end;
    if p_sport in ('tennis','padel') then
      if not ((w=7 and l=6) or (w>=target and w-l=2 and l<=5)) then return false; end if;
    elsif p_sport='badminton' then
      if not ((w=30 and l=29) or (w>=21 and w-l=2 and w<=30)) then return false; end if;
    elsif not ((w>=target and w-l=2) or (w=target and l<target-1)) then return false;
    end if;
    if a>b then wa:=wa+1; else wb:=wb+1; end if;
  end loop;
  return not p_finished or greatest(wa,wb)=needed;
end $$;
revoke all on function tournament_private.valid_online_score(text,integer,jsonb,boolean,boolean,text) from public,anon,authenticated;

create function tournament_private.validate_online_scoring() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  t jsonb:=((new.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||new.id))::jsonb)->'tournament';
  results jsonb:=(new.payload->'entries'->>'online-tournament:mock-match-results:v2')::jsonb;
  sport text;
  item jsonb; stage jsonb; suffix text; bo integer; round_number integer;
  options text[]; candidate text; valid boolean; finished boolean; requires_winner boolean;
begin
  sport:=case lower(t->>'sport')
    when 'tischtennis' then 'table_tennis' when 'fußball' then 'football'
    when 'beachvolleyball' then 'beach_volleyball' when 'eishockey' then 'ice_hockey'
    else lower(t->>'sport') end;
  if coalesce(sport,'') not in ('table_tennis','volleyball','beach_volleyball','tennis','badminton','padel','squash','football','futsal','handball','hockey','ice_hockey','basketball') then
    raise exception 'unknown sport' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(results) loop
    -- Withdrawals and omitted bronze matches are administrative decisions,
    -- not played results. Their detailed rules require domain commands.
    if item->>'forcedWinner' is not null or item->>'thirdPlaceSkipped'='true' or item->>'status'='CANCELLED' then continue; end if;
    select value into stage from jsonb_array_elements(t->'stages') where starts_with(item->>'matchId',(value->>'id')||'-') limit 1;
    if stage is null or stage->>'type'='BREAK' then raise exception 'invalid scoring phase' using errcode='22023'; end if;
    suffix:=substring(item->>'matchId' from length(stage->>'id')+2);
    bo:=(stage->>'bestOf')::integer;
    finished:=item->>'status'='FINISHED';
    requires_winner:=stage->>'type' in ('KNOCKOUT','DOUBLE_ELIMINATION','PLACEMENT') or suffix like 'sw-cutoff-set-%' or suffix like 'sw-playoff-%';
    options:=regexp_split_to_array(coalesce(stage->'settings'->>'roundBestOf',''),',');
    if suffix like 'sw-cutoff-set-%' or suffix like 'sw-playoff-%' then bo:=1;
    elsif stage->>'type' in ('KNOCKOUT','DOUBLE_ELIMINATION','PLACEMENT') and suffix ~ '^r[1-9][0-9]*-m[1-9][0-9]*$' then
      round_number:=substring(suffix from '^r([0-9]+)-')::integer;
      if coalesce(options[round_number],'') ~ '^[1-9][0-9]*$' then bo:=options[round_number]::integer; end if;
    end if;
    valid:=tournament_private.valid_online_score(sport,bo,item->'sets',finished,requires_winner,item->>'decisionSide');
    -- Bronze uses the final's actual Best-of; bracket-size changes can alter
    -- which configured round is the final. Accept a configured candidate here.
    if suffix='third-place' and not valid then
      foreach candidate in array options loop
        if candidate ~ '^[1-9][0-9]*$' and tournament_private.valid_online_score(sport,candidate::integer,item->'sets',finished,requires_winner,item->>'decisionSide') then valid:=true; exit; end if;
      end loop;
    end if;
    if not coalesce(valid,false) then raise exception 'invalid sport-specific result' using errcode='22023'; end if;
  end loop;
  return new;
end $$;
revoke all on function tournament_private.validate_online_scoring() from public,anon,authenticated;
create trigger zzz_validate_online_scoring before insert or update on tournament_private.online_tournaments for each row execute function tournament_private.validate_online_scoring();
alter policy "owner creates backups" on public.tournament_backups with check ((select auth.uid())=owner_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));
