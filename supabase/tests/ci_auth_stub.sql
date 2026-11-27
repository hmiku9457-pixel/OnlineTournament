-- Disposable CI database only: minimal Supabase roles and JWT helpers.
-- Do not deploy to a hosted Supabase database.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$
select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create function auth.jwt() returns jsonb language sql stable as $$
select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$$;
grant usage on schema auth to anon,authenticated;
