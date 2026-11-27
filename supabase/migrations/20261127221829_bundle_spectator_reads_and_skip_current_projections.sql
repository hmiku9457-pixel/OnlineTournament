-- Single statement read of every allowlisted public projection. The
-- capability checks remain in the existing functions, no private snapshot.
create function public.read_online_spectator_bundle(p_token uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('progress',v.data,
 'details',case when v.data is not null then public.read_online_spectator_details(p_token) else null end,
 'rankings',case when v.data is not null then public.read_online_spectator_rankings(p_token) else null end,
 'brackets',case when v.data is not null then public.read_online_spectator_brackets(p_token) else null end)
 from (select public.read_online_spectator(p_token) as data) v;
$$;
create function tournament_private.projection_plan(p_id text,p_revision integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); current_revision integer; player_enabled boolean; spectator_enabled boolean;
begin
 select revision into current_revision from tournament_private.online_tournaments where id=p_id and owner_id=v_owner;
 if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if current_revision is distinct from p_revision then raise exception 'revision conflict' using errcode='40001'; end if;
 player_enabled:=exists(select 1 from tournament_private.online_player_links where tournament_id=p_id);
 spectator_enabled:=exists(select 1 from tournament_private.online_spectator_links where tournament_id=p_id and show_matches);
 return jsonb_build_object(
 'player',player_enabled and not exists(select 1 from tournament_private.online_player_projection where tournament_id=p_id and revision=p_revision),
 'matches',spectator_enabled and not exists(select 1 from tournament_private.online_spectator_details where tournament_id=p_id and revision=p_revision),
 'rankings',spectator_enabled and not exists(select 1 from tournament_private.online_spectator_rankings where tournament_id=p_id and revision=p_revision),
 'brackets',spectator_enabled and not exists(select 1 from tournament_private.online_spectator_brackets where tournament_id=p_id and revision=p_revision));
end $$;
create function public.online_projection_plan(p_id text,p_revision integer) returns jsonb
language sql stable security invoker set search_path='' as $$select tournament_private.projection_plan(p_id,p_revision);$$;
revoke all on function public.read_online_spectator_bundle(uuid),tournament_private.projection_plan(text,integer),public.online_projection_plan(text,integer) from public,anon,authenticated;
grant execute on function public.read_online_spectator_bundle(uuid) to anon,authenticated;
grant execute on function tournament_private.projection_plan(text,integer),public.online_projection_plan(text,integer) to authenticated;
