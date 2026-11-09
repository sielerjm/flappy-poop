-- Flappy Poop leaderboard: Supabase (Postgres + PostgREST) schema.
--
-- How to apply: Supabase dashboard -> SQL editor -> paste this whole file -> Run.
-- Expect "Success. No rows returned". Safe to re-run (idempotent).
-- This file is run by hand only. It is the source of truth: a deleted project
-- can be recreated by running it again. Nothing pushed to GitHub touches the
-- database (the GitHub integration is disabled on purpose).
--
-- Access model. The game ships the project's publishable key, which runs every
-- request as the `anon` role. anon can
--   * SELECT name, score, toilet, level, updated_at  (never player_id: that is the
--     player's secret save-code id, and reading it would let anyone rename them)
--   * call submit_score(...)   the only way to write; keeps the max score
--   * call player_rank(...)    rank of one of a player's rows, looked up by their own id
--   * call name_available(...) whether a username is free for this player's id
--   * call merge_players(...)  fold one of the player's ids into another (needs both secrets)
--   * call player_name(...)    the name on the board for this player's id (2026-11-09)
-- A player has up to two rows: their best on the toilet and their best off it
-- (primary key player_id + toilet, since 2026-11-04).
-- and nothing else: no INSERT / UPDATE / DELETE on the table, and nothing at all
-- on player_aliases.
--
-- One player across devices (2026-11-08). Every browser mints its own secret id,
-- so one person playing on a second phone used to become a second player. Now:
--   * player_aliases maps an old id to the id it was merged into. Every function
--     resolves an id through it first (resolve_player), so a browser that still
--     holds an old id keeps posting into, and ranking by, the merged player.
--   * merge_players(keep, merge) is what the game calls after "Load user code":
--     the client then holds both secret ids, which is the proof they are one
--     person. A stranger cannot call it usefully.
--   * A username belongs to the player holding it on the board: submit_score
--     raises 'name taken' when another id has rows under the same name key
--     (lower(btrim(name))) and this id has none. The game tells the player to
--     paste their user code instead. Ids that already shared a name before this
--     rule (the duplicates of 2026-11-08) are grandfathered: both keep posting,
--     a third id is refused.
--   * A successful post renames all of that player's rows, so a rename frees the
--     old name.
--   * The board's name is the player's name (2026-11-09): before posting, a
--     device asks player_name and adopts the board's name unless the player
--     typed a rename on that device. So a rename on one phone reaches the
--     others, and a phone holding the old name no longer renames them back.
-- Apply this file BEFORE pushing a client that calls name_available /
-- merge_players / player_name; an old client keeps working (same submit_score signature).
--
-- Maintenance (SQL editor):
--   remove a cheater or a ghost row:
--     delete from public.scores where name = 'somebody';
--   raise the score cap: edit the CHECK below, the submit_score guard, and
--   LEADERBOARD.maxScore in src/config.js to the same number, then paste this
--   whole file again (the drop/add after the primary-key block updates a live
--   table; create table if not exists alone would leave an old CHECK).
--   wipe the board:
--     truncate public.scores; truncate public.player_aliases;
--   fold one person's duplicate ids (same username from several browsers) into
--   one player, keeping the top scorer's id and aliasing the rest so their
--   devices keep working. Only when you know the rows are one person:
--     select public.admin_merge_name('somebody');
--   or every duplicated username at once (the 2026-11-08 one-off):
--     select * from public.admin_merge_all_duplicates();

create table if not exists public.scores (
  player_id  text not null check (player_id ~ '^[A-Za-z0-9_-]{22}$'), -- save-code id: 16 random bytes, base64url
  name       text not null check (name ~ '^[^[:cntrl:]]{1,16}$'),        -- NAME_MAX in src/save.js
  score      int  not null check (score between 0 and 1000),              -- LEADERBOARD.maxScore in src/config.js
  toilet     boolean not null default false,                              -- the run that set `score` was on the toilet
  level      int not null default 1 check (level between 1 and 50),       -- level the run that set `score` ended in
  updated_at timestamptz not null default now()
);

-- Added 2026-11-04 (levels): safe on a table created before the column existed.
alter table public.scores add column if not exists level int not null default 1 check (level between 1 and 50);

-- Added 2026-11-04 (two rows per player): the key becomes (player_id, toilet).
-- Changes only the key: no row is deleted or rewritten, and every existing row
-- keeps its toilet flag as that player's row for that kind. Does nothing when
-- the key is already right, so the file stays safe to re-run.
do $$
declare
  key_cols int;
begin
  select count(*) into key_cols
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = 'public.scores'::regclass and i.indisprimary;
  if key_cols <> 2 then
    alter table public.scores drop constraint if exists scores_pkey;
    alter table public.scores add constraint scores_pkey primary key (player_id, toilet);
  end if;
end;
$$;

-- Score cap (LEADERBOARD.maxScore): re-applied on every run so a live table
-- created under an older cap (e.g. 200) picks up the value in this file.
alter table public.scores drop constraint if exists scores_score_check;
alter table public.scores add constraint scores_score_check check (score between 0 and 1000);

create index if not exists scores_board on public.scores (score desc, updated_at asc);

-- The username key: case-insensitive, surrounding spaces ignored (the game trims
-- names; validateName in src/save.js). Immutable so it can back an index.
create or replace function public.name_key(p_name text)
returns text
language sql
immutable
as $$
  select lower(btrim(p_name));
$$;
revoke execute on function public.name_key(text) from public, anon, authenticated;

create index if not exists scores_name_key on public.scores (public.name_key(name));

-- Added 2026-11-08 (one player across devices): an old id and the id it was
-- merged into. Kept flat (a merge re-points the merged id's own aliases), so one
-- hop resolves any id. No role may read it: the ids are the players' secrets.
create table if not exists public.player_aliases (
  alias_id     text primary key check (alias_id ~ '^[A-Za-z0-9_-]{22}$'),
  canonical_id text not null check (canonical_id ~ '^[A-Za-z0-9_-]{22}$'),
  merged_at    timestamptz not null default now()
);
alter table public.player_aliases enable row level security;
revoke all on public.player_aliases from public, anon, authenticated;

-- The id a player's rows live under: the canonical id of an alias, else the id itself.
create or replace function public.resolve_player(p_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select a.canonical_id from public.player_aliases a where a.alias_id = p_id), p_id);
$$;
revoke execute on function public.resolve_player(text) from public, anon, authenticated;

-- The claim rule: a name key is blocked for a (resolved) id when another id has
-- rows under it and this id has none. Rows that already share a key stay as
-- they are (grandfathered).
create or replace function public.name_blocked(p_key text, p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.scores s where public.name_key(s.name) = p_key and s.player_id <> p_id)
     and not exists (select 1 from public.scores s where public.name_key(s.name) = p_key and s.player_id = p_id);
$$;
revoke execute on function public.name_blocked(text, text) from public, anon, authenticated;

alter table public.scores enable row level security;

drop policy if exists anon_read on public.scores;
create policy anon_read on public.scores for select to anon using (true);

grant usage on schema public to anon;
revoke all on public.scores from anon, authenticated;
grant select (name, score, toilet, level, updated_at) on public.scores to anon;

-- Upsert one player's best for one toilet state (p_toilet picks the row). Raises
-- (HTTP 400 through PostgREST) on bad input, on a username another player holds
-- ('name taken'), or when that row was written less than 5 s ago, so the client
-- never records a skipped write as confirmed. The id is resolved through
-- player_aliases first. Name always overwrites, on every row of the player, so a
-- rename frees the old name; score keeps the max; the level follows the score
-- only when the new score is higher. p_toilet / p_level default so older
-- clients still post.
drop function if exists public.submit_score(text, text, int, boolean);
create or replace function public.submit_score(p_player_id text, p_name text, p_score int, p_toilet boolean default false, p_level int default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  last_write timestamptz;
  v_id text;
  v_key text;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  if p_name is null or p_name !~ '^[^[:cntrl:]]{1,16}$' then
    raise exception 'bad name';
  end if;
  if p_score is null or p_score < 0 or p_score > 1000 then
    raise exception 'bad score';
  end if;
  if p_level is null or p_level < 1 or p_level > 50 then
    raise exception 'bad level';
  end if;

  v_id := public.resolve_player(p_player_id);
  v_key := public.name_key(p_name);
  -- One claimant at a time per name: two first-time posts of the same name cannot both insert.
  perform pg_advisory_xact_lock(hashtext(v_key));
  if public.name_blocked(v_key, v_id) then
    raise exception 'name taken';
  end if;

  select updated_at into last_write from public.scores where player_id = v_id and toilet = coalesce(p_toilet, false);
  if last_write is not null and last_write > now() - interval '5 seconds' then
    raise exception 'rate limited';
  end if;

  insert into public.scores (player_id, name, score, toilet, level, updated_at)
  values (v_id, p_name, p_score, coalesce(p_toilet, false), p_level, now())
  on conflict (player_id, toilet) do update
    set name       = excluded.name,
        score      = greatest(public.scores.score, excluded.score),
        level      = case when excluded.score > public.scores.score then excluded.level else public.scores.level end,
        updated_at = now();
  -- The player's other row (the other toilet kind) follows the name too.
  update public.scores set name = p_name where player_id = v_id and name <> p_name;
end;
$$;

-- Is p_name free for this player (true), or held by another id (false)? False
-- too on a bad name or id. Read-only: the game asks before storing a username.
create or replace function public.name_available(p_name text, p_player_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_name is null or p_name !~ '^[^[:cntrl:]]{1,16}$' then false
    when p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then false
    else not public.name_blocked(public.name_key(p_name), public.resolve_player(p_player_id))
  end;
$$;

-- The name on the board for this player (their rows share one; the latest write
-- wins if not), or null when the player has no rows. The id is resolved first,
-- so an old device's id answers with the merged player's name. Read-only: the
-- game adopts it before posting, so a rename made on another device sticks.
create or replace function public.player_name(p_player_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.name from public.scores s
  where p_player_id ~ '^[A-Za-z0-9_-]{22}$' and s.player_id = public.resolve_player(p_player_id)
  order by s.updated_at desc
  limit 1;
$$;

-- Fold the player v_merge into v_keep (both already resolved, distinct): per
-- toilet kind the kept row takes the higher score with that score's level and
-- write time, every kept row carries the kept player's name (the merged one's
-- when the kept player had no rows yet), the merged rows go, the merged id
-- becomes an alias of v_keep and its own aliases are re-pointed. Internal.
create or replace function public.fold_player(v_keep text, v_merge text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  r record;
begin
  if v_keep = v_merge then
    return;
  end if;
  -- Both players' rows, locked in a fixed order so two folds cannot deadlock.
  perform pg_advisory_xact_lock(hashtext(least(v_keep, v_merge)));
  perform pg_advisory_xact_lock(hashtext(greatest(v_keep, v_merge)));
  select name into v_name from public.scores where player_id = v_keep order by updated_at desc limit 1;
  if v_name is null then
    select name into v_name from public.scores where player_id = v_merge order by updated_at desc limit 1;
  end if;
  for r in select * from public.scores where player_id = v_merge loop
    insert into public.scores (player_id, name, score, toilet, level, updated_at)
    values (v_keep, v_name, r.score, r.toilet, r.level, r.updated_at)
    on conflict (player_id, toilet) do update
      set score      = greatest(public.scores.score, excluded.score),
          level      = case when excluded.score > public.scores.score then excluded.level else public.scores.level end,
          updated_at = case when excluded.score > public.scores.score then excluded.updated_at else public.scores.updated_at end;
  end loop;
  delete from public.scores where player_id = v_merge;
  update public.player_aliases set canonical_id = v_keep, merged_at = now() where canonical_id = v_merge;
  insert into public.player_aliases (alias_id, canonical_id)
  values (v_merge, v_keep)
  on conflict (alias_id) do update set canonical_id = v_keep, merged_at = now();
end;
$$;
revoke execute on function public.fold_player(text, text) from public, anon, authenticated;

-- The game's merge after "Load user code": p_keep_id is the pasted code's id (the
-- one the device adopts), p_merge_id the id the device had before. Holding both
-- secrets is the proof they are one person. Both are resolved first, so merging
-- an alias, or an id already folded into the other, is a no-op; safe to retry.
create or replace function public.merge_players(p_keep_id text, p_merge_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep text;
  v_merge text;
begin
  if p_keep_id is null or p_keep_id !~ '^[A-Za-z0-9_-]{22}$' or p_merge_id is null or p_merge_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  v_keep := public.resolve_player(p_keep_id);
  v_merge := public.resolve_player(p_merge_id);
  if v_keep = v_merge then
    return;
  end if;
  perform public.fold_player(v_keep, v_merge);
end;
$$;

-- Maintenance only (no role may call these; run them in the SQL editor as the
-- project owner). admin_merge_name folds every id holding p_name's key into the
-- one with the highest score (ties: the earliest write) and returns how many it
-- folded. admin_merge_all_duplicates does that for every duplicated key. Only
-- when you know the duplicates are one person: a fold cannot be undone.
create or replace function public.admin_merge_name(p_name text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_keep text;
  v_id text;
  n int := 0;
begin
  v_key := public.name_key(p_name);
  select player_id into v_keep from public.scores where public.name_key(name) = v_key order by score desc, updated_at asc limit 1;
  if v_keep is null then
    return 0;
  end if;
  for v_id in select distinct player_id from public.scores where public.name_key(name) = v_key and player_id <> v_keep loop
    perform public.fold_player(v_keep, v_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.admin_merge_name(text) from public, anon, authenticated;

create or replace function public.admin_merge_all_duplicates()
returns table (username text, folded int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select public.name_key(name) as k from public.scores group by 1 having count(distinct player_id) > 1
  loop
    username := r.k;
    folded := public.admin_merge_name(r.k);
    return next;
  end loop;
end;
$$;
revoke execute on function public.admin_merge_all_duplicates() from public, anon, authenticated;

-- Standing of one of a player's rows (on or off the toilet) on the mixed board,
-- in the order the board uses (score desc, then earlier write first). Returns
-- null when the player has no row of that kind.
--   {"rank": 23, "total": 150, "score": 41, "toilet": true, "level": 3}
drop function if exists public.player_rank(text);
create or replace function public.player_rank(p_player_id text, p_toilet boolean default false)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'rank',   1 + (select count(*) from public.scores o
                   where o.score > s.score or (o.score = s.score and o.updated_at < s.updated_at)),
    'total',  (select count(*) from public.scores),
    'score',  s.score,
    'toilet', s.toilet,
    'level',  s.level)
  from public.scores s
  where s.player_id = public.resolve_player(p_player_id) and s.toilet = coalesce(p_toilet, false);
$$;

revoke execute on function public.submit_score(text, text, int, boolean, int) from public, authenticated;
grant  execute on function public.submit_score(text, text, int, boolean, int) to anon;
revoke execute on function public.player_rank(text, boolean) from public, authenticated;
grant  execute on function public.player_rank(text, boolean) to anon;
revoke execute on function public.name_available(text, text) from public, authenticated;
grant  execute on function public.name_available(text, text) to anon;
revoke execute on function public.merge_players(text, text) from public, authenticated;
grant  execute on function public.merge_players(text, text) to anon;
revoke execute on function public.player_name(text) from public, authenticated;
grant  execute on function public.player_name(text) to anon;

-- Tell PostgREST about the new functions right away.
notify pgrst, 'reload schema';
