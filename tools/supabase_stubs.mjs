// What a Supabase project has before db/schema.sql runs, for running the file in PGlite (a
// devDependency): the tests and tools/schema_check.mjs boot every database with these two strings.
// The game itself never loads this file.
//
// SUPABASE_ROLES: the roles anon and authenticated, and the default privileges that hand them
// every new table, sequence and function in `public`, as Supabase's do. So a table or function the
// schema forgets to revoke is readable or callable here too, as it would be on the live database.
//
// SUPABASE_PLATFORM: the parts of Supabase's own `auth` and `realtime` schemas that the online
// tables (plan 39) refer to, in the shapes the 0.3 spike saw on a live project
// (.claude/plans/39-logs/0.3-spike.md, finding 21): auth.users and auth.uid() / auth.jwt() from the
// request's JWT claims; realtime.messages (RLS on: the schema's policies decide who may read or
// write a channel topic), realtime.topic() from the channel being checked, and realtime.send(), the
// server-side broadcast, here a plain insert. A test acts as a signed-in device by setting
// request.jwt.claims (and realtime.topic) and switching to the authenticated role.

export const SUPABASE_ROLES = `create role anon nologin; create role authenticated nologin;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;`;

export const SUPABASE_PLATFORM = `
create schema if not exists auth;
create table if not exists auth.users (
  id                 uuid primary key,
  is_anonymous       boolean not null default false,
  created_at         timestamptz not null default now(),
  raw_user_meta_data jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;

create schema if not exists realtime;
create table if not exists realtime.messages (
  id          uuid not null default gen_random_uuid(),
  topic       text not null,
  extension   text not null,
  event       text,
  payload     jsonb,
  private     boolean default false,
  inserted_at timestamp not null default now()
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')::text;
$$;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql security definer as $$
  insert into realtime.messages (topic, extension, event, payload, private)
  values (topic, 'broadcast', event, payload, private);
$$;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
grant execute on function realtime.topic() to anon, authenticated;
revoke execute on function realtime.send(jsonb, text, text, boolean) from public;
`;

/** Both, in the order a fresh database needs them. */
export const SUPABASE_PREAMBLE = `${SUPABASE_ROLES}\n${SUPABASE_PLATFORM}`;
