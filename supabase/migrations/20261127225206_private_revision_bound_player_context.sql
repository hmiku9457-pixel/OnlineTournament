-- Version-bound private participant summaries. The old public match
-- projection API remains valid; personal summaries are never spectator data.
alter table tournament_private.online_player_projection add column context_revision integer;
alter table tournament_private.online_player_projection add column contexts jsonb not null default '{}'::jsonb check(jsonb_typeof(contexts)='object');
create function tournament_private.publish_player_projection_v2(p_id text,p_token uuid,p_revision integer,p_matches jsonb,p_total integer,p_contexts jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare h jsonb; participant text; j jsonb; r jsonb;
begin
 if not tournament_private.publish_player_projection(p_id,p_token,p_revision,p_matches,p_total) then return false; end if;
 select tournament_private.report_header(id,payload) into h from tournament_private.online_tournaments where id=p_id;
 if jsonb_typeof(p_contexts) is distinct from 'object' or octet_length(p_contexts::text)>2097152 then raise exception 'invalid player context' using errcode='22023'; end if;
 for participant,j in select key,value from jsonb_each(p_contexts) loop
  if not exists(select 1 from jsonb_each_text(h->'participantIds') i where i.value=participant)
   or jsonb_typeof(j) is distinct from 'object'
   or (j-array['phaseStatus','placement','lastFinishedAt','breakUntil','rankings'])<>'{}'::jsonb
   or not(j ?& array['phaseStatus','placement','lastFinishedAt','breakUntil','rankings'])
   or jsonb_typeof(j->'phaseStatus') is distinct from 'string' or length(j->>'phaseStatus')>500
   or jsonb_typeof(j->'placement') not in ('null','string') or length(j->>'placement')>300
   or jsonb_typeof(j->'lastFinishedAt') not in ('null','number')
   or (j->'lastFinishedAt'<>'null'::jsonb and not coalesce(j->>'lastFinishedAt' ~ '^[1-9][0-9]{0,14}$',false))
   or jsonb_typeof(j->'breakUntil') not in ('null','number')
   or (j->'breakUntil'<>'null'::jsonb and not coalesce(j->>'breakUntil' ~ '^[1-9][0-9]{0,14}$',false))
   or jsonb_typeof(j->'rankings') is distinct from 'array' then raise exception 'invalid player context row' using errcode='22023'; end if;
  if jsonb_array_length(j->'rankings')>100 then raise exception 'too many personal rankings' using errcode='22023'; end if;
  for r in select value from jsonb_array_elements(j->'rankings') loop
   if jsonb_typeof(r) is distinct from 'object' or (r-array['phase','label','rank'])<>'{}'::jsonb
    or not(r ?& array['phase','label','rank'])
    or jsonb_typeof(r->'phase') is distinct from 'string' or length(r->>'phase')>300
    or jsonb_typeof(r->'label') is distinct from 'string' or length(r->>'label')>300
    or jsonb_typeof(r->'rank') is distinct from 'number' or not coalesce(r->>'rank' ~ '^[1-9][0-9]{0,5}$',false)
    then raise exception 'invalid personal ranking' using errcode='22023'; end if;
  end loop;
 end loop;
 update tournament_private.online_player_projection set contexts=p_contexts,context_revision=p_revision where tournament_id=p_id;
 return true;
end $$;
create function tournament_private.read_player_context(p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select d.contexts->l.participant_id from tournament_private.online_player_links l
 join tournament_private.online_tournaments t on t.id=l.tournament_id
 join tournament_private.online_player_projection d on d.tournament_id=t.id and d.revision=t.revision and d.context_revision=t.revision
 where l.token=p_token and exists(select 1 from jsonb_each_text(tournament_private.report_header(t.id,t.payload)->'participantIds') i where i.value=l.participant_id)
 and not exists(select 1 from tournament_private.online_archives a where a.tournament_id=t.id);
$$;
create function tournament_private.projection_plan_v2(p_id text,p_revision integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare plan jsonb;
begin
 plan:=tournament_private.projection_plan(p_id,p_revision);
 return plan||jsonb_build_object('player',(plan->>'player')::boolean or (
 exists(select 1 from tournament_private.online_player_links where tournament_id=p_id)
 and not exists(select 1 from tournament_private.online_player_projection where tournament_id=p_id and revision=p_revision and context_revision=p_revision)));
end $$;
create function public.publish_online_player_projection_v2(p_id text,p_token uuid,p_revision integer,p_matches jsonb,p_total integer,p_contexts jsonb) returns boolean
language sql security invoker set search_path='' as $$select tournament_private.publish_player_projection_v2(p_id,p_token,p_revision,p_matches,p_total,p_contexts);$$;
create function public.online_projection_plan_v2(p_id text,p_revision integer) returns jsonb
language sql stable security invoker set search_path='' as $$select tournament_private.projection_plan_v2(p_id,p_revision);$$;
create or replace function public.read_online_player_bundle(p_token uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('view',v.data,'reports',case when v.data is null then '[]'::jsonb else public.read_online_player_reports(p_token) end,
 'calls',case when v.data is null then '[]'::jsonb else tournament_private.player_match_calls(p_token) end,
 'context',case when v.data is null then null else tournament_private.read_player_context(p_token) end)
 from (select public.read_online_player_access(p_token) as data) v;
$$;
revoke all on function tournament_private.publish_player_projection_v2(text,uuid,integer,jsonb,integer,jsonb),tournament_private.read_player_context(uuid),tournament_private.projection_plan_v2(text,integer),public.publish_online_player_projection_v2(text,uuid,integer,jsonb,integer,jsonb),public.online_projection_plan_v2(text,integer) from public,anon,authenticated;
grant execute on function tournament_private.publish_player_projection_v2(text,uuid,integer,jsonb,integer,jsonb),tournament_private.projection_plan_v2(text,integer),public.publish_online_player_projection_v2(text,uuid,integer,jsonb,integer,jsonb),public.online_projection_plan_v2(text,integer) to authenticated;
grant execute on function tournament_private.read_player_context(uuid) to anon,authenticated;
