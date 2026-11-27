create table public.tournament_backups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tournament_id text not null check (length(tournament_id) between 1 and 150),
  tournament_name text not null check (length(trim(tournament_name)) between 1 and 300),
  created_at timestamptz not null default now(),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ->> 'version' = '1'
    and payload ->> 'tournamentId' = tournament_id
    and octet_length(payload::text) <= 4194304
  )
);
create index tournament_backups_owner_created_idx on public.tournament_backups (owner_id, created_at desc);
alter table public.tournament_backups enable row level security;
revoke all on public.tournament_backups from public, anon, authenticated;
grant select on public.tournament_backups to authenticated;
grant insert (id, tournament_id, tournament_name, payload) on public.tournament_backups to authenticated;
grant delete on public.tournament_backups to authenticated;
create policy "owner reads backups" on public.tournament_backups for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "owner creates backups" on public.tournament_backups for insert to authenticated
  with check ((select auth.uid()) = owner_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false));
create policy "owner deletes backups" on public.tournament_backups for delete to authenticated
  using ((select auth.uid()) = owner_id);
