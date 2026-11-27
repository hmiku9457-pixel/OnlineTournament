-- RLS coverage, safe soft deletion and server-side match finalization.

create or replace function public.is_public_tournament(p_tournament_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id
      and t.deleted_at is null
      and t.visibility = 'PUBLIC'
  );
$$;

-- Never hard-delete tournaments from the browser. Product deletion is soft deletion.
drop policy if exists "delete only non-running tournaments" on public.tournaments;

create or replace function public.soft_delete_tournament(p_tournament_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_status public.tournament_status;
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'not allowed';
  end if;

  select status into v_status from public.tournaments where id = p_tournament_id for update;
  if v_status is null then raise exception 'tournament not found'; end if;
  if v_status in ('RUNNING','PAUSED') then raise exception 'running tournaments cannot be deleted'; end if;

  update public.tournaments
  set deleted_at = now(), deleted_by = auth.uid(), updated_at = now()
  where id = p_tournament_id;

  insert into public.audit_events(tournament_id, actor_user_id, event_type, entity_type, entity_id)
  values (p_tournament_id, auth.uid(), 'TOURNAMENT_SOFT_DELETED', 'tournament', p_tournament_id);

  return true;
end;
$$;

grant execute on function public.soft_delete_tournament(uuid) to authenticated;

-- Organization policies.
create policy "organizations readable by members" on public.organizations for select using (
  created_by = auth.uid() or exists (
    select 1 from public.organization_members om where om.organization_id = id and om.user_id = auth.uid()
  )
);
create policy "authenticated create organizations" on public.organizations for insert to authenticated with check (created_by = auth.uid());
create policy "organization creator manages" on public.organizations for update using (created_by = auth.uid());

create policy "organization members read membership" on public.organization_members for select using (
  user_id = auth.uid() or exists (
    select 1 from public.organizations o where o.id = organization_id and o.created_by = auth.uid()
  )
);
create policy "organization creator manages membership" on public.organization_members for all using (
  exists (select 1 from public.organizations o where o.id = organization_id and o.created_by = auth.uid())
) with check (
  exists (select 1 from public.organizations o where o.id = organization_id and o.created_by = auth.uid())
);

create policy "staff read tournament staff" on public.tournament_staff for select using (public.is_tournament_staff(tournament_id));
create policy "manager manages tournament staff" on public.tournament_staff for all using (public.can_manage_tournament(tournament_id)) with check (public.can_manage_tournament(tournament_id));

-- Venue hierarchy.
create policy "venues public read" on public.venues for select using (public.is_public_tournament(tournament_id) or public.is_tournament_staff(tournament_id));
create policy "venues manager all" on public.venues for all using (public.can_manage_tournament(tournament_id)) with check (public.can_manage_tournament(tournament_id));

create policy "areas public read" on public.areas for select using (
  exists (select 1 from public.venues v where v.id = venue_id and (public.is_public_tournament(v.tournament_id) or public.is_tournament_staff(v.tournament_id)))
);
create policy "areas manager all" on public.areas for all using (
  exists (select 1 from public.venues v where v.id = venue_id and public.can_manage_tournament(v.tournament_id))
) with check (
  exists (select 1 from public.venues v where v.id = venue_id and public.can_manage_tournament(v.tournament_id))
);

create policy "tables public read" on public.play_tables for select using (
  exists (
    select 1 from public.areas a join public.venues v on v.id = a.venue_id
    where a.id = area_id and (public.is_public_tournament(v.tournament_id) or public.is_tournament_staff(v.tournament_id))
  )
);
create policy "tables manager all" on public.play_tables for all using (
  exists (select 1 from public.areas a join public.venues v on v.id = a.venue_id where a.id = area_id and public.can_manage_tournament(v.tournament_id))
) with check (
  exists (select 1 from public.areas a join public.venues v on v.id = a.venue_id where a.id = area_id and public.can_manage_tournament(v.tournament_id))
);

-- Participant membership and stage/group data.
create policy "participant members manager read" on public.participant_members for select using (
  exists (select 1 from public.participants p where p.id = participant_id and public.is_tournament_staff(p.tournament_id))
);
create policy "participant members manager all" on public.participant_members for all using (
  exists (select 1 from public.participants p where p.id = participant_id and public.can_manage_tournament(p.tournament_id))
) with check (
  exists (select 1 from public.participants p where p.id = participant_id and public.can_manage_tournament(p.tournament_id))
);

create policy "stage participants public read" on public.stage_participants for select using (
  exists (select 1 from public.stages s where s.id = stage_id and (public.is_public_tournament(s.tournament_id) or public.is_tournament_staff(s.tournament_id)))
);
create policy "stage participants manager all" on public.stage_participants for all using (
  exists (select 1 from public.stages s where s.id = stage_id and public.can_manage_tournament(s.tournament_id))
) with check (
  exists (select 1 from public.stages s where s.id = stage_id and public.can_manage_tournament(s.tournament_id))
);

create policy "groups public read" on public.groups for select using (
  exists (select 1 from public.stages s where s.id = stage_id and (public.is_public_tournament(s.tournament_id) or public.is_tournament_staff(s.tournament_id)))
);
create policy "groups manager all" on public.groups for all using (
  exists (select 1 from public.stages s where s.id = stage_id and public.can_manage_tournament(s.tournament_id))
) with check (
  exists (select 1 from public.stages s where s.id = stage_id and public.can_manage_tournament(s.tournament_id))
);

create policy "group members public read" on public.group_members for select using (
  exists (select 1 from public.groups g join public.stages s on s.id = g.stage_id where g.id = group_id and (public.is_public_tournament(s.tournament_id) or public.is_tournament_staff(s.tournament_id)))
);
create policy "group members manager all" on public.group_members for all using (
  exists (select 1 from public.groups g join public.stages s on s.id = g.stage_id where g.id = group_id and public.can_manage_tournament(s.tournament_id))
) with check (
  exists (select 1 from public.groups g join public.stages s on s.id = g.stage_id where g.id = group_id and public.can_manage_tournament(s.tournament_id))
);

create policy "group table preferences manager all" on public.group_table_preferences for all using (
  exists (select 1 from public.groups g join public.stages s on s.id = g.stage_id where g.id = group_id and public.can_manage_tournament(s.tournament_id))
) with check (
  exists (select 1 from public.groups g join public.stages s on s.id = g.stage_id where g.id = group_id and public.can_manage_tournament(s.tournament_id))
);

create policy "match sides manager all" on public.match_sides for all using (
  exists (select 1 from public.matches m where m.id = match_id and public.can_manage_tournament(m.tournament_id))
) with check (
  exists (select 1 from public.matches m where m.id = match_id and public.can_manage_tournament(m.tournament_id))
);
create policy "match sets manager all" on public.match_sets for all using (
  exists (select 1 from public.matches m where m.id = match_id and public.can_manage_tournament(m.tournament_id))
) with check (
  exists (select 1 from public.matches m where m.id = match_id and public.can_manage_tournament(m.tournament_id))
);
create policy "confirmations manager read" on public.match_confirmations for select using (
  exists (select 1 from public.matches m where m.id = match_id and public.is_tournament_staff(m.tournament_id))
);
create policy "audit manager read" on public.audit_events for select using (public.is_tournament_staff(tournament_id));

-- Live scoring: any score edit invalidates prior finalization/confirmations.
create or replace function public.submit_match_set(
  p_match_id uuid,
  p_match_code text,
  p_set_number integer,
  p_side_a_score integer,
  p_side_b_score integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_match public.matches;
  v_tournament public.tournaments;
begin
  if not public.verify_match_code(p_match_id, p_match_code) then raise exception 'invalid match code'; end if;
  if p_set_number < 1 or p_side_a_score < 0 or p_side_b_score < 0 then raise exception 'invalid set data'; end if;

  select * into v_match from public.matches where id = p_match_id for update;
  select * into v_tournament from public.tournaments where id = v_match.tournament_id;
  if v_tournament.status not in ('RUNNING','PAUSED') then raise exception 'tournament is not running'; end if;

  insert into public.match_sets(match_id, set_number, side_a_score, side_b_score)
  values (p_match_id, p_set_number, p_side_a_score, p_side_b_score)
  on conflict (match_id, set_number)
  do update set side_a_score = excluded.side_a_score, side_b_score = excluded.side_b_score, updated_at = now();

  delete from public.match_confirmations where match_id = p_match_id;
  update public.matches
  set status = 'LIVE', started_at = coalesce(started_at, now()), finished_at = null,
      confirmed_at = null, winner_participant_id = null, updated_at = now()
  where id = p_match_id;

  return jsonb_build_object('ok', true, 'match_id', p_match_id, 'set_number', p_set_number);
end;
$$;

create or replace function public.finish_match_with_code(p_match_id uuid, p_match_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_match public.matches;
  v_tournament public.tournaments;
  v_set record;
  v_wins_a integer := 0;
  v_wins_b integer := 0;
  v_required integer;
  v_winner uuid;
  v_side_a uuid;
  v_side_b uuid;
begin
  if not public.verify_match_code(p_match_id, p_match_code) then raise exception 'invalid match code'; end if;
  select * into v_match from public.matches where id = p_match_id for update;
  select * into v_tournament from public.tournaments where id = v_match.tournament_id;
  if v_tournament.status not in ('RUNNING','PAUSED') then raise exception 'tournament is not running'; end if;

  v_required := (v_match.best_of / 2) + 1;

  for v_set in select * from public.match_sets where match_id = p_match_id order by set_number loop
    if greatest(v_set.side_a_score, v_set.side_b_score) < v_tournament.points_to_win_set
       or abs(v_set.side_a_score - v_set.side_b_score) < v_tournament.win_by then
      raise exception 'invalid finished set %', v_set.set_number;
    end if;
    if v_set.side_a_score > v_set.side_b_score then v_wins_a := v_wins_a + 1;
    elsif v_set.side_b_score > v_set.side_a_score then v_wins_b := v_wins_b + 1;
    else raise exception 'set cannot be tied';
    end if;

    if (v_wins_a >= v_required or v_wins_b >= v_required) and exists (
      select 1 from public.match_sets later where later.match_id = p_match_id and later.set_number > v_set.set_number
    ) then
      raise exception 'sets exist after match winner was determined';
    end if;
  end loop;

  if (v_wins_a >= v_required) = (v_wins_b >= v_required) then raise exception 'match has no unique winner'; end if;

  select participant_id into v_side_a from public.match_sides where match_id = p_match_id and side = 1;
  select participant_id into v_side_b from public.match_sides where match_id = p_match_id and side = 2;
  v_winner := case when v_wins_a >= v_required then v_side_a else v_side_b end;
  if v_winner is null then raise exception 'winning side has no participant'; end if;

  delete from public.match_confirmations where match_id = p_match_id;
  update public.matches
  set status = 'FINISHED', winner_participant_id = v_winner, finished_at = now(), confirmed_at = null, updated_at = now()
  where id = p_match_id;

  return jsonb_build_object('ok', true, 'winner_participant_id', v_winner, 'wins_a', v_wins_a, 'wins_b', v_wins_b);
end;
$$;

grant execute on function public.finish_match_with_code(uuid, text) to anon, authenticated;

-- Confirmation is allowed only after the result was finalized.
create or replace function public.confirm_match_result(p_match_id uuid, p_player_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_person_id uuid;
  v_side_id uuid;
  v_tournament_id uuid;
  v_status public.match_status;
  v_required integer;
  v_confirmed integer;
begin
  select m.tournament_id, m.status into v_tournament_id, v_status from public.matches m where m.id = p_match_id;
  if v_tournament_id is null then raise exception 'match not found'; end if;
  if v_status <> 'FINISHED' then raise exception 'match must be finished before confirmation'; end if;

  select p.id into v_person_id from public.people p
  where p.tournament_id = v_tournament_id and p.player_code_hash = crypt(upper(trim(p_player_code)), p.player_code_hash)
  limit 1;
  if v_person_id is null then raise exception 'invalid player code'; end if;

  select ms.id into v_side_id
  from public.match_sides ms join public.participant_members pm on pm.participant_id = ms.participant_id
  where ms.match_id = p_match_id and pm.person_id = v_person_id limit 1;
  if v_side_id is null then raise exception 'player is not part of this match'; end if;

  insert into public.match_confirmations(match_id, match_side_id, person_id)
  values (p_match_id, v_side_id, v_person_id)
  on conflict (match_id, match_side_id) do update set person_id = excluded.person_id, confirmed_at = now();

  select count(*) into v_required from public.match_sides where match_id = p_match_id and participant_id is not null and not is_bye;
  select count(*) into v_confirmed from public.match_confirmations where match_id = p_match_id;

  if v_required > 0 and v_confirmed >= v_required then
    update public.matches set status = 'CONFIRMED', confirmed_at = now(), updated_at = now() where id = p_match_id;
  end if;

  return jsonb_build_object('ok', true, 'confirmed_sides', v_confirmed, 'required_sides', v_required);
end;
$$;
