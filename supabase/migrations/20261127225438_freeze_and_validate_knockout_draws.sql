-- Freeze the actual KO draw and bind played/assigned fixtures to the
-- bracket derived from it. Older already-started phases without a saved
-- draw cannot be reconstructed exactly; new clients save every draw first.
create function tournament_private.ko_expected_pairs(p_id text,p_payload jsonb,p_stage text,p_slots jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare current_slots text[]; next_slots text[]; result_index jsonb; expected jsonb:='{}'; n integer; rn integer:=1; ix integer;
 a text; b text; w text; mid text; r jsonb; sa integer; sb integer; losers text[]:='{}'; entrant_count integer;
begin
 select array_agg(case when value->>'kind'='participant' then value->>'participantId' when value->>'kind'='bye' then 'ot:slot:bye' else null end order by ordinality)
 into current_slots from jsonb_array_elements(p_slots) with ordinality;
 n:=cardinality(current_slots)/2;
 select count(*) into entrant_count from unnest(current_slots) x where x<>'ot:slot:bye';
 select coalesce(jsonb_object_agg(value->>'matchId',value),'{}'::jsonb) into result_index
 from jsonb_array_elements((p_payload->'entries'->>'online-tournament:mock-match-results:v2')::jsonb);
 while n>=1 loop
  next_slots:='{}';
  for ix in 1..n loop
   a:=current_slots[ix*2-1]; b:=current_slots[ix*2]; w:=null;
   mid:=p_stage||'-r'||rn||'-m'||ix;
   if a='ot:slot:bye' and b is not null and b<>'ot:slot:bye' then w:=b;
   elsif b='ot:slot:bye' and a is not null and a<>'ot:slot:bye' then w:=a;
   elsif a is not null and b is not null and a<>'ot:slot:bye' and b<>'ot:slot:bye' then
    expected:=expected||jsonb_build_object(mid,jsonb_build_array(a,b));
    r:=result_index->mid;
    if r->>'status'='FINISHED' then
     if r ? 'forcedWinner' then
      if r->>'forcedWinner' in (a,b) then w:=r->>'forcedWinner'; end if;
     elsif r->>'decisionSide'='A' then w:=a;
     elsif r->>'decisionSide'='B' then w:=b;
     else
      select count(*) filter(where (s->>'sideAScore')::numeric>(s->>'sideBScore')::numeric),
             count(*) filter(where (s->>'sideBScore')::numeric>(s->>'sideAScore')::numeric)
      into sa,sb from jsonb_array_elements(r->'sets') s;
      if sa>sb then w:=a; elsif sb>sa then w:=b; end if;
     end if;
    end if;
   end if;
   if n=2 then
    losers:=array_append(losers,case when w=a and b<>'ot:slot:bye' then b when w=b and a<>'ot:slot:bye' then a else null end);
   end if;
   next_slots:=array_append(next_slots,w);
  end loop;
  current_slots:=next_slots; n:=n/2; rn:=rn+1;
 end loop;
 if entrant_count>=4 and losers[1] is not null and losers[2] is not null then
  expected:=expected||jsonb_build_object(p_stage||'-third-place',jsonb_build_array(losers[1],losers[2]));
 end if;
 return expected;
end $$;
create function tournament_private.validate_online_ko_draw() returns trigger
language plpgsql security invoker set search_path='' as $$
declare e jsonb:=new.payload->'entries'; h jsonb:=tournament_private.report_header(new.id,new.payload);
 life jsonb:=((e->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0;
 old_life jsonb; old_draws jsonb; old_slots jsonb; draws jsonb:=(e->>'online-tournament:mock-draw-config:v1')::jsonb;
 stage jsonb; sid text; slots jsonb; entrants jsonb; item jsonb; roster text[]; seen text[]; n integer; ix integer; id text; expected jsonb; pair jsonb;
 results jsonb:=(e->>'online-tournament:mock-match-results:v2')::jsonb;
 runtime jsonb:=(e->>'online-tournament:mock-match-runtime:v1')::jsonb;
begin
 if tg_op='UPDATE' then
  old_life:=((old.payload->'entries'->>'online-tournament:mock-phase-lifecycle:v1')::jsonb)->0;
  old_draws:=(old.payload->'entries'->>'online-tournament:mock-draw-config:v1')::jsonb;
 end if;
 for stage in select value from jsonb_array_elements(h->'stages') where value->>'type'='KNOCKOUT' loop
  sid:=stage->>'id';
  if not coalesce(life->'startedStageIds' ? sid,false) then continue; end if;
  select value->'bracketSlots' into slots from jsonb_array_elements(draws) where value->>'stageId'=sid;
  if tg_op='UPDATE' and coalesce(old_life->'startedStageIds' ? sid,false) then
   select value->'bracketSlots' into old_slots from jsonb_array_elements(old_draws) where value->>'stageId'=sid;
   if old_slots is not null and slots is distinct from old_slots then raise exception 'started KO draw cannot change' using errcode='22023'; end if;
   if old_slots is not null and life->'stageEntrants'->sid is distinct from old_life->'stageEntrants'->sid then raise exception 'started KO field cannot change' using errcode='22023'; end if;
   -- Grandfather only phases already running before this migration.
   if old_slots is null and slots is null then continue; end if;
  end if;
  entrants:=life->'stageEntrants'->sid;
  if jsonb_typeof(slots) is distinct from 'array' or jsonb_typeof(entrants) is distinct from 'array' then raise exception 'started KO needs frozen draw and entrants' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(draws) where value->>'stageId'=sid)>1 then raise exception 'duplicate KO draw' using errcode='22023'; end if;
  n:=jsonb_array_length(slots);
  if n<2 or n>4096 or (n & (n-1))<>0 or jsonb_array_length(entrants)<=n/2 or jsonb_array_length(entrants)>n then raise exception 'invalid KO draw size' using errcode='22023'; end if;
  select coalesce(array_agg(value),'{}') into roster from jsonb_array_elements_text(entrants);
  seen:='{}';
  for ix in 0..n-1 loop
   item:=slots->ix;
   if item='{"kind":"bye"}'::jsonb then
    if ix%2=1 and slots->(ix-1)='{"kind":"bye"}'::jsonb then raise exception 'double KO bye' using errcode='22023'; end if;
   elsif jsonb_typeof(item)='object' and item->>'kind'='participant' and (item-array['kind','participantId'])='{}'::jsonb then
    id:=item->>'participantId';
    if id is null or not(id=any(roster)) or id=any(seen) then raise exception 'invalid KO participant' using errcode='22023'; end if;
    seen:=array_append(seen,id);
   else raise exception 'invalid KO slot' using errcode='22023';
   end if;
  end loop;
  if cardinality(seen)<>cardinality(roster) then raise exception 'incomplete KO draw' using errcode='22023'; end if;
  expected:=tournament_private.ko_expected_pairs(new.id,new.payload,sid,slots);
  for item in select value from jsonb_array_elements(results||runtime) where starts_with(value->>'matchId',sid||'-') loop
   if item->>'status'='CANCELLED' and item->>'startedAt' is null and jsonb_array_length(coalesce(item->'sets','[]'::jsonb))=0 then continue; end if;
   if item->>'startedAt' is null and coalesce(item->>'status','WAITING')='WAITING' and not(item ? 'sets') and coalesce(item->>'table','Noch offen')='Noch offen' then continue; end if;
   pair:=expected->(item->>'matchId');
   if pair is null then raise exception 'unknown or unresolved KO match' using errcode='22023'; end if;
   if item ? 'forcedWinner' and not coalesce(item->>'forcedWinner' in (pair->>0,pair->>1,'ot:slot:unclaimed'),false) then raise exception 'forced KO winner not in pairing' using errcode='22023'; end if;
  end loop;
 end loop;
 return new;
end $$;
create trigger zzzzzz_validate_online_ko_draw before insert or update on tournament_private.online_tournaments for each row execute function tournament_private.validate_online_ko_draw();
create function tournament_private.ko_report_pair_valid(f tournament_private.online_report_fixtures,t tournament_private.online_tournaments) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare h jsonb:=tournament_private.report_header(t.id,t.payload); sid text; slots jsonb; pair jsonb;
begin
 select value->>'id' into sid from jsonb_array_elements(h->'stages') where value->>'type'='KNOCKOUT' and starts_with(f.match_id,(value->>'id')||'-');
 if sid is null then return true; end if;
 select value->'bracketSlots' into slots from jsonb_array_elements((t.payload->'entries'->>'online-tournament:mock-draw-config:v1')::jsonb) where value->>'stageId'=sid;
 if slots is null then return true; end if;
 -- First-round calls can be checked directly without traversing the tree.
 if substring(f.match_id from length(sid)+2) ~ '^r1-m[1-9][0-9]{0,5}$' then
  pair:=jsonb_build_array(slots->(2*(substring(f.match_id from '-m([0-9]+)$')::int-1))->>'participantId',
                         slots->(2*(substring(f.match_id from '-m([0-9]+)$')::int-1)+1)->>'participantId');
 else
  pair:=tournament_private.ko_expected_pairs(t.id,t.payload,sid,slots)->f.match_id;
 end if;
 return coalesce(pair->>0=f.a_id and pair->>1=f.b_id,false);
end $$;
revoke all on function tournament_private.ko_expected_pairs(text,jsonb,text,jsonb),tournament_private.validate_online_ko_draw(),tournament_private.ko_report_pair_valid(tournament_private.online_report_fixtures,tournament_private.online_tournaments) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION tournament_private.report_fixture_live(f tournament_private.online_report_fixtures, t tournament_private.online_tournaments)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(t.revision=f.revision and tournament_private.report_header(t.id,t.payload)->>'status' in ('RUNNING','PAUSED')
 and exists(select 1 from jsonb_array_elements((t.payload->'entries'->>'online-tournament:mock-match-runtime:v1')::jsonb) r
 where r->>'matchId'=f.match_id and r->>'status' in ('LIVE','READY') and r->>'startedAt'=f.started_at::text and r->>'table' ~ '^Tisch [1-9][0-9]*$')
 and (f.match_id !~ '-sw-r[1-9][0-9]{0,3}-m[1-9][0-9]{0,5}$' or exists(
   select 1 from jsonb_array_elements((t.payload->'entries'->>'online-tournament:swiss-round-fixtures:v1')::jsonb) j
   cross join lateral jsonb_array_elements(j->'pairs') with ordinality as pair(value,position)
   where f.match_id=(j->>'stageId')||'-sw-r'||(j->>'round')||'-m'||pair.position::text
     and pair.value->>0=f.a_id and pair.value->>1=f.b_id
 ))
 and tournament_private.ko_report_pair_valid(f,t)
 and not exists(select 1 from jsonb_array_elements((t.payload->'entries'->>'online-tournament:mock-match-results:v2')::jsonb) r
 where r->>'matchId'=f.match_id and (r->>'status' in ('FINISHED','CANCELLED','CONFIRMATION') or jsonb_array_length(coalesce(r->'sets','[]'::jsonb))>0 or r ? 'forcedWinner' or r ? 'extraTimeProgress')),false);
$function$
;