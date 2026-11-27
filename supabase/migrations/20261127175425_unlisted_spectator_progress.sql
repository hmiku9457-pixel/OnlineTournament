-- Unlisted spectator capability, disabled by default. Only a fixed,
-- server-generated projection is exposed, never the private snapshot.
create table tournament_private.online_spectator_links (
 tournament_id text primary key references tournament_private.online_tournaments(id) on delete cascade,
 token uuid unique not null default gen_random_uuid(),
 created_at timestamptz not null default now()
);
alter table tournament_private.online_spectator_links enable row level security;
revoke all on tournament_private.online_spectator_links from public,anon,authenticated;
create function tournament_private.manage_spectator(p_id text,p_action text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); v_token uuid;
begin
 if p_action is null or p_action not in ('read','enable','disable','rotate') then raise exception 'invalid action' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 if not exists(select 1 from tournament_private.online_tournaments where id=p_id and owner_id=v_owner)
 then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if p_action='disable' then
  delete from tournament_private.online_spectator_links where tournament_id=p_id; return null;
 end if;
 if p_action in ('enable','rotate') then
  if exists(select 1 from tournament_private.online_archives where tournament_id=p_id) then raise exception 'tournament archived' using errcode='55000'; end if;
  if p_action='rotate' then delete from tournament_private.online_spectator_links where tournament_id=p_id; end if;
  insert into tournament_private.online_spectator_links(tournament_id) values(p_id) on conflict(tournament_id) do nothing;
 end if;
 select token into v_token from tournament_private.online_spectator_links where tournament_id=p_id;
 return v_token;
end $$;
create function tournament_private.revoke_archived_spectator() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 delete from tournament_private.online_spectator_links where tournament_id=new.tournament_id;
 return new;
end $$;
create trigger revoke_archived_spectator after insert on tournament_private.online_archives
for each row execute function tournament_private.revoke_archived_spectator();
create function tournament_private.read_spectator(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t tournament_private.online_tournaments; e jsonb; h jsonb; lifecycle jsonb; results jsonb; runtime jsonb; phases jsonb;
begin
 select ot.* into t from tournament_private.online_spectator_links l join tournament_private.online_tournaments ot on ot.id=l.tournament_id
 where l.token=p_token and not exists(select 1 from tournament_private.online_archives a where a.tournament_id=ot.id);
 if not found then return null; end if;
 e:=t.payload->'entries';
 h:=((e->>('online-tournament:local-prototype-tournaments:v1:record:'||t.id))::jsonb)->'tournament';
 lifecycle:=coalesce((e->>'online-tournament:mock-phase-lifecycle:v1')::jsonb->0,'{}'::jsonb);
 results:=(e->>'online-tournament:mock-match-results:v2')::jsonb;
 runtime:=(e->>'online-tournament:mock-match-runtime:v1')::jsonb;
 select coalesce(jsonb_agg(jsonb_build_object('name',s.value->>'name','type',s.value->>'type',
  'started',coalesce(lifecycle->'startedStageIds' ? (s.value->>'id'),false),
  'completed',coalesce(lifecycle->'completedStageIds' ? (s.value->>'id'),false)) order by s.ordinality),'[]'::jsonb)
 into phases from jsonb_array_elements(h->'stages') with ordinality s(value,ordinality);
 return jsonb_build_object('name',t.name,'sport',h->>'sport','status',h->>'status','revision',t.revision,
  'updatedAt',t.updated_at,'participantCount',jsonb_array_length(h->'participantNames'),'tables',h->'tables',
  'phases',phases,
  'recordedResults',(select count(*) from jsonb_array_elements(results) r where r->>'status'='FINISHED' and coalesce(r->>'thirdPlaceSkipped','false')<>'true'),
  'occupiedTables',(select count(distinct r->>'table') from jsonb_array_elements(runtime) r
    where r->>'status' in ('LIVE','READY','CONFIRMATION') and r->>'table' ~ '^Tisch [1-9][0-9]*$'
    and not exists(select 1 from jsonb_array_elements(results) x where x->>'matchId'=r->>'matchId' and x->>'status' in ('FINISHED','CANCELLED'))));
end $$;
create function public.manage_online_spectator(p_id text,p_action text) returns uuid
language sql security invoker set search_path='' as $$ select tournament_private.manage_spectator(p_id,p_action); $$;
create function public.read_online_spectator(p_token uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select tournament_private.read_spectator(p_token); $$;
revoke all on function tournament_private.manage_spectator(text,text),tournament_private.revoke_archived_spectator(),tournament_private.read_spectator(uuid),public.manage_online_spectator(text,text),public.read_online_spectator(uuid) from public,anon,authenticated;
grant usage on schema tournament_private to anon;
grant execute on function tournament_private.manage_spectator(text,text),public.manage_online_spectator(text,text) to authenticated;
grant execute on function tournament_private.read_spectator(uuid),public.read_online_spectator(uuid) to anon,authenticated;
