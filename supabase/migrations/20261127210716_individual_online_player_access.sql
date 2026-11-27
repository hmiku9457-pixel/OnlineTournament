-- Individual read-only capabilities, independent of public spectator consent.
create table tournament_private.online_player_links (
 tournament_id text not null references tournament_private.online_tournaments(id) on delete cascade,
 participant_id text not null,
 token uuid unique not null default gen_random_uuid(),
 primary key(tournament_id,participant_id)
);
create table tournament_private.online_player_projection (
 tournament_id text primary key references tournament_private.online_tournaments(id) on delete cascade,
 revision integer not null,
 matches jsonb not null check(jsonb_typeof(matches)='array'),
 total integer not null check(total>=0)
);
alter table tournament_private.online_player_links enable row level security;
alter table tournament_private.online_player_projection enable row level security;
revoke all on tournament_private.online_player_links,tournament_private.online_player_projection from public,anon,authenticated;
create function tournament_private.list_player_access(p_id text)
returns table(participant_id text,name text,token uuid)
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); h jsonb;
begin
 select ((t.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||p_id))::jsonb)->'tournament' into h
 from tournament_private.online_tournaments t where t.id=p_id and t.owner_id=v_owner;
 if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
 return query select i.value,i.key,l.token from jsonb_each_text(h->'participantIds') i
 left join tournament_private.online_player_links l on l.tournament_id=p_id and l.participant_id=i.value
 order by i.key;
end $$;
create function tournament_private.manage_player_access(p_id text,p_participant_id text,p_action text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); h jsonb; v_token uuid;
begin
 if p_action is null or p_action not in ('enable','rotate','disable') then raise exception 'invalid action' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 select ((t.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||p_id))::jsonb)->'tournament' into h
 from tournament_private.online_tournaments t where t.id=p_id and t.owner_id=v_owner;
 if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if p_action='disable' then
  delete from tournament_private.online_player_links where tournament_id=p_id and participant_id=p_participant_id;
  if not exists(select 1 from tournament_private.online_player_links where tournament_id=p_id) then delete from tournament_private.online_player_projection where tournament_id=p_id; end if;
  return null;
 end if;
 if exists(select 1 from tournament_private.online_archives where tournament_id=p_id) then raise exception 'tournament archived' using errcode='55000'; end if;
 if not exists(select 1 from jsonb_each_text(h->'participantIds') i where i.value=p_participant_id) then raise exception 'participant unavailable' using errcode='22023'; end if;
 if p_action='rotate' then delete from tournament_private.online_player_links where tournament_id=p_id and participant_id=p_participant_id; end if;
 insert into tournament_private.online_player_links(tournament_id,participant_id) values(p_id,p_participant_id) on conflict do nothing;
 select l.token into v_token from tournament_private.online_player_links l where l.tournament_id=p_id and l.participant_id=p_participant_id;
 return v_token;
end $$;
create function tournament_private.player_access_active(p_id text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from tournament_private.online_player_links l join tournament_private.online_tournaments t on t.id=l.tournament_id
 where t.id=p_id and t.owner_id=tournament_private.owner_account());
$$;
create function tournament_private.revoke_archived_players() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 delete from tournament_private.online_player_links where tournament_id=new.tournament_id;
 delete from tournament_private.online_player_projection where tournament_id=new.tournament_id;
 return new;
end $$;
create trigger revoke_archived_players after insert on tournament_private.online_archives for each row execute function tournament_private.revoke_archived_players();
-- Remove credentials for participants deleted from the confirmed roster.
create function tournament_private.prune_player_access() returns trigger language plpgsql security invoker set search_path='' as $$
declare h jsonb;
begin
 h:=((new.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||new.id))::jsonb)->'tournament';
 delete from tournament_private.online_player_links l where l.tournament_id=new.id and not exists(select 1 from jsonb_each_text(h->'participantIds') i where i.value=l.participant_id);
 return new;
end $$;
create trigger prune_player_access after update of payload on tournament_private.online_tournaments for each row execute function tournament_private.prune_player_access();
create function tournament_private.publish_player_projection(p_id text,p_token uuid,p_revision integer,p_matches jsonb,p_total integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); t tournament_private.online_tournaments; roster jsonb; m jsonb; s jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 select * into t from tournament_private.online_tournaments where id=p_id and owner_id=v_owner;
 if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if not exists(select 1 from tournament_private.online_player_links where tournament_id=p_id) then return false; end if;
 if not exists(select 1 from tournament_private.online_workspace_leases where tournament_id=p_id and token=p_token and expires_at>clock_timestamp()) then raise exception 'workspace lease missing or expired' using errcode='55P03'; end if;
 if p_revision is distinct from t.revision then raise exception 'revision conflict' using errcode='40001'; end if;
 if jsonb_typeof(p_matches) is distinct from 'array' or p_total is null or p_total<0 or octet_length(p_matches::text)>2097152 then raise exception 'invalid projection' using errcode='22023'; end if;
 if jsonb_array_length(p_matches)>5000 or p_total<jsonb_array_length(p_matches) then raise exception 'invalid projection count' using errcode='22023'; end if;
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

 insert into tournament_private.online_player_projection(tournament_id,revision,matches,total) values(p_id,p_revision,p_matches,p_total)
 on conflict(tournament_id) do update set revision=excluded.revision,matches=excluded.matches,total=excluded.total;
 return true;
end $$;
create function tournament_private.read_player_access(p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',t.name,'participant',i.key,'sport',h.value->>'sport','status',h.value->>'status',
  'revision',t.revision,'updatedAt',t.updated_at,'complete',case when d.revision=t.revision then d.total=jsonb_array_length(d.matches) else null end,
  'matches',case when d.revision=t.revision then (select coalesce(jsonb_agg(m.value order by m.ordinality),'[]'::jsonb)
  from jsonb_array_elements(d.matches) with ordinality m(value,ordinality)
  where m.value->>'sideA'=i.key or m.value->>'sideB'=i.key) else null end)
 from tournament_private.online_player_links l
 join tournament_private.online_tournaments t on t.id=l.tournament_id
 cross join lateral (select ((t.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||t.id))::jsonb)->'tournament' as value) h
 cross join lateral jsonb_each_text(h.value->'participantIds') i
 left join tournament_private.online_player_projection d on d.tournament_id=t.id
 where l.token=p_token and i.value=l.participant_id and not exists(select 1 from tournament_private.online_archives a where a.tournament_id=t.id);
$$;
create function public.list_online_player_access(p_id text) returns table(participant_id text,name text,token uuid)
language sql stable security invoker set search_path='' as $$ select * from tournament_private.list_player_access(p_id); $$;
create function public.manage_online_player_access(p_id text,p_participant_id text,p_action text) returns uuid
language sql security invoker set search_path='' as $$ select tournament_private.manage_player_access(p_id,p_participant_id,p_action); $$;
create function public.online_player_access_active(p_id text) returns boolean
language sql stable security invoker set search_path='' as $$ select tournament_private.player_access_active(p_id); $$;
create function public.publish_online_player_projection(p_id text,p_token uuid,p_revision integer,p_matches jsonb,p_total integer) returns boolean
language sql security invoker set search_path='' as $$ select tournament_private.publish_player_projection(p_id,p_token,p_revision,p_matches,p_total); $$;
create function public.read_online_player_access(p_token uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select tournament_private.read_player_access(p_token); $$;
revoke all on function tournament_private.list_player_access(text),tournament_private.manage_player_access(text,text,text),tournament_private.player_access_active(text),tournament_private.revoke_archived_players(),tournament_private.prune_player_access(),tournament_private.publish_player_projection(text,uuid,integer,jsonb,integer),tournament_private.read_player_access(uuid),public.list_online_player_access(text),public.manage_online_player_access(text,text,text),public.online_player_access_active(text),public.publish_online_player_projection(text,uuid,integer,jsonb,integer),public.read_online_player_access(uuid) from public,anon,authenticated;
grant execute on function tournament_private.list_player_access(text),tournament_private.manage_player_access(text,text,text),tournament_private.player_access_active(text),tournament_private.publish_player_projection(text,uuid,integer,jsonb,integer),public.list_online_player_access(text),public.manage_online_player_access(text,text,text),public.online_player_access_active(text),public.publish_online_player_projection(text,uuid,integer,jsonb,integer) to authenticated;
grant execute on function tournament_private.read_player_access(uuid),public.read_online_player_access(uuid) to anon,authenticated;
