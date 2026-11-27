-- Optional rankings share the explicit participant-detail consent.
create table tournament_private.online_spectator_rankings (
 tournament_id text primary key references tournament_private.online_spectator_links(tournament_id) on delete cascade,
 revision integer not null,
 rankings jsonb not null check(jsonb_typeof(rankings)='array')
);
alter table tournament_private.online_spectator_rankings enable row level security;
revoke all on tournament_private.online_spectator_rankings from public,anon,authenticated;
create function tournament_private.clear_disabled_rankings() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not new.show_matches then delete from tournament_private.online_spectator_rankings where tournament_id=new.tournament_id; end if;
 return new;
end $$;
create trigger clear_disabled_rankings after update of show_matches on tournament_private.online_spectator_links for each row execute function tournament_private.clear_disabled_rankings();
create function tournament_private.publish_spectator_rankings(p_id text,p_token uuid,p_revision integer,p_rankings jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); t tournament_private.online_tournaments; roster jsonb; b jsonb; r jsonb; k text; n integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 select * into t from tournament_private.online_tournaments where id=p_id and owner_id=v_owner;
 if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if not exists(select 1 from tournament_private.online_spectator_links where tournament_id=p_id and show_matches) then return false; end if;
 if not exists(select 1 from tournament_private.online_workspace_leases where tournament_id=p_id and token=p_token and expires_at>clock_timestamp()) then raise exception 'workspace lease missing or expired' using errcode='55P03'; end if;
 if p_revision is distinct from t.revision then raise exception 'revision conflict' using errcode='40001'; end if;
 if jsonb_typeof(p_rankings) is distinct from 'array' or octet_length(p_rankings::text)>1048576 then raise exception 'invalid rankings' using errcode='22023'; end if;
 if jsonb_array_length(p_rankings)>200 then raise exception 'too many tables' using errcode='22023'; end if;
 roster:=((t.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||p_id))::jsonb)->'tournament'->'participantNames';
 for b in select value from jsonb_array_elements(p_rankings) loop
  if jsonb_typeof(b) is distinct from 'object' or (b-array['phase','label','kind','rows'])<>'{}'::jsonb
   or not (b ?& array['phase','label','kind','rows'])
   or jsonb_typeof(b->'phase') is distinct from 'string' or length(b->>'phase')>300
   or jsonb_typeof(b->'label') is distinct from 'string' or length(b->>'label')>300
   or not coalesce(b->>'kind' in ('GROUPS','SWISS','ROUND_ROBIN','FINAL'),false)
   or jsonb_typeof(b->'rows') is distinct from 'array' then raise exception 'invalid ranking table' using errcode='22023'; end if;
  n:=n+jsonb_array_length(b->'rows');
  if n>5000 then raise exception 'too many ranking rows' using errcode='22023'; end if;
  if (select count(distinct x->>'name') from jsonb_array_elements(b->'rows') x)<>jsonb_array_length(b->'rows') then raise exception 'duplicate ranking name' using errcode='22023'; end if;
  for r in select value from jsonb_array_elements(b->'rows') loop
   if jsonb_typeof(r) is distinct from 'object' or not coalesce(roster ? (r->>'name'),false) or not coalesce(r->>'rank' ~ '^[1-9][0-9]{0,8}$',false) then raise exception 'invalid ranking identity' using errcode='22023'; end if;
   if b->>'kind'='FINAL' then
    if (r-array['rank','name','placement','status'])<>'{}'::jsonb or not (r ?& array['rank','name','placement','status'])
      or jsonb_typeof(r->'placement') is distinct from 'string' or length(r->>'placement')>300
      or not coalesce(r->>'status' in ('Aktiv','Ausgeschieden','Zurückgezogen','Turniersieger','Beendet'),false) then raise exception 'invalid final ranking' using errcode='22023'; end if;
   else
    if (r-array['rank','name','played','wins','losses','draws','points','buchholz','sets','setDifference','balls','ballDifference'])<>'{}'::jsonb
      or not (r ?& array['rank','name','played','wins','losses','draws','points','buchholz','sets','setDifference','balls','ballDifference']) then raise exception 'invalid ranking fields' using errcode='22023'; end if;
    foreach k in array array['played','wins','losses','draws','points'] loop
     if not coalesce(r->>k ~ '^[0-9]{1,12}$',false) then raise exception 'invalid ranking statistic' using errcode='22023'; end if;
    end loop;
    foreach k in array array['setDifference','ballDifference'] loop
     if not coalesce(r->>k ~ '^-?[0-9]{1,15}$',false) then raise exception 'invalid ranking difference' using errcode='22023'; end if;
    end loop;
    if not coalesce(r->>'buchholz' ~ '^[0-9]{1,12}(\.[0-9]{1,12})?$',false)
      or not coalesce(r->>'sets' ~ '^[0-9]{1,15}:[0-9]{1,15}$',false)
      or not coalesce(r->>'balls' ~ '^[0-9]{1,15}:[0-9]{1,15}$',false) then raise exception 'invalid ranking score' using errcode='22023'; end if;
   end if;
  end loop;
 end loop;
 insert into tournament_private.online_spectator_rankings(tournament_id,revision,rankings) values(p_id,p_revision,p_rankings)
 on conflict(tournament_id) do update set revision=excluded.revision,rankings=excluded.rankings;
 return true;
end $$;
create function tournament_private.read_spectator_rankings(p_token uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',t.revision,'rankings',case when r.revision=t.revision then r.rankings else null end)
 from tournament_private.online_spectator_links l join tournament_private.online_tournaments t on t.id=l.tournament_id
 left join tournament_private.online_spectator_rankings r on r.tournament_id=t.id
 where l.token=p_token and l.show_matches and not exists(select 1 from tournament_private.online_archives a where a.tournament_id=t.id);
$$;
create function public.publish_online_spectator_rankings(p_id text,p_token uuid,p_revision integer,p_rankings jsonb) returns boolean
language sql security invoker set search_path='' as $$ select tournament_private.publish_spectator_rankings(p_id,p_token,p_revision,p_rankings); $$;
create function public.read_online_spectator_rankings(p_token uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select tournament_private.read_spectator_rankings(p_token); $$;
revoke all on function tournament_private.clear_disabled_rankings(),tournament_private.publish_spectator_rankings(text,uuid,integer,jsonb),tournament_private.read_spectator_rankings(uuid),public.publish_online_spectator_rankings(text,uuid,integer,jsonb),public.read_online_spectator_rankings(uuid) from public,anon,authenticated;
grant execute on function tournament_private.publish_spectator_rankings(text,uuid,integer,jsonb),public.publish_online_spectator_rankings(text,uuid,integer,jsonb) to authenticated;
grant execute on function tournament_private.read_spectator_rankings(uuid),public.read_online_spectator_rankings(uuid) to anon,authenticated;
