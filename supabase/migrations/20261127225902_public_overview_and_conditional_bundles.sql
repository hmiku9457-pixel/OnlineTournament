-- Public overview metadata is separately consented by the existing detail
-- setting and always bound to the same match projection and revision.
alter table tournament_private.online_spectator_details add column overview jsonb;
create function tournament_private.clear_spectator_overview() returns trigger language plpgsql set search_path='' as $$
begin new.overview:=null; return new; end $$;
create trigger clear_spectator_overview before update of revision,matches on tournament_private.online_spectator_details
for each row execute function tournament_private.clear_spectator_overview();

create function tournament_private.publish_spectator_matches_v2(p_id text,p_token uuid,p_revision integer,p_matches jsonb,p_total integer,p_overview jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare h jsonb; r jsonb; n jsonb; a text; idx integer; seen integer[]:='{}';
begin
 if not tournament_private.publish_spectator_matches(p_id,p_token,p_revision,p_matches,p_total) then return false; end if;
 select tournament_private.report_header(id,payload) into h from tournament_private.online_tournaments where id=p_id;
 if jsonb_typeof(p_overview) is distinct from 'object' or (p_overview-array['recent','qualification'])<>'{}'::jsonb
 or jsonb_typeof(p_overview->'recent') is distinct from 'array' or jsonb_typeof(p_overview->'qualification') is distinct from 'array'
 or octet_length(p_overview::text)>524288 then raise exception 'invalid overview' using errcode='22023'; end if;
 if jsonb_array_length(p_overview->'recent')>20 or jsonb_array_length(p_overview->'qualification')>100 then raise exception 'overview limit' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(p_overview->'recent') loop
  if jsonb_typeof(r) is distinct from 'object' or (r-array['index','finishedAt'])<>'{}'::jsonb
   or jsonb_typeof(r->'index') is distinct from 'number' or not coalesce(r->>'index' ~ '^[0-9]{1,4}$',false)
   or jsonb_typeof(r->'finishedAt') is distinct from 'number' or not coalesce(r->>'finishedAt' ~ '^[1-9][0-9]{0,14}$',false)
  then raise exception 'invalid recent match' using errcode='22023'; end if;
  idx:=(r->>'index')::integer;
  if idx=any(seen) or p_matches->idx->>'status' is distinct from 'FINISHED' then raise exception 'invalid recent match reference' using errcode='22023'; end if;
  seen:=array_append(seen,idx);
 end loop;
 for r in select value from jsonb_array_elements(p_overview->'qualification') loop
  if jsonb_typeof(r) is distinct from 'object' or (r-array['phase','target','projected','possible','confirmed'])<>'{}'::jsonb
   or jsonb_typeof(r->'phase') is distinct from 'string' or length(r->>'phase')>300
   or not exists(select 1 from jsonb_array_elements(h->'stages') s where s->>'name'=r->>'phase')
   or jsonb_typeof(r->'target') is distinct from 'number' or not coalesce(r->>'target' ~ '^[1-9][0-9]{0,5}$',false)
   or jsonb_typeof(r->'projected') is distinct from 'array' or jsonb_typeof(r->'possible') is distinct from 'array'
   or coalesce(jsonb_typeof(r->'confirmed'),'') not in ('array','null')
  then raise exception 'invalid qualification' using errcode='22023'; end if;
  foreach a in array array['projected','possible','confirmed'] loop
   if r->a='null'::jsonb then continue; end if;
   for n in select value from jsonb_array_elements(r->a) loop
    if jsonb_typeof(n) is distinct from 'string' or not coalesce((h->'participantNames') ? (n#>>'{}'),false) then raise exception 'invalid qualification name' using errcode='22023'; end if;
   end loop;
  end loop;
 end loop;
 update tournament_private.online_spectator_details set overview=p_overview where tournament_id=p_id and revision=p_revision;
 return true;
end $$;
create function public.publish_online_spectator_matches_v2(p_id text,p_token uuid,p_revision integer,p_matches jsonb,p_total integer,p_overview jsonb)
returns boolean language sql security invoker set search_path='' as $$select tournament_private.publish_spectator_matches_v2(p_id,p_token,p_revision,p_matches,p_total,p_overview);$$;
create or replace function tournament_private.read_spectator_details(p_token uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when d.revision=t.revision then jsonb_build_object('revision',d.revision,'matches',d.matches,'total',d.total,'overview',d.overview)
 else jsonb_build_object('revision',t.revision,'matches',null,'total',null,'overview',null) end
 from tournament_private.online_spectator_links l join tournament_private.online_tournaments t on t.id=l.tournament_id
 left join tournament_private.online_spectator_details d on d.tournament_id=t.id
 where l.token=p_token and l.show_matches and not exists(select 1 from tournament_private.online_archives a where a.tournament_id=t.id);
$$;
create or replace function tournament_private.projection_plan_v2(p_id text,p_revision integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare plan jsonb;
begin
 plan:=tournament_private.projection_plan(p_id,p_revision);
 return plan||jsonb_build_object('player',(plan->>'player')::boolean or (
 exists(select 1 from tournament_private.online_player_links where tournament_id=p_id)
 and not exists(select 1 from tournament_private.online_player_projection where tournament_id=p_id and revision=p_revision and context_revision=p_revision)),
 'matches',(plan->>'matches')::boolean or (
 exists(select 1 from tournament_private.online_spectator_links where tournament_id=p_id and show_matches)
 and not exists(select 1 from tournament_private.online_spectator_details where tournament_id=p_id and revision=p_revision and overview is not null)));
end $$;

-- Capability checks run on every read. Hash the entire authorized response,
-- not just the revision: acknowledgements, reports and consent can change
-- without a canonical revision. Revocation must always return a full null view.
create function public.read_online_player_bundle_v2(p_token uuid,p_known_tag text default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when b->'view' is distinct from 'null'::jsonb and b->'view' is not null and md5(b::text)=p_known_tag
 then jsonb_build_object('unchanged',true,'tag',md5(b::text))
 else b||jsonb_build_object('unchanged',false,'tag',md5(b::text)) end
 from (select public.read_online_player_bundle(p_token) b) q;
$$;
create function public.read_online_spectator_bundle_v2(p_token uuid,p_known_tag text default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when b->'progress' is distinct from 'null'::jsonb and b->'progress' is not null and md5(b::text)=p_known_tag
 then jsonb_build_object('unchanged',true,'tag',md5(b::text))
 else b||jsonb_build_object('unchanged',false,'tag',md5(b::text)) end
 from (select public.read_online_spectator_bundle(p_token) b) q;
$$;
revoke all on function tournament_private.clear_spectator_overview(),tournament_private.publish_spectator_matches_v2(text,uuid,integer,jsonb,integer,jsonb),public.publish_online_spectator_matches_v2(text,uuid,integer,jsonb,integer,jsonb),public.read_online_player_bundle_v2(uuid,text),public.read_online_spectator_bundle_v2(uuid,text) from public,anon,authenticated;
grant execute on function tournament_private.publish_spectator_matches_v2(text,uuid,integer,jsonb,integer,jsonb),public.publish_online_spectator_matches_v2(text,uuid,integer,jsonb,integer,jsonb) to authenticated;
grant execute on function public.read_online_player_bundle_v2(uuid,text),public.read_online_spectator_bundle_v2(uuid,text) to anon,authenticated;
