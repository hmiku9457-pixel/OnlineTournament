-- Batch access changes reuse the existing owner and roster checks.
create function tournament_private.batch_player_access(p_id text,p_ids jsonb,p_action text)
returns integer language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); pid text; n integer:=0; h jsonb;
begin
 if p_action is null or p_action not in ('enable','disable') or jsonb_typeof(p_ids) is distinct from 'array' then raise exception 'invalid batch' using errcode='22023'; end if;
 if jsonb_array_length(p_ids)<1 or jsonb_array_length(p_ids)>2000 or octet_length(p_ids::text)>524288 then raise exception 'invalid batch size' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_ids) j where jsonb_typeof(j) is distinct from 'string') then raise exception 'invalid participant id' using errcode='22023'; end if;
 if (select count(distinct v) from jsonb_array_elements_text(p_ids) j(v))<>jsonb_array_length(p_ids) then raise exception 'duplicate participant id' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id,0));
 select tournament_private.report_header(t.id,t.payload) into h from tournament_private.online_tournaments t where t.id=p_id and t.owner_id=v_owner;
 if not found then raise exception 'tournament unavailable' using errcode='42501'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_ids) j(v) where not exists(select 1 from jsonb_each_text(h->'participantIds') i where i.value=j.v)) then raise exception 'participant unavailable' using errcode='22023'; end if;
 for pid in select value from jsonb_array_elements_text(p_ids) loop
  perform tournament_private.manage_player_access(p_id,pid,p_action);
  n:=n+1;
 end loop;
 return n;
end $$;
create function public.batch_online_player_access(p_id text,p_ids jsonb,p_action text) returns integer
language sql security invoker set search_path='' as $$ select tournament_private.batch_player_access(p_id,p_ids,p_action); $$;
-- Both reads share one stable PostgreSQL statement snapshot. No credentials,
-- other participants' unrelated matches or private state are added.
create function public.read_online_player_bundle(p_token uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('view',v.data,'reports',case when v.data is null then '[]'::jsonb else public.read_online_player_reports(p_token) end)
 from (select public.read_online_player_access(p_token) as data) v;
$$;
revoke all on function tournament_private.batch_player_access(text,jsonb,text),public.batch_online_player_access(text,jsonb,text),public.read_online_player_bundle(uuid) from public,anon,authenticated;
grant execute on function tournament_private.batch_player_access(text,jsonb,text),public.batch_online_player_access(text,jsonb,text) to authenticated;
grant execute on function public.read_online_player_bundle(uuid) to anon,authenticated;
