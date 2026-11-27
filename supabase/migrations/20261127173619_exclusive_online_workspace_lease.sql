-- Exclusive renewable owner-scoped director lease. All update RPCs must
-- hold the same event lock as the revision compare-and-swap.
create table tournament_private.online_workspace_leases (
  tournament_id text primary key references tournament_private.online_tournaments(id) on delete cascade,
  token uuid not null,
  expires_at timestamptz not null
);
alter table tournament_private.online_workspace_leases enable row level security;
revoke all on tournament_private.online_workspace_leases from public,anon,authenticated;

create function tournament_private.claim_workspace(p_id text,p_token uuid,p_renew boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account();
begin
  if p_token is null or p_renew is null then raise exception 'invalid lease' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id,0));
  if not exists(select 1 from tournament_private.online_tournaments where id=p_id and owner_id=v_owner)
    then raise exception 'tournament unavailable' using errcode='42501'; end if;
  if p_renew then
    update tournament_private.online_workspace_leases set expires_at=clock_timestamp()+interval '90 seconds'
      where tournament_id=p_id and token=p_token and expires_at>clock_timestamp();
    return found;
  end if;
  insert into tournament_private.online_workspace_leases as l(tournament_id,token,expires_at)
    values(p_id,p_token,clock_timestamp()+interval '90 seconds')
    on conflict(tournament_id) do update set token=excluded.token,expires_at=excluded.expires_at
    where l.expires_at<=clock_timestamp() or l.token=p_token;
  return found;
end $$;
create function tournament_private.release_workspace(p_id text,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id,0));
  if not exists(select 1 from tournament_private.online_tournaments where id=p_id and owner_id=v_owner)
    then raise exception 'tournament unavailable' using errcode='42501'; end if;
  delete from tournament_private.online_workspace_leases where tournament_id=p_id and token=p_token;
  return found;
end $$;
create function tournament_private.commit_with_workspace(p_id text,p_name text,p_expected_revision integer,p_operation_id uuid,p_payload jsonb,p_token uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); v_revision integer;
begin
  if p_expected_revision=0 then
    return tournament_private.commit_online(p_id,p_name,p_expected_revision,p_operation_id,p_payload);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id,0));
  if not exists(select 1 from tournament_private.online_tournaments where id=p_id and owner_id=v_owner)
    then raise exception 'tournament unavailable' using errcode='42501'; end if;
  if not exists(select 1 from tournament_private.online_workspace_leases
    where tournament_id=p_id and token=p_token and expires_at>clock_timestamp()) then
    raise exception 'workspace lease missing or expired' using errcode='55P03';
  end if;
  v_revision:=tournament_private.commit_online(p_id,p_name,p_expected_revision,p_operation_id,p_payload);
  update tournament_private.online_workspace_leases set expires_at=clock_timestamp()+interval '90 seconds'
    where tournament_id=p_id and token=p_token;
  return v_revision;
end $$;
-- Existing creation/retry endpoint stays usable, but cannot bypass the lease.
create or replace function public.commit_online_tournament(p_id text,p_name text,p_expected_revision integer,p_operation_id uuid,p_payload jsonb)
returns integer language sql security invoker set search_path='' as $$
select tournament_private.commit_with_workspace(p_id,p_name,p_expected_revision,p_operation_id,p_payload,null::uuid); $$;
create function public.claim_online_workspace(p_id text,p_token uuid,p_renew boolean)
returns boolean language sql security invoker set search_path='' as $$ select tournament_private.claim_workspace(p_id,p_token,p_renew); $$;
create function public.release_online_workspace(p_id text,p_token uuid)
returns boolean language sql security invoker set search_path='' as $$ select tournament_private.release_workspace(p_id,p_token); $$;
create function public.commit_leased_online_tournament(p_id text,p_name text,p_expected_revision integer,p_operation_id uuid,p_payload jsonb,p_token uuid)
returns integer language sql security invoker set search_path='' as $$
select tournament_private.commit_with_workspace(p_id,p_name,p_expected_revision,p_operation_id,p_payload,p_token); $$;
revoke all on function tournament_private.commit_online(text,text,integer,uuid,jsonb) from public,anon,authenticated;
revoke all on function tournament_private.claim_workspace(text,uuid,boolean),tournament_private.release_workspace(text,uuid),tournament_private.commit_with_workspace(text,text,integer,uuid,jsonb,uuid),public.claim_online_workspace(text,uuid,boolean),public.release_online_workspace(text,uuid),public.commit_leased_online_tournament(text,text,integer,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function tournament_private.claim_workspace(text,uuid,boolean),tournament_private.release_workspace(text,uuid),tournament_private.commit_with_workspace(text,text,integer,uuid,jsonb,uuid),public.claim_online_workspace(text,uuid,boolean),public.release_online_workspace(text,uuid),public.commit_leased_online_tournament(text,text,integer,uuid,jsonb,uuid) to authenticated;
