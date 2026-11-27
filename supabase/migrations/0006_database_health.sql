-- A dedicated, non-sensitive database probe. No tournament data is read or changed.
create table public.tournament_health_probe (
  singleton boolean primary key default true check (singleton)
);
insert into public.tournament_health_probe (singleton) values (true);
alter table public.tournament_health_probe enable row level security;
revoke all on table public.tournament_health_probe from public, anon, authenticated;

create function public.tournament_health_check()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tournament_health_probe where singleton);
$$;
revoke all on function public.tournament_health_check() from public, anon, authenticated;
grant execute on function public.tournament_health_check() to anon, authenticated;
