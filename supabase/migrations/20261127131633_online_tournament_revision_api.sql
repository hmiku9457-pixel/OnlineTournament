create schema if not exists tournament_private;
revoke all on schema tournament_private from public, anon, authenticated;
grant usage on schema tournament_private to authenticated;

create table tournament_private.online_tournaments (
  id text primary key check (id ~ '^local-[a-zA-Z0-9-]{1,140}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 300),
  revision integer not null default 1 check (revision >= 1),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and payload->>'version' = '1'
    and payload->>'tournamentId' = id and jsonb_typeof(payload->'entries') = 'object'
    and octet_length(payload::text) <= 4194304
  ),
  updated_at timestamptz not null default now()
);
create index online_tournaments_owner_idx on tournament_private.online_tournaments(owner_id, updated_at desc);
create table tournament_private.online_operations (
  tournament_id text not null references tournament_private.online_tournaments(id) on delete cascade,
  operation_id uuid not null,
  expected_revision integer not null check (expected_revision >= 0),
  committed_revision integer not null check (committed_revision = expected_revision + 1),
  request_hash text not null,
  created_at timestamptz not null default now(),
  primary key(tournament_id, operation_id)
);
alter table tournament_private.online_tournaments enable row level security;
alter table tournament_private.online_operations enable row level security;
revoke all on all tables in schema tournament_private from public, anon, authenticated;

-- Only narrow functions in an unexposed schema may bypass RLS. Every operation
-- is restricted to the current non-anonymous authenticated owner.
create function tournament_private.owner_account() returns uuid
language plpgsql stable security invoker set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return v_owner;
end $$;

create function tournament_private.list_online() returns table(id text,name text,revision integer,updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id,t.name,t.revision,t.updated_at from tournament_private.online_tournaments t
  where t.owner_id = tournament_private.owner_account()
  order by t.updated_at desc,t.id;
$$;

create function tournament_private.load_online(p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid := tournament_private.owner_account(); v_data jsonb;
begin
  select jsonb_build_object('id',t.id,'name',t.name,'revision',t.revision,'payload',t.payload,'updated_at',t.updated_at)
  into v_data from tournament_private.online_tournaments t where t.id=p_id and t.owner_id=v_owner;
  if v_data is null then raise exception 'tournament unavailable' using errcode='42501'; end if;
  return v_data;
end $$;

create function tournament_private.commit_online(p_id text,p_name text,p_expected_revision integer,p_operation_id uuid,p_payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := tournament_private.owner_account();
  v_current integer;
  v_operation tournament_private.online_operations;
  v_hash text;
  v_record jsonb;
  v_next integer;
begin
  if p_id is null or p_id !~ '^local-[a-zA-Z0-9-]{1,140}$'
     or p_name is null or length(trim(p_name)) not between 1 and 300
     or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647
     or p_operation_id is null or p_payload is null
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_payload->>'version' is distinct from '1'
     or p_payload->>'tournamentId' is distinct from p_id
     or jsonb_typeof(p_payload->'entries') is distinct from 'object'
     or octet_length(p_payload::text) > 4194304 then
    raise exception 'invalid tournament payload' using errcode='22023';
  end if;
  -- The snapshot is a temporary compatibility envelope; domain commands will
  -- replace arbitrary state writes before opening this API to players.
  v_record := (p_payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:' || p_id))::jsonb;
  if v_record->'tournament'->>'id' is distinct from p_id
     or v_record->'tournament'->>'name' is distinct from p_name
     or jsonb_typeof(v_record->'tournament'->'stages') is distinct from 'array'
     or jsonb_typeof(v_record->'tournament'->'participantNames') is distinct from 'array' then
    raise exception 'invalid tournament record' using errcode='22023';
  end if;
  v_hash := encode(sha256(convert_to(jsonb_build_array(p_id,p_name,p_expected_revision,p_payload)::text,'UTF8')),'hex');
  -- Serialize creation and mutation of the same event, even before a row exists.
  perform pg_advisory_xact_lock(hashtextextended(p_id,0));
  select t.revision into v_current from tournament_private.online_tournaments t
    where t.id=p_id and t.owner_id=v_owner for update;
  if v_current is not null then
    select * into v_operation from tournament_private.online_operations o where o.tournament_id=p_id and o.operation_id=p_operation_id;
    if found then
      if v_operation.request_hash is distinct from v_hash then raise exception 'operation ID already used' using errcode='22023'; end if;
      return v_operation.committed_revision;
    end if;
  end if;
  if p_expected_revision=0 then
    if v_current is not null then raise exception 'revision conflict' using errcode='40001'; end if;
    insert into tournament_private.online_tournaments(id,owner_id,name,payload)
      values(p_id,v_owner,p_name,p_payload) on conflict(id) do nothing;
    if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
    v_next := 1;
  else
    if v_current is null then raise exception 'tournament unavailable' using errcode='42501'; end if;
    if v_current <> p_expected_revision then raise exception 'revision conflict' using errcode='40001'; end if;
    v_next := v_current+1;
    update tournament_private.online_tournaments set name=p_name,revision=v_next,payload=p_payload,updated_at=now()
      where id=p_id and owner_id=v_owner;
  end if;
  insert into tournament_private.online_operations(tournament_id,operation_id,expected_revision,committed_revision,request_hash)
    values(p_id,p_operation_id,p_expected_revision,v_next,v_hash);
  return v_next;
end $$;

create function public.list_online_tournaments() returns table(id text,name text,revision integer,updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from tournament_private.list_online(); $$;
create function public.load_online_tournament(p_id text) returns jsonb
language sql stable security invoker set search_path = '' as $$ select tournament_private.load_online(p_id); $$;
create function public.commit_online_tournament(p_id text,p_name text,p_expected_revision integer,p_operation_id uuid,p_payload jsonb)
returns integer language sql security invoker set search_path = '' as $$
select tournament_private.commit_online(p_id,p_name,p_expected_revision,p_operation_id,p_payload); $$;
revoke all on all functions in schema tournament_private from public,anon,authenticated;
grant execute on function tournament_private.owner_account(),tournament_private.list_online(),tournament_private.load_online(text),tournament_private.commit_online(text,text,integer,uuid,jsonb) to authenticated;
revoke all on function public.list_online_tournaments(),public.load_online_tournament(text),public.commit_online_tournament(text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.list_online_tournaments(),public.load_online_tournament(text),public.commit_online_tournament(text,text,integer,uuid,jsonb) to authenticated;
