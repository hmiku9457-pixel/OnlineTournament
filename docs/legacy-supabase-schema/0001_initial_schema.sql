create extension if not exists pgcrypto;

create type public.tournament_status as enum ('DRAFT','REGISTRATION','READY','RUNNING','PAUSED','ABORTED','FINISHED','ARCHIVED');
create type public.visibility as enum ('PRIVATE','UNLISTED','PUBLIC');
create type public.discipline as enum ('SINGLES','DOUBLES');
create type public.participant_status as enum ('ACTIVE','WITHDRAWN','DISQUALIFIED','FINISHED');
create type public.stage_type as enum ('ROUND_ROBIN','GROUPS','SWISS','KNOCKOUT','DOUBLE_ELIMINATION','PLACEMENT');
create type public.match_status as enum ('DRAFT','SCHEDULED','LIVE','FINISHED','CONFIRMED','WALKOVER','CANCELLED');
create type public.staff_role as enum ('OWNER','ORGANIZATION_ADMIN','TOURNAMENT_DIRECTOR','STAFF','REFEREE','SCORER');
create type public.account_status as enum ('NORMAL','TRUSTED','RESTRICTED','SUSPENDED');
create type public.table_preference_mode as enum ('PREFERRED','STRICT');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  account_status public.account_status not null default 'NORMAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.staff_role not null default 'STAFF',
  primary key (organization_id, user_id)
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  owner_id uuid not null references public.profiles(id),
  name text not null,
  slug text not null,
  sport text not null default 'table_tennis',
  discipline public.discipline not null default 'SINGLES',
  status public.tournament_status not null default 'DRAFT',
  visibility public.visibility not null default 'PUBLIC',
  best_of smallint not null default 5 check (best_of > 0 and best_of % 2 = 1),
  points_to_win_set smallint not null default 11 check (points_to_win_set > 0),
  win_by smallint not null default 2 check (win_by > 0),
  minimum_rest_minutes smallint not null default 10 check (minimum_rest_minutes >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table public.tournament_staff (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.staff_role not null,
  primary key (tournament_id, user_id)
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  address text,
  sort_order integer not null default 0
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table public.play_tables (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  status public.participant_status not null default 'ACTIVE',
  club text,
  rating integer,
  birth_year smallint,
  player_code_hash text not null,
  created_at timestamptz not null default now()
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  discipline public.discipline not null,
  sort_order integer not null default 0
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  display_name text not null,
  status public.participant_status not null default 'ACTIVE',
  seed integer,
  created_at timestamptz not null default now()
);

create table public.participant_members (
  participant_id uuid not null references public.participants(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  side_order smallint not null default 1,
  primary key (participant_id, person_id)
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null,
  stage_type public.stage_type not null,
  order_index integer not null,
  settings jsonb not null default '{}'::jsonb,
  advancement jsonb not null default '{"type":"manual","value":0}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','FINISHED')),
  unique (competition_id, order_index)
);

create table public.stage_participants (
  stage_id uuid not null references public.stages(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  seed integer,
  source_label text,
  primary key (stage_id, participant_id)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  primary key (group_id, participant_id)
);

create table public.group_table_preferences (
  group_id uuid not null references public.groups(id) on delete cascade,
  table_id uuid not null references public.play_tables(id) on delete cascade,
  mode public.table_preference_mode not null default 'PREFERRED',
  primary key (group_id, table_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  stage_id uuid not null references public.stages(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  round_number integer not null default 1,
  bracket_position integer,
  status public.match_status not null default 'DRAFT',
  best_of smallint not null default 5 check (best_of > 0 and best_of % 2 = 1),
  match_code_hash text not null,
  winner_participant_id uuid references public.participants(id),
  table_id uuid references public.play_tables(id) on delete set null,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_sides (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  side smallint not null check (side in (1,2)),
  participant_id uuid references public.participants(id) on delete set null,
  is_bye boolean not null default false,
  unique (match_id, side)
);

create table public.match_sets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  set_number smallint not null check (set_number > 0),
  side_a_score smallint not null check (side_a_score >= 0),
  side_b_score smallint not null check (side_b_score >= 0),
  updated_at timestamptz not null default now(),
  unique (match_id, set_number)
);

create table public.match_confirmations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  match_side_id uuid not null references public.match_sides(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  unique (match_id, match_side_id)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_person_id uuid references public.people(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index tournaments_owner_idx on public.tournaments(owner_id) where deleted_at is null;
create index tournaments_public_idx on public.tournaments(status, visibility) where deleted_at is null;
create index people_tournament_idx on public.people(tournament_id);
create index participants_competition_idx on public.participants(competition_id);
create index stages_competition_idx on public.stages(competition_id, order_index);
create index matches_tournament_idx on public.matches(tournament_id, status);
create index matches_stage_idx on public.matches(stage_id, round_number);
create index match_sets_match_idx on public.match_sets(match_id, set_number);
create index audit_tournament_idx on public.audit_events(tournament_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
