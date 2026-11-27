-- Public bracket projection contains no private fixture identifiers.
create table tournament_private.online_spectator_brackets (
 tournament_id text primary key references tournament_private.online_spectator_links(tournament_id) on delete cascade,
 revision integer not null,
 brackets jsonb not null check(jsonb_typeof(brackets)='array')
);
alter table tournament_private.online_spectator_brackets enable row level security;
revoke all on tournament_private.online_spectator_brackets from public,anon,authenticated;
create function tournament_private.clear_disabled_brackets() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not new.show_matches then delete from tournament_private.online_spectator_brackets where tournament_id=new.tournament_id; end if;
 return new;
end $$;
create trigger clear_disabled_brackets after update of show_matches on tournament_private.online_spectator_links for each row execute function tournament_private.clear_disabled_brackets();
create function tournament_private.publish_spectator_brackets(p_id text,p_token uuid,p_revision integer,p_brackets jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); t tournament_private.online_tournaments; roster jsonb; b jsonb; r jsonb; m jsonb; s jsonb; k text; n integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 select * into t from tournament_private.online_tournaments where id=p_id and owner_id=v_owner;
 if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if not exists(select 1 from tournament_private.online_spectator_links where tournament_id=p_id and show_matches) then return false; end if;
 if not exists(select 1 from tournament_private.online_workspace_leases where tournament_id=p_id and token=p_token and expires_at>clock_timestamp()) then raise exception 'workspace lease missing or expired' using errcode='55P03'; end if;
 if p_revision is distinct from t.revision then raise exception 'revision conflict' using errcode='40001'; end if;
 if jsonb_typeof(p_brackets) is distinct from 'array' or octet_length(p_brackets::text)>1048576 then raise exception 'invalid brackets' using errcode='22023'; end if;
 if jsonb_array_length(p_brackets)>100 then raise exception 'too many brackets' using errcode='22023'; end if;
 roster:=((t.payload->'entries'->>('online-tournament:local-prototype-tournaments:v1:record:'||p_id))::jsonb)->'tournament'->'participantNames';
 for b in select value from jsonb_array_elements(p_brackets) loop
  if jsonb_typeof(b) is distinct from 'object' or (b-array['phase','rounds'])<>'{}'::jsonb or not (b ?& array['phase','rounds'])
   or jsonb_typeof(b->'phase') is distinct from 'string' or length(b->>'phase')>300 or jsonb_typeof(b->'rounds') is distinct from 'array' then raise exception 'invalid bracket' using errcode='22023'; end if;
  if jsonb_array_length(b->'rounds')>100 then raise exception 'too many rounds' using errcode='22023'; end if;
  for r in select value from jsonb_array_elements(b->'rounds') loop
   if jsonb_typeof(r) is distinct from 'object' or (r-array['label','matches'])<>'{}'::jsonb or not(r ?& array['label','matches'])
    or jsonb_typeof(r->'label') is distinct from 'string' or length(r->>'label')>300 or jsonb_typeof(r->'matches') is distinct from 'array' then raise exception 'invalid round' using errcode='22023'; end if;
   n:=n+jsonb_array_length(r->'matches'); if n>2000 then raise exception 'too many bracket matches' using errcode='22023'; end if;
   for m in select value from jsonb_array_elements(r->'matches') loop
    if jsonb_typeof(m) is distinct from 'object' or (m-array['a','b','score','winner','status','sets'])<>'{}'::jsonb or not(m ?& array['a','b','score','winner','status','sets'])
     or jsonb_typeof(m->'score') is distinct from 'string' or length(m->>'score')>100
     or not coalesce(m->>'winner' in ('A','B','NONE'),false) or not coalesce(m->>'status' in ('WAITING','LIVE','READY','CONFIRMATION','FINISHED','CANCELLED'),false)
     or jsonb_typeof(m->'sets') is distinct from 'array' then raise exception 'invalid bracket match' using errcode='22023'; end if;
    foreach k in array array['a','b'] loop
     s:=m->k;
     if jsonb_typeof(s) is distinct from 'object' or (s-array['kind','name'])<>'{}'::jsonb then raise exception 'invalid slot' using errcode='22023'; end if;
     if s->>'kind'='participant' then
      if not coalesce(roster ? (s->>'name'),false) then raise exception 'foreign bracket name' using errcode='22023'; end if;
     elsif not coalesce(s->>'kind' in ('bye','pending','unclaimed'),false) or s ? 'name' then raise exception 'invalid technical slot' using errcode='22023'; end if;
    end loop;
    if (m->>'winner'='A' and m->'a'->>'kind'<>'participant') or (m->>'winner'='B' and m->'b'->>'kind'<>'participant') then raise exception 'invalid winner' using errcode='22023'; end if;
    if jsonb_array_length(m->'sets')>100 then raise exception 'invalid set count' using errcode='22023'; end if;
    for s in select value from jsonb_array_elements(m->'sets') loop
     if jsonb_typeof(s) is distinct from 'object' or (s-array['sideAScore','sideBScore'])<>'{}'::jsonb
      or not coalesce(s->>'sideAScore' ~ '^[0-9]{1,15}$',false) or not coalesce(s->>'sideBScore' ~ '^[0-9]{1,15}$',false) then raise exception 'invalid bracket set' using errcode='22023'; end if;
    end loop;
   end loop;
  end loop;
 end loop;
 insert into tournament_private.online_spectator_brackets(tournament_id,revision,brackets) values(p_id,p_revision,p_brackets)
 on conflict(tournament_id) do update set revision=excluded.revision,brackets=excluded.brackets;
 return true;
end $$;
create function tournament_private.read_spectator_brackets(p_token uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',t.revision,'brackets',case when b.revision=t.revision then b.brackets else null end)
 from tournament_private.online_spectator_links l join tournament_private.online_tournaments t on t.id=l.tournament_id
 left join tournament_private.online_spectator_brackets b on b.tournament_id=t.id
 where l.token=p_token and l.show_matches and not exists(select 1 from tournament_private.online_archives a where a.tournament_id=t.id);
$$;
create function public.publish_online_spectator_brackets(p_id text,p_token uuid,p_revision integer,p_brackets jsonb) returns boolean
language sql security invoker set search_path='' as $$ select tournament_private.publish_spectator_brackets(p_id,p_token,p_revision,p_brackets); $$;
create function public.read_online_spectator_brackets(p_token uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select tournament_private.read_spectator_brackets(p_token); $$;
revoke all on function tournament_private.clear_disabled_brackets(),tournament_private.publish_spectator_brackets(text,uuid,integer,jsonb),tournament_private.read_spectator_brackets(uuid),public.publish_online_spectator_brackets(text,uuid,integer,jsonb),public.read_online_spectator_brackets(uuid) from public,anon,authenticated;
grant execute on function tournament_private.publish_spectator_brackets(text,uuid,integer,jsonb),public.publish_online_spectator_brackets(text,uuid,integer,jsonb) to authenticated;
grant execute on function tournament_private.read_spectator_brackets(uuid),public.read_online_spectator_brackets(uuid) to anon,authenticated;
