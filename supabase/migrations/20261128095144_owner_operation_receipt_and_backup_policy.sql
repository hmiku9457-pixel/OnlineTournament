-- Read-only receipt verification: a lost HTTP response is not evidence
-- that a commit failed. Exact request hash and owner must match.
create function tournament_private.inspect_online_operation(p_id text,p_name text,p_expected_revision integer,p_operation_id uuid,p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=tournament_private.owner_account(); current_rev integer; op tournament_private.online_operations; digest text;
begin
 if p_id is null or p_id !~ '^local-[a-zA-Z0-9-]{1,140}$' or p_expected_revision is null or p_expected_revision<0
 or p_expected_revision>=2147483647 or p_operation_id is null or p_name is null or p_payload is null
 or octet_length(p_payload::text)>4194304 or p_payload->>'tournamentId' is distinct from p_id then
 raise exception 'invalid operation receipt request' using errcode='22023'; end if;
 select revision into current_rev from tournament_private.online_tournaments where id=p_id and owner_id=v_owner;
 if not found then return jsonb_build_object('state','unknown','currentRevision',null,'committedRevision',null); end if;
 select * into op from tournament_private.online_operations where tournament_id=p_id and operation_id=p_operation_id;
 if found then
  digest:=encode(sha256(convert_to(jsonb_build_array(p_id,p_name,p_expected_revision,p_payload)::text,'UTF8')),'hex');
  if op.request_hash is distinct from digest then raise exception 'operation ID already used' using errcode='22023'; end if;
  return jsonb_build_object('state','confirmed','currentRevision',current_rev,'committedRevision',op.committed_revision);
 end if;
 return jsonb_build_object('state',case when current_rev=p_expected_revision then 'unconfirmed' else 'conflict' end,'currentRevision',current_rev,'committedRevision',null);
end $$;
create function public.inspect_online_operation(p_id text,p_name text,p_expected_revision integer,p_operation_id uuid,p_payload jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
select tournament_private.inspect_online_operation(p_id,p_name,p_expected_revision,p_operation_id,p_payload);
$$;
revoke all on function tournament_private.inspect_online_operation(text,text,integer,uuid,jsonb),public.inspect_online_operation(text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function tournament_private.inspect_online_operation(text,text,integer,uuid,jsonb),public.inspect_online_operation(text,text,integer,uuid,jsonb) to authenticated;
-- Anonymous sign-ins carry the authenticated role; deny all backup operations.
alter policy "owner reads backups" on public.tournament_backups using ((select auth.uid())=owner_id and not coalesce((select auth.jwt()->>'is_anonymous')='true',false));
alter policy "owner deletes backups" on public.tournament_backups using ((select auth.uid())=owner_id and not coalesce((select auth.jwt()->>'is_anonymous')='true',false));
