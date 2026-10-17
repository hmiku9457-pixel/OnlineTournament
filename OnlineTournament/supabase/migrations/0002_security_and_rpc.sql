-- Helper predicates -----------------------------------------------------------
create or replace function public.is_tournament_staff(p_tournament_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id and t.owner_id = auth.uid()
  ) or exists (
    select 1 from public.tournament_staff s
    where s.tournament_id = p_tournament_id and s.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_tournament(p_tournament_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id and t.owner_id = auth.uid()
  ) or exists (
    select 1 from public.tournament_staff s
    where s.tournament_id = p_tournament_id
      and s.user_id = auth.uid()
      and s.role in ('OWNER','ORGANIZATION_ADMIN','TOURNAMENT_DIRECTOR','STAFF')
  );
$$;

-- RLS ------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_staff enable row level security;
alter table public.venues enable row level security;
alter table public.areas enable row level security;
alter table public.play_tables enable row level security;
alter table public.people enable row level security;
alter table public.competitions enable row level security;
alter table public.participants enable row level security;
alter table public.participant_members enable row level security;
alter table public.stages enable row level security;
alter table public.stage_participants enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_table_preferences enable row level security;
alter table public.matches enable row level security;
alter table public.match_sides enable row level security;
alter table public.match_sets enable row level security;
alter table public.match_confirmations enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles self read" on public.profiles for select using (id = auth.uid());
create policy "profiles self update" on public.profiles for update using (id = auth.uid());

create policy "public tournaments readable" on public.tournaments for select using (
  deleted_at is null and (visibility = 'PUBLIC' or owner_id = auth.uid() or public.is_tournament_staff(id))
);
create policy "authenticated users create tournaments" on public.tournaments for insert to authenticated with check (owner_id = auth.uid());
create policy "managers update tournaments" on public.tournaments for update using (public.can_manage_tournament(id));
create policy "delete only non-running tournaments" on public.tournaments for delete using (
  public.can_manage_tournament(id) and status in ('DRAFT','REGISTRATION','READY','ABORTED','FINISHED','ARCHIVED')
);

-- Public read model for live tournament information. Player codes/hashes are never exposed.
create policy "public competitions read" on public.competitions for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and t.deleted_at is null and t.visibility = 'PUBLIC')
  or public.is_tournament_staff(tournament_id)
);
create policy "public participants read" on public.participants for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and t.deleted_at is null and t.visibility = 'PUBLIC')
  or public.is_tournament_staff(tournament_id)
);
create policy "public stages read" on public.stages for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and t.deleted_at is null and t.visibility = 'PUBLIC')
  or public.is_tournament_staff(tournament_id)
);
create policy "public matches read" on public.matches for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and t.deleted_at is null and t.visibility = 'PUBLIC')
  or public.is_tournament_staff(tournament_id)
);

create policy "public match sides read" on public.match_sides for select using (
  exists (select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id where m.id = match_id and t.visibility = 'PUBLIC' and t.deleted_at is null)
  or exists (select 1 from public.matches m where m.id = match_id and public.is_tournament_staff(m.tournament_id))
);
create policy "public match sets read" on public.match_sets for select using (
  exists (select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id where m.id = match_id and t.visibility = 'PUBLIC' and t.deleted_at is null)
  or exists (select 1 from public.matches m where m.id = match_id and public.is_tournament_staff(m.tournament_id))
);

-- Generic manager policies for internal tournament data.
create policy "managers all people" on public.people for all using (public.can_manage_tournament(tournament_id)) with check (public.can_manage_tournament(tournament_id));
create policy "managers all competitions" on public.competitions for all using (public.can_manage_tournament(tournament_id)) with check (public.can_manage_tournament(tournament_id));
create policy "managers all participants" on public.participants for all using (public.can_manage_tournament(tournament_id)) with check (public.can_manage_tournament(tournament_id));
create policy "managers all stages" on public.stages for all using (public.can_manage_tournament(tournament_id)) with check (public.can_manage_tournament(tournament_id));
create policy "managers all matches" on public.matches for all using (public.can_manage_tournament(tournament_id)) with check (public.can_manage_tournament(tournament_id));

-- Code verification & score entry --------------------------------------------
create or replace function public.verify_match_code(p_match_id uuid, p_code text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and m.match_code_hash = crypt(upper(trim(p_code)), m.match_code_hash)
      and m.status not in ('CONFIRMED','CANCELLED','WALKOVER')
  );
$$;

grant execute on function public.verify_match_code(uuid, text) to anon, authenticated;

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
  if not public.verify_match_code(p_match_id, p_match_code) then
    raise exception 'invalid match code';
  end if;
  if p_set_number < 1 or p_side_a_score < 0 or p_side_b_score < 0 then
    raise exception 'invalid set data';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  select * into v_tournament from public.tournaments where id = v_match.tournament_id;

  if v_tournament.status not in ('RUNNING','PAUSED') then
    raise exception 'tournament is not running';
  end if;

  insert into public.match_sets(match_id, set_number, side_a_score, side_b_score)
  values (p_match_id, p_set_number, p_side_a_score, p_side_b_score)
  on conflict (match_id, set_number)
  do update set side_a_score = excluded.side_a_score,
                side_b_score = excluded.side_b_score,
                updated_at = now();

  update public.matches
  set status = case when status in ('DRAFT','SCHEDULED') then 'LIVE' else status end,
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = p_match_id;

  return jsonb_build_object('ok', true, 'match_id', p_match_id, 'set_number', p_set_number);
end;
$$;

grant execute on function public.submit_match_set(uuid, text, integer, integer, integer) to anon, authenticated;

create or replace function public.confirm_match_result(p_match_id uuid, p_player_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_person_id uuid;
  v_side_id uuid;
  v_tournament_id uuid;
  v_required integer;
  v_confirmed integer;
begin
  select m.tournament_id into v_tournament_id from public.matches m where m.id = p_match_id;
  if v_tournament_id is null then raise exception 'match not found'; end if;

  select p.id into v_person_id
  from public.people p
  where p.tournament_id = v_tournament_id
    and p.player_code_hash = crypt(upper(trim(p_player_code)), p.player_code_hash)
  limit 1;
  if v_person_id is null then raise exception 'invalid player code'; end if;

  select ms.id into v_side_id
  from public.match_sides ms
  join public.participant_members pm on pm.participant_id = ms.participant_id
  where ms.match_id = p_match_id and pm.person_id = v_person_id
  limit 1;
  if v_side_id is null then raise exception 'player is not part of this match'; end if;

  insert into public.match_confirmations(match_id, match_side_id, person_id)
  values (p_match_id, v_side_id, v_person_id)
  on conflict (match_id, match_side_id)
  do update set person_id = excluded.person_id, confirmed_at = now();

  select count(*) into v_required from public.match_sides where match_id = p_match_id and participant_id is not null and not is_bye;
  select count(*) into v_confirmed from public.match_confirmations where match_id = p_match_id;

  if v_required > 0 and v_confirmed >= v_required then
    update public.matches set status = 'CONFIRMED', confirmed_at = now(), updated_at = now() where id = p_match_id;
  else
    update public.matches set status = 'FINISHED', finished_at = coalesce(finished_at, now()), updated_at = now() where id = p_match_id and status <> 'CONFIRMED';
  end if;

  return jsonb_build_object('ok', true, 'confirmed_sides', v_confirmed, 'required_sides', v_required);
end;
$$;

grant execute on function public.confirm_match_result(uuid, text) to anon, authenticated;

-- Hide secrets from direct client reads.
revoke select (player_code_hash) on public.people from anon, authenticated;
revoke select (match_code_hash) on public.matches from anon, authenticated;
