-- Private, durable acknowledgements for current, not-yet-scored assignments.
-- Recalling a match rotates its call identity without changing sporting data.
create table tournament_private.online_match_calls (
 tournament_id text not null references tournament_private.online_tournaments(id) on delete cascade,
 match_id text not null,
 a_id text not null,b_id text not null,started_at bigint not null,
 venue text not null,call_id uuid not null default gen_random_uuid(),
 called_at timestamptz not null default clock_timestamp(),
 ack_a boolean not null default false,ack_b boolean not null default false,
 primary key(tournament_id,match_id),unique(call_id)
);
alter table tournament_private.online_match_calls enable row level security;
revoke all on tournament_private.online_match_calls from public,anon,authenticated;

create function tournament_private.sync_online_match_call() returns trigger
language plpgsql security invoker set search_path='' as $$
declare venue_name text;
begin
 select r->>'table' into venue_name
 from tournament_private.online_tournaments t
 cross join lateral jsonb_array_elements((t.payload->'entries'->>'online-tournament:mock-match-runtime:v1')::jsonb) r
 where t.id=new.tournament_id and r->>'matchId'=new.match_id;
 if venue_name is null then return new; end if;
 insert into tournament_private.online_match_calls(tournament_id,match_id,a_id,b_id,started_at,venue)
 values(new.tournament_id,new.match_id,new.a_id,new.b_id,new.started_at,venue_name)
 on conflict(tournament_id,match_id) do update set
 a_id=excluded.a_id,b_id=excluded.b_id,started_at=excluded.started_at,venue=excluded.venue,
 call_id=gen_random_uuid(),called_at=clock_timestamp(),ack_a=false,ack_b=false
 where (online_match_calls.a_id,online_match_calls.b_id,online_match_calls.started_at,online_match_calls.venue)
 is distinct from (excluded.a_id,excluded.b_id,excluded.started_at,excluded.venue);
 return new;
end $$;
create trigger sync_online_match_call after insert on tournament_private.online_report_fixtures
for each row execute function tournament_private.sync_online_match_call();

-- Remove obsolete assignments immediately, even if a new projection has not
-- yet been published. A move away and back therefore requires a fresh call.
create function tournament_private.clear_obsolete_match_calls() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 delete from tournament_private.online_match_calls c where c.tournament_id=new.id and (
 tournament_private.report_header(new.id,new.payload)->>'status' not in ('RUNNING','PAUSED')
 or not exists(select 1 from jsonb_array_elements((new.payload->'entries'->>'online-tournament:mock-match-runtime:v1')::jsonb) r
 where r->>'matchId'=c.match_id and r->>'table'=c.venue and r->>'startedAt'=c.started_at::text and r->>'status' in ('LIVE','READY'))
 or exists(select 1 from jsonb_array_elements((new.payload->'entries'->>'online-tournament:mock-match-results:v2')::jsonb) r
 where r->>'matchId'=c.match_id and (r->>'status' in ('FINISHED','CANCELLED','CONFIRMATION') or jsonb_array_length(coalesce(r->'sets','[]'::jsonb))>0 or r ? 'forcedWinner' or r ? 'extraTimeProgress')));
 return new;
end $$;
create trigger clear_obsolete_match_calls after update of payload on tournament_private.online_tournaments
for each row execute function tournament_private.clear_obsolete_match_calls();

create function tournament_private.current_match_calls(p_id text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('matchId',c.match_id,'callId',c.call_id,'table',c.venue,'calledAt',c.called_at,
 'sideA',(select i.key from jsonb_each_text(tournament_private.report_header(t.id,t.payload)->'participantIds') i where i.value=c.a_id),
 'sideB',(select i.key from jsonb_each_text(tournament_private.report_header(t.id,t.payload)->'participantIds') i where i.value=c.b_id),
 'aId',c.a_id,'bId',c.b_id,'ackA',c.ack_a,'ackB',c.ack_b,'revision',t.revision) order by c.venue,c.match_id),'[]'::jsonb)
 from tournament_private.online_match_calls c
 join tournament_private.online_tournaments t on t.id=c.tournament_id
 join tournament_private.online_report_fixtures f on f.tournament_id=c.tournament_id and f.match_id=c.match_id
 where c.tournament_id=p_id and c.a_id=f.a_id and c.b_id=f.b_id and c.started_at=f.started_at
 and tournament_private.report_fixture_live(f,t)
 and not exists(select 1 from tournament_private.online_archives a where a.tournament_id=p_id);
$$;
create function tournament_private.player_match_calls(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l tournament_private.online_player_links;
begin
 select * into l from tournament_private.online_player_links where token=p_token;
 if not found then return '[]'::jsonb; end if;
 return (select coalesce(jsonb_agg((j-array['aId','bId','ackA','ackB'])||jsonb_build_object('acknowledged',
 case when j->>'aId'=l.participant_id then j->'ackA' else j->'ackB' end)),'[]'::jsonb)
 from jsonb_array_elements(tournament_private.current_match_calls(l.tournament_id)) j
 where l.participant_id in (j->>'aId',j->>'bId'));
end $$;
create function tournament_private.owner_match_calls(p_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from tournament_private.online_tournaments t where t.id=p_id and t.owner_id=tournament_private.owner_account()) then raise exception 'tournament unavailable' using errcode='42501'; end if;
 return tournament_private.current_match_calls(p_id);
end $$;
create function tournament_private.ack_match_call(p_token uuid,p_call_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare l tournament_private.online_player_links; c tournament_private.online_match_calls;
begin
 select * into l from tournament_private.online_player_links where token=p_token;
 if not found then raise exception 'player unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(l.tournament_id,0));
 select * into l from tournament_private.online_player_links where token=p_token;
 if not found then raise exception 'player unavailable' using errcode='42501'; end if;
 select * into c from tournament_private.online_match_calls where tournament_id=l.tournament_id and call_id=p_call_id;
 if not found or l.participant_id not in (c.a_id,c.b_id) then raise exception 'call unavailable' using errcode='42501'; end if;
 if not exists(select 1 from jsonb_array_elements(tournament_private.current_match_calls(l.tournament_id)) j where j->>'callId'=p_call_id::text) then raise exception 'call changed' using errcode='40001'; end if;
 update tournament_private.online_match_calls set ack_a=ack_a or c.a_id=l.participant_id,ack_b=ack_b or c.b_id=l.participant_id where tournament_id=l.tournament_id and call_id=p_call_id;
 return true;
end $$;
create function tournament_private.recall_match_call(p_id text,p_token uuid,p_call_id uuid,p_revision integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 if not exists(select 1 from tournament_private.online_tournaments t where t.id=p_id and t.owner_id=tournament_private.owner_account() and t.revision=p_revision) then raise exception 'tournament unavailable or changed' using errcode='42501'; end if;
 if not exists(select 1 from tournament_private.online_workspace_leases l where l.tournament_id=p_id and l.token=p_token and l.expires_at>clock_timestamp()) then raise exception 'workspace lease missing or expired' using errcode='55P03'; end if;
 if not exists(select 1 from jsonb_array_elements(tournament_private.current_match_calls(p_id)) j where j->>'callId'=p_call_id::text) then raise exception 'call changed' using errcode='40001'; end if;
 update tournament_private.online_match_calls set call_id=gen_random_uuid(),called_at=clock_timestamp(),ack_a=false,ack_b=false where tournament_id=p_id and call_id=p_call_id;
 return true;
end $$;
create function public.ack_online_match_call(p_token uuid,p_call_id uuid) returns boolean
language sql security invoker set search_path='' as $$select tournament_private.ack_match_call(p_token,p_call_id);$$;
create function public.list_online_match_calls(p_id text) returns jsonb
language sql stable security invoker set search_path='' as $$select tournament_private.owner_match_calls(p_id);$$;
create function public.recall_online_match_call(p_id text,p_token uuid,p_call_id uuid,p_revision integer) returns boolean
language sql security invoker set search_path='' as $$select tournament_private.recall_match_call(p_id,p_token,p_call_id,p_revision);$$;
create or replace function public.read_online_player_bundle(p_token uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('view',v.data,'reports',case when v.data is null then '[]'::jsonb else public.read_online_player_reports(p_token) end,
 'calls',case when v.data is null then '[]'::jsonb else tournament_private.player_match_calls(p_token) end)
 from (select public.read_online_player_access(p_token) as data) v;
$$;
revoke all on function tournament_private.sync_online_match_call(),tournament_private.clear_obsolete_match_calls(),tournament_private.current_match_calls(text),tournament_private.player_match_calls(uuid),tournament_private.owner_match_calls(text),tournament_private.ack_match_call(uuid,uuid),tournament_private.recall_match_call(text,uuid,uuid,integer),public.ack_online_match_call(uuid,uuid),public.list_online_match_calls(text),public.recall_online_match_call(text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function tournament_private.player_match_calls(uuid),tournament_private.ack_match_call(uuid,uuid),public.ack_online_match_call(uuid,uuid) to anon,authenticated;
grant execute on function tournament_private.owner_match_calls(text),tournament_private.recall_match_call(text,uuid,uuid,integer),public.list_online_match_calls(text),public.recall_online_match_call(text,uuid,uuid,integer) to authenticated;

-- Backfill current fixtures only, without changing tournament revisions.
insert into tournament_private.online_match_calls(tournament_id,match_id,a_id,b_id,started_at,venue)
select f.tournament_id,f.match_id,f.a_id,f.b_id,f.started_at,r->>'table'
from tournament_private.online_report_fixtures f join tournament_private.online_tournaments t on t.id=f.tournament_id
cross join lateral jsonb_array_elements((t.payload->'entries'->>'online-tournament:mock-match-runtime:v1')::jsonb) r
where r->>'matchId'=f.match_id and tournament_private.report_fixture_live(f,t)
on conflict do nothing;
