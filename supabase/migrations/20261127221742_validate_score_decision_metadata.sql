create function tournament_private.valid_score_pair(p jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object' and jsonb_typeof(p->'sideAScore')='number' and jsonb_typeof(p->'sideBScore')='number'
 and case when p->>'sideAScore' ~ '^[0-9]{1,16}$' and p->>'sideBScore' ~ '^[0-9]{1,16}$' then (p->>'sideAScore')::numeric<=9007199254740991 and (p->>'sideBScore')::numeric<=9007199254740991 else false end,false);
$$;
create function tournament_private.valid_score_decision(sport text,item jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare d jsonb:=item->'decision'; progress jsonb:=item->'extraTimeProgress'; regulation jsonb; penalties jsonb; final_score jsonb:=item->'sets'->0; side text:=item->>'decisionSide'; a numeric; b numeric; ra numeric; rb numeric;
begin
 if side is not null and side not in ('A','B') then return false; end if;
 if d is null and progress is null then return true; end if;
 if sport not in ('football','futsal','handball','hockey','ice_hockey','basketball') or jsonb_array_length(item->'sets')<>1 or not tournament_private.valid_score_pair(final_score) then return false; end if;
 a:=(final_score->>'sideAScore')::numeric; b:=(final_score->>'sideBScore')::numeric;
 if progress is not null then
  if d is not null or side is not null or item->>'status'='FINISHED' or jsonb_typeof(progress) is distinct from 'object' then return false; end if;
  regulation:=progress->'regulationScore';
 else
  if jsonb_typeof(d) is distinct from 'object' or not coalesce(d->>'type' in ('EXTRA_TIME','PENALTIES','LOT'),false) then return false; end if;
  regulation:=d->'regulationScore';
 end if;
 if regulation is not null then
  if not tournament_private.valid_score_pair(regulation) then return false; end if;
  ra:=(regulation->>'sideAScore')::numeric; rb:=(regulation->>'sideBScore')::numeric;
  if ra<>rb or a<ra or b<rb then return false; end if;
 end if;
 if progress is not null then return regulation is not null; end if;
 if d->>'type'='EXTRA_TIME' then return regulation is not null and a<>b and (side is null or side=(case when a>b then 'A' else 'B' end)); end if;
 if a<>b then return false; end if;
 if d->>'type'='PENALTIES' then
  penalties:=d->'penaltyScore'; if not tournament_private.valid_score_pair(penalties) then return false; end if;
  ra:=(penalties->>'sideAScore')::numeric; rb:=(penalties->>'sideBScore')::numeric;
  return coalesce(ra<>rb and side=(case when ra>rb then 'A' else 'B' end),false);
 end if;
 return side is not null;
end $$;
revoke all on function tournament_private.valid_score_pair(jsonb),tournament_private.valid_score_decision(text,jsonb) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION tournament_private.validate_online_scoring()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    if not tournament_private.valid_score_decision(sport,item) then raise exception 'invalid score decision' using errcode='22023'; end if;
    if item->>'forcedWinner' is not null and (item->>'status'<>'FINISHED' or (item->>'forcedWinner'<>'ot:slot:unclaimed' and not exists(select 1 from jsonb_each_text(t->'participantIds') i where i.value=item->>'forcedWinner'))) then raise exception 'invalid administrative winner' using errcode='22023'; end if;
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
end $function$
;
