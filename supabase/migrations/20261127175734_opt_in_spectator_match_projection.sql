-- Detailed spectator projections are opt-in, revision-bound, and separate
-- from the authoritative sporting snapshot.
alter table tournament_private.online_spectator_links add column show_matches boolean not null default false;
create table tournament_private.online_spectator_details (
 tournament_id text primary key references tournament_private.online_spectator_links(tournament_id) on delete cascade,
 revision integer not null,
 matches jsonb not null check(jsonb_typeof(matches)='array'),
 total integer not null check(total>=0)
);
alter table tournament_private.online_spectator_details enable row level security;
revoke all on tournament_private.online_spectator_details from public,anon,authenticated;
create function tournament_private.spectator_detail_setting(p_id text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); v_enabled boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 if not exists(select 1 from tournament_private.online_tournaments where id=p_id and owner_id=v_owner) then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if p_enabled is not null then
  update tournament_private.online_spectator_links set show_matches=p_enabled where tournament_id=p_id;
  if not found then raise exception 'spectator link not enabled' using errcode='55000'; end if;
  if not p_enabled then delete from tournament_private.online_spectator_details where tournament_id=p_id; end if;
 end if;
 select show_matches into v_enabled from tournament_private.online_spectator_links where tournament_id=p_id;
 return coalesce(v_enabled,false);
end $$;
create function tournament_private.publish_spectator_matches(p_id text,p_token uuid,p_revision integer,p_matches jsonb,p_total integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); t tournament_private.online_tournaments; roster jsonb; m jsonb; s jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 select * into t from tournament_private.online_tournaments where id=p_id and owner_id=v_owner;
 if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if not exists(select 1 from tournament_private.online_spectator_links where tournament_id=p_id and show_matches) then return false; end if;
 if not exists(select 1 from tournament_private.online_workspace_leases where tournament_id=p_id and token=p_token and expires_at>clock_timestamp()) then raise exception 'workspace lease missing or expired' using errcode='55P03'; end if;
 if p_revision is distinct from t.revision then raise exception 'revision conflict' using errcode='40001'; end if;
 if jsonb_typeof(p_matches) is distinct from 'array' or p_total is null or p_total<0 or octet_length(p_matches::text)>1048576 then raise exception 'invalid projection' using errcode='22023'; end if;
 if jsonb_array_length(p_matches)>1000 or p_total<jsonb_array_length(p_matches) then raise exception 'invalid projection count' using errcode='22023'; end if;
 roster:=((t.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||p_id))::jsonb)->'tournament'->'participantNames';
 for m in select value from jsonb_array_elements(p_matches) loop
   if jsonb_typeof(m) is distinct from 'object' then raise exception 'invalid match projection' using errcode='22023'; end if;
   if (m - array['sideA','sideB','phase','round','status','table','score','sets']) <> '{}'::jsonb or not (m ?& array['sideA','sideB','phase','round','status','table','score','sets'])
    or not coalesce(roster ? (m->>'sideA'),false) or not coalesce(roster ? (m->>'sideB'),false) or m->>'sideA'=m->>'sideB'
    or not coalesce(m->>'status' in ('WAITING','LIVE','READY','CONFIRMATION','FINISHED','CANCELLED'),false)
    or jsonb_typeof(m->'phase') is distinct from 'string' or length(m->>'phase')>300
    or jsonb_typeof(m->'round') is distinct from 'string' or length(m->>'round')>300
    or jsonb_typeof(m->'score') is distinct from 'string' or length(m->>'score')>100
    or jsonb_typeof(m->'table') is distinct from 'string' or not coalesce(m->>'table' ~ '^(Noch offen|Tisch [1-9][0-9]*)$',false)
    or jsonb_typeof(m->'sets') is distinct from 'array' then raise exception 'invalid match projection' using errcode='22023'; end if;
   if jsonb_array_length(m->'sets')>100 then raise exception 'invalid set count' using errcode='22023'; end if;
   for s in select value from jsonb_array_elements(m->'sets') loop
    if jsonb_typeof(s) is distinct from 'object' or (s - array['sideAScore','sideBScore']) <> '{}'::jsonb
       or not coalesce(s->>'sideAScore' ~ '^[0-9]{1,15}$',false) or not coalesce(s->>'sideBScore' ~ '^[0-9]{1,15}$',false) then raise exception 'invalid public set' using errcode='22023'; end if;
   end loop;
 end loop;
 insert into tournament_private.online_spectator_details(tournament_id,revision,matches,total) values(p_id,p_revision,p_matches,p_total)
 on conflict(tournament_id) do update set revision=excluded.revision,matches=excluded.matches,total=excluded.total;
 return true;
end $$;
create function tournament_private.read_spectator_details(p_token uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when d.revision=t.revision then jsonb_build_object('revision',d.revision,'matches',d.matches,'total',d.total)
 else jsonb_build_object('revision',t.revision,'matches',null,'total',null) end
 from tournament_private.online_spectator_links l join tournament_private.online_tournaments t on t.id=l.tournament_id
 left join tournament_private.online_spectator_details d on d.tournament_id=t.id
 where l.token=p_token and l.show_matches and not exists(select 1 from tournament_private.online_archives a where a.tournament_id=t.id);
$$;
create function public.online_spectator_detail_setting(p_id text,p_enabled boolean default null) returns boolean
language sql security invoker set search_path='' as $$ select tournament_private.spectator_detail_setting(p_id,p_enabled); $$;
create function public.publish_online_spectator_matches(p_id text,p_token uuid,p_revision integer,p_matches jsonb,p_total integer) returns boolean
language sql security invoker set search_path='' as $$ select tournament_private.publish_spectator_matches(p_id,p_token,p_revision,p_matches,p_total); $$;
create function public.read_online_spectator_details(p_token uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select tournament_private.read_spectator_details(p_token); $$;
revoke all on function tournament_private.spectator_detail_setting(text,boolean),tournament_private.publish_spectator_matches(text,uuid,integer,jsonb,integer),tournament_private.read_spectator_details(uuid),public.online_spectator_detail_setting(text,boolean),public.publish_online_spectator_matches(text,uuid,integer,jsonb,integer),public.read_online_spectator_details(uuid) from public,anon,authenticated;
grant execute on function tournament_private.spectator_detail_setting(text,boolean),tournament_private.publish_spectator_matches(text,uuid,integer,jsonb,integer),public.online_spectator_detail_setting(text,boolean),public.publish_online_spectator_matches(text,uuid,integer,jsonb,integer) to authenticated;
grant execute on function tournament_private.read_spectator_details(uuid),public.read_online_spectator_details(uuid) to anon,authenticated;
