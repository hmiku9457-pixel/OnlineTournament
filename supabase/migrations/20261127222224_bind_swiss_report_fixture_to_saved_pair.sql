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
 and not exists(select 1 from jsonb_array_elements((t.payload->'entries'->>'online-tournament:mock-match-results:v2')::jsonb) r
 where r->>'matchId'=f.match_id and (r->>'status' in ('FINISHED','CANCELLED','CONFIRMATION') or jsonb_array_length(coalesce(r->'sets','[]'::jsonb))>0 or r ? 'forcedWinner' or r ? 'extraTimeProgress')),false);
$function$
;