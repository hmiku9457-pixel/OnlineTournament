create or replace function public.hash_short_code(p_code text)
returns text
language sql
immutable
as $$
  select crypt(upper(trim(p_code)), gen_salt('bf', 10));
$$;

create or replace function public.can_delete_tournament(p_tournament_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id
      and t.status in ('DRAFT','REGISTRATION','READY','ABORTED','FINISHED','ARCHIVED')
      and public.can_manage_tournament(t.id)
  );
$$;

grant execute on function public.can_delete_tournament(uuid) to authenticated;
