create table tournament_private.online_checkpoints (
  tournament_id text not null references tournament_private.online_tournaments(id) on delete cascade,
  revision integer not null check (revision >= 1),
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null,
  payload_bytes integer not null,
  primary key (tournament_id,revision)
);
alter table tournament_private.online_checkpoints enable row level security;
revoke all on tournament_private.online_checkpoints from public,anon,authenticated;
create function tournament_private.checkpoint_online_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into tournament_private.online_checkpoints(tournament_id,revision,name,payload,created_at,payload_bytes)
    values(new.id,new.revision,new.name,new.payload,new.updated_at,octet_length(new.payload::text));
  -- Keep at most 20 revisions and a 16 MiB logical payload budget per event.
  delete from tournament_private.online_checkpoints c using (
    select revision,row_number() over(order by revision desc) as ordinal,
      sum(payload_bytes::bigint) over(order by revision desc) as total
    from tournament_private.online_checkpoints where tournament_id=new.id
  ) x where c.tournament_id=new.id and c.revision=x.revision and x.ordinal>1
    and (x.ordinal>20 or x.total>16777216);
  return new;
end $$;
revoke all on function tournament_private.checkpoint_online_revision() from public,anon,authenticated;
create trigger checkpoint_online_revision after insert or update on tournament_private.online_tournaments
for each row execute function tournament_private.checkpoint_online_revision();
insert into tournament_private.online_checkpoints(tournament_id,revision,name,payload,created_at,payload_bytes)
select id,revision,name,payload,updated_at,octet_length(payload::text) from tournament_private.online_tournaments;

create function tournament_private.list_checkpoints(p_id text)
returns table(revision integer,name text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account();
begin
  if not exists(select 1 from tournament_private.online_tournaments t where t.id=p_id and t.owner_id=v_owner)
    then raise exception 'tournament unavailable' using errcode='42501'; end if;
  return query select c.revision,c.name,c.created_at from tournament_private.online_checkpoints c
    where c.tournament_id=p_id order by c.revision desc;
end $$;
create function tournament_private.load_checkpoint(p_id text,p_revision integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); v_payload jsonb;
begin
  select c.payload into v_payload from tournament_private.online_checkpoints c
    join tournament_private.online_tournaments t on t.id=c.tournament_id
    where t.id=p_id and t.owner_id=v_owner and c.revision=p_revision;
  if v_payload is null then raise exception 'checkpoint unavailable' using errcode='42501'; end if;
  return v_payload;
end $$;
create function public.list_online_checkpoints(p_id text)
returns table(revision integer,name text,created_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from tournament_private.list_checkpoints(p_id); $$;
create function public.load_online_checkpoint(p_id text,p_revision integer)
returns jsonb language sql stable security invoker set search_path='' as $$ select tournament_private.load_checkpoint(p_id,p_revision); $$;
revoke all on function tournament_private.list_checkpoints(text),tournament_private.load_checkpoint(text,integer),public.list_online_checkpoints(text),public.load_online_checkpoint(text,integer) from public,anon,authenticated;
grant execute on function tournament_private.list_checkpoints(text),tournament_private.load_checkpoint(text,integer),public.list_online_checkpoints(text),public.load_online_checkpoint(text,integer) to authenticated;
