-- Archive metadata is separate from sporting revisions and never deletes data.
create table tournament_private.online_archives (
 tournament_id text primary key references tournament_private.online_tournaments(id) on delete cascade,
 archived_at timestamptz not null default now()
);
alter table tournament_private.online_archives enable row level security;
revoke all on tournament_private.online_archives from public,anon,authenticated;
create function tournament_private.catalog_online()
returns table(id text,name text,revision integer,updated_at timestamptz,status text,archived_at timestamptz,editing boolean)
language sql stable security definer set search_path='' as $$
 select t.id,t.name,t.revision,t.updated_at,
 ((t.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||t.id))::jsonb)->'tournament'->>'status',
 a.archived_at,coalesce(l.expires_at>now(),false)
 from tournament_private.online_tournaments t
 left join tournament_private.online_archives a on a.tournament_id=t.id
 left join tournament_private.online_workspace_leases l on l.tournament_id=t.id
 where t.owner_id=tournament_private.owner_account()
 order by t.updated_at desc,t.id;
$$;
create function tournament_private.set_online_archive(p_id text,p_revision integer,p_archived boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); v_current integer; v_status text;
begin
 if p_archived is null or p_revision is null then raise exception 'invalid archive request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 select t.revision,((t.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||t.id))::jsonb)->'tournament'->>'status'
 into v_current,v_status from tournament_private.online_tournaments t where t.id=p_id and t.owner_id=v_owner;
 if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if v_current<>p_revision then raise exception 'revision conflict' using errcode='40001'; end if;
 if exists(select 1 from tournament_private.online_workspace_leases where tournament_id=p_id and expires_at>clock_timestamp())
 then raise exception 'workspace active' using errcode='55P03'; end if;
 if p_archived then
  if coalesce(v_status,'') not in ('DRAFT','REGISTRATION','READY','FINISHED','ABORTED') then raise exception 'running or paused tournament cannot be archived' using errcode='22023'; end if;
  insert into tournament_private.online_archives(tournament_id) values(p_id) on conflict do nothing;
 else delete from tournament_private.online_archives where tournament_id=p_id;
 end if;
 return true;
end $$;
-- The lease is the only path to runtime updates. Refuse archived events.
create function tournament_private.reject_archived_lease() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from tournament_private.online_archives where tournament_id=new.tournament_id) then
  raise exception 'tournament archived' using errcode='55000';
 end if;
 return new;
end $$;
create trigger reject_archived_lease before insert or update on tournament_private.online_workspace_leases
for each row execute function tournament_private.reject_archived_lease();
create function public.catalog_online_tournaments()
returns table(id text,name text,revision integer,updated_at timestamptz,status text,archived_at timestamptz,editing boolean)
language sql stable security invoker set search_path='' as $$ select * from tournament_private.catalog_online(); $$;
create function public.set_online_tournament_archive(p_id text,p_revision integer,p_archived boolean)
returns boolean language sql security invoker set search_path='' as $$ select tournament_private.set_online_archive(p_id,p_revision,p_archived); $$;
revoke all on function tournament_private.catalog_online(),tournament_private.set_online_archive(text,integer,boolean),tournament_private.reject_archived_lease(),public.catalog_online_tournaments(),public.set_online_tournament_archive(text,integer,boolean) from public,anon,authenticated;
grant execute on function tournament_private.catalog_online(),tournament_private.set_online_archive(text,integer,boolean),public.catalog_online_tournaments(),public.set_online_tournament_archive(text,integer,boolean) to authenticated;
-- Reject missing required fields as well as mismatching fields. Preserve
-- existing rows even if they predate this rule; new writes are checked.
alter table public.tournament_backups add constraint tournament_backups_required_envelope
check ((payload->>'version'='1' and payload->>'tournamentId'=tournament_id and jsonb_typeof(payload->'entries')='object') is true) not valid;
