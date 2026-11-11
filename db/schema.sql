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
--   * call submit_tournament(...) a finished 🏅 tournament, re-checked here (2026-11-09)
--   * call tournament_board(...)  the 🏅 medal board (names and counts, never ids)
--   * call submit_daily_score(...) a Daily Dump (🌞) score, once per player and UTC day (2026-11-10)
--   * call daily_board(...)        the 🌞 board for a day (names and scores, never ids)
--   * call submit_counters(...)    add a batch of runs to the player's lifetime counters (2026-11-11)
--   * call claim_achievements(...) record achievements the game says the player earned (2026-11-11)
--   * call player_stats(...)       any player's public profile, by id or board name (never ids)
-- A player has up to two rows: their best on the toilet and their best off it
-- (primary key player_id + toilet, since 2026-11-04).
-- and nothing else: no INSERT / UPDATE / DELETE on the table, and nothing at all
-- on player_aliases, the tournament tables (tournaments, tournament_stats,
-- tournament_matchups), daily_scores, player_counters, achievement_defs or
-- player_achievements. Profiles are public (2026-11-11): player_stats returns
-- anyone's stats, counters, achievements and biggest rival, by the name a board shows.
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
-- merge_players / player_name / submit_tournament / tournament_board /
-- submit_daily_score / daily_board / submit_counters / claim_achievements /
-- player_stats; an old client keeps working (same submit_score signature).
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
--   wipe the 🏅 board (receipts, stats and head-to-head rows):
--     truncate public.tournaments cascade; truncate public.tournament_stats;
--   remove a player's medals: delete from public.tournament_stats where name = 'somebody';
--   wipe the 🌞 Daily Dump boards: truncate public.daily_scores;
--   remove a daily cheat: delete from public.daily_scores where name = 'somebody' and day = '2026-11-10';
--   head-to-head, e.g. wins per pair (the rows stay owner-only; a profile shows
--   only each player's biggest rival, by name):
--     select player_a, player_b, winner_id, count(*) from public.tournament_matchups
--     where player_a <> player_b group by 1, 2, 3;
--   wipe the profiles' counters and achievements:
--     truncate public.player_counters; truncate public.player_achievements;
--   remove one wrongly earned achievement from everyone:
--     delete from public.player_achievements where achievement_id = 'some_id';
--   undo plan 08 (profiles): drop function public.player_stats(text, text),
--     public.submit_counters(text, text, jsonb), public.claim_achievements(text, text[]),
--     public.player_by_name(text), public.merge_counters(jsonb, jsonb);
--     drop table public.player_counters, public.player_achievements, public.achievement_defs;
--     then restore fold_player from the git history and run this file.
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

-- Added 2026-11-09 (tournament, Release B). A finished same-device tournament
-- (🏅) arrives once through submit_tournament, which re-checks the bracket and
-- derives the medals. Three tables, none readable by any role (ids are secrets):
--   tournaments          one receipt per tournament (its client-minted id): a resend
--                        is a no-op, and the host's last receipt paces the next one
--   tournament_stats     one row per linked player: medals, events, best race score
--   tournament_matchups  one row per race between two linked players: the owner's
--                        head-to-head analysis in the SQL editor, and each
--                        profile's biggest rival (player_stats, by name only)
-- Guests never reach the server: the payload carries { id: null, name: null }.
create table if not exists public.tournaments (
  id           text primary key check (id ~ '^[A-Za-z0-9_-]{22}$'),
  host_id      text not null check (host_id ~ '^[A-Za-z0-9_-]{22}$'),
  players      int  not null check (players between 3 and 8),   -- TUNING.tournament minPlayers / maxPlayers
  level_pipes  int[] not null,                                  -- the level table the races ran on
  submitted_at timestamptz not null default now()
);
create index if not exists tournaments_host on public.tournaments (host_id, submitted_at desc);

create table if not exists public.tournament_stats (
  player_id  text primary key check (player_id ~ '^[A-Za-z0-9_-]{22}$'),
  name       text not null check (name ~ '^[^[:cntrl:]]{1,16}$'),
  best_score int  not null default 0 check (best_score between 0 and 1000),
  gold       int  not null default 0 check (gold >= 0),
  silver     int  not null default 0 check (silver >= 0),
  bronze     int  not null default 0 check (bronze >= 0),
  events     int  not null default 0 check (events >= 0),
  updated_at timestamptz not null default now()
);

-- No player_a <> player_b check: a later merge of two ids that once raced each
-- other leaves a self-edge (filter it in analysis).
create table if not exists public.tournament_matchups (
  id            bigserial primary key,
  tournament_id text not null references public.tournaments (id) on delete cascade,
  match_id      text not null,                                  -- quarter0..3 / semi0..1 / bronze / final
  round         text not null check (round in ('quarter', 'semi', 'bronze', 'final')),
  player_a      text not null,
  player_b      text not null,
  winner_id     text not null,
  score_a       int  not null,
  score_b       int  not null,
  deaths_a      int  not null,
  deaths_b      int  not null,
  level_wins_a  int  not null,
  level_wins_b  int  not null,
  decided_by    text not null check (decided_by in ('score', 'deaths', 'levelWins', 'finalFirst')),
  played_at     timestamptz not null default now(),
  check (winner_id in (player_a, player_b))
);
create index if not exists tournament_matchups_a on public.tournament_matchups (player_a);
create index if not exists tournament_matchups_b on public.tournament_matchups (player_b);

alter table public.tournaments enable row level security;
alter table public.tournament_stats enable row level security;
alter table public.tournament_matchups enable row level security;
revoke all on public.tournaments, public.tournament_stats, public.tournament_matchups from public, anon, authenticated;
revoke all on sequence public.tournament_matchups_id_seq from public, anon, authenticated;

-- Added 2026-11-10 (Daily Dump, 🌞). Once per UTC day every player flies the same
-- date-seeded endless course at one level (3–7, from the date); one crash ends
-- the attempt. One row per (resolved) player and day: the first post is kept,
-- a resend answers 'duplicate'. Readable by no role (ids are secrets): the board
-- is daily_board(). Scores here never touch public.scores (the 🏆 board).
create table if not exists public.daily_scores (
  player_id    text not null check (player_id ~ '^[A-Za-z0-9_-]{22}$'),
  day          date not null,
  name         text not null check (name ~ '^[^[:cntrl:]]{1,16}$'),
  score        int  not null check (score between 0 and 10000),   -- LEADERBOARD.dailyMaxScore
  level        int  not null check (level between 3 and 7),       -- TUNING.daily minLevel / maxLevel
  pipes        int  not null check (pipes >= 0),
  submitted_at timestamptz not null default now(),
  primary key (player_id, day)
);
create index if not exists daily_scores_board on public.daily_scores (day, score desc, submitted_at asc);
alter table public.daily_scores enable row level security;
revoke all on public.daily_scores from public, anon, authenticated;

-- 32-bit FNV-1a over a text's characters (fnv1a32 in src/logic.js: day keys are
-- ASCII, so the code points match the client's UTF-16 units). Internal.
create or replace function public.fnv1a32(p text)
returns bigint
language plpgsql
immutable
as $$
declare
  h bigint := 2166136261;
  i int;
begin
  for i in 1 .. coalesce(length(p), 0) loop
    h := ((h # ascii(substr(p, i, 1))) * 16777619) & 4294967295;
  end loop;
  return h;
end;
$$;
revoke execute on function public.fnv1a32(text) from public, anon, authenticated;

-- A day's level, as the client's dailyLevel: 3 + fnv1a32('YYYY-MM-DD:level') % 5. Internal.
create or replace function public.daily_level(p_day date)
returns int
language sql
immutable
as $$
  select (3 + public.fnv1a32(to_char(p_day, 'YYYY-MM-DD') || ':level') % 5)::int;
$$;
revoke execute on function public.daily_level(date) from public, anon, authenticated;

-- Added 2026-11-11 (player profiles, plan 08). Lifetime counters: one flat jsonb
-- object of whole numbers per (resolved) player, summed batch by batch
-- (submit_counters); a key starting "max" keeps the larger value instead. The
-- client names the keys (games, wins, sumScore, sumLevel, maxLevel, dailyGames,
-- deaths, farts, fiber, ...), so a new counter needs no change here. last_batch
-- is the receipt: a resend of the same batch changes nothing. No name is stored
-- (the claim rule only guards names in scores). Readable by no role: the profile
-- is player_stats().
create table if not exists public.player_counters (
  player_id  text primary key check (player_id ~ '^[A-Za-z0-9_-]{22}$'),
  counters   jsonb not null default '{}'::jsonb,
  last_batch text,
  updated_at timestamptz not null default now()
);
alter table public.player_counters enable row level security;
revoke all on public.player_counters from public, anon, authenticated;

-- Achievements (plan 08). The game decides a badge was earned and claims its id
-- (claim_achievements); the server keeps the first claim per player and id.
-- achievement_defs lists only the time-boxed quests, each with its UTC window: a
-- claim outside it (plus two days' grace) is refused. Every other id is an
-- always-available badge and needs no row here. Neither table is readable by any
-- role: player_stats() returns a player's ids and dates.
create table if not exists public.achievement_defs (
  id     text primary key check (id ~ '^[a-z0-9_]{1,40}$'),  -- an id in ACHIEVEMENTS (src/achievements.js)
  starts date not null,                                      -- its from (UTC day)
  ends   date not null,                                      -- its to (UTC day, inclusive)
  check (ends >= starts)
);
alter table public.achievement_defs enable row level security;
revoke all on public.achievement_defs from public, anon, authenticated;
-- Time-boxed quests: one row per catalog entry with from / to (tests/achievements.test.js
-- checks they agree). Re-running the file updates a window. None yet; for example:
--   insert into public.achievement_defs (id, starts, ends) values
--     ('quest_example', '2026-12-01', '2026-12-31')
--   on conflict (id) do update set starts = excluded.starts, ends = excluded.ends;

create table if not exists public.player_achievements (
  player_id      text not null check (player_id ~ '^[A-Za-z0-9_-]{22}$'),
  achievement_id text not null check (achievement_id ~ '^[a-z0-9_]{1,40}$'),
  earned_at      timestamptz not null default now(),
  primary key (player_id, achievement_id)
);
alter table public.player_achievements enable row level security;
revoke all on public.player_achievements from public, anon, authenticated;

-- Profiles look players up by the name a board shows (player_by_name).
create index if not exists tournament_stats_name_key on public.tournament_stats (public.name_key(name));
create index if not exists daily_scores_name_key on public.daily_scores (public.name_key(name));

-- Two counter objects as one: per key the larger value for keys starting "max",
-- else the sum (addCounters in src/achievements.js). Internal.
create or replace function public.merge_counters(a jsonb, b jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(k,
           case when k like 'max%'
                then greatest(coalesce((a->>k)::bigint, 0), coalesce((b->>k)::bigint, 0))
                else coalesce((a->>k)::bigint, 0) + coalesce((b->>k)::bigint, 0) end), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(a, '{}'::jsonb)) as k
        union
        select jsonb_object_keys(coalesce(b, '{}'::jsonb))) keys;
$$;
revoke execute on function public.merge_counters(jsonb, jsonb) from public, anon, authenticated;

-- The player a board name belongs to, as the boards pick a display name: the
-- latest score-board name first; then a tournament or daily name, for a player
-- with no score-board rows. Null when nobody shows under that name. Internal.
create or replace function public.player_by_name(p_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.player_id from public.scores s
      where public.name_key(s.name) = public.name_key(p_name)
      order by s.updated_at desc limit 1),
    (select t.player_id from public.tournament_stats t
      where public.name_key(t.name) = public.name_key(p_name)
        and not exists (select 1 from public.scores s where s.player_id = t.player_id)
      order by t.updated_at desc limit 1),
    (select d.player_id from public.daily_scores d
      where public.name_key(d.name) = public.name_key(p_name)
        and not exists (select 1 from public.scores s where s.player_id = d.player_id)
      order by d.submitted_at desc limit 1));
$$;
revoke execute on function public.player_by_name(text) from public, anon, authenticated;

-- Fold the player v_merge into v_keep (both already resolved, distinct): per
-- toilet kind the kept row takes the higher score with that score's level and
-- write time, every kept row carries the kept player's name (the merged one's
-- when the kept player had no rows yet), the merged rows go, the merged id
-- becomes an alias of v_keep and its own aliases are re-pointed. Tournament
-- stats fold too (medals and events summed, best race score kept, the kept
-- player's stats name), and matchups and receipts are re-pointed. Daily Dump
-- rows move to the kept id; on a day both played, the kept player's row stays.
-- Lifetime counters merge (merge_counters) and achievements join, each keeping
-- its earlier date. Internal.
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
  insert into public.tournament_stats (player_id, name, best_score, gold, silver, bronze, events, updated_at)
  select v_keep, m.name, m.best_score, m.gold, m.silver, m.bronze, m.events, m.updated_at
  from public.tournament_stats m where m.player_id = v_merge
  on conflict (player_id) do update
    set best_score = greatest(public.tournament_stats.best_score, excluded.best_score),
        gold       = public.tournament_stats.gold + excluded.gold,
        silver     = public.tournament_stats.silver + excluded.silver,
        bronze     = public.tournament_stats.bronze + excluded.bronze,
        events     = public.tournament_stats.events + excluded.events,
        updated_at = greatest(public.tournament_stats.updated_at, excluded.updated_at);
  delete from public.tournament_stats where player_id = v_merge;
  update public.tournament_matchups
    set player_a  = case when player_a = v_merge then v_keep else player_a end,
        player_b  = case when player_b = v_merge then v_keep else player_b end,
        winner_id = case when winner_id = v_merge then v_keep else winner_id end
  where v_merge in (player_a, player_b);
  update public.tournaments set host_id = v_keep where host_id = v_merge;
  insert into public.daily_scores (player_id, day, name, score, level, pipes, submitted_at)
  select v_keep, d.day, d.name, d.score, d.level, d.pipes, d.submitted_at
  from public.daily_scores d where d.player_id = v_merge
  on conflict (player_id, day) do nothing;
  delete from public.daily_scores where player_id = v_merge;
  insert into public.player_counters (player_id, counters, last_batch, updated_at)
  select v_keep, m.counters, m.last_batch, m.updated_at
  from public.player_counters m where m.player_id = v_merge
  on conflict (player_id) do update
    set counters   = public.merge_counters(public.player_counters.counters, excluded.counters),
        updated_at = greatest(public.player_counters.updated_at, excluded.updated_at);
  delete from public.player_counters where player_id = v_merge;
  insert into public.player_achievements (player_id, achievement_id, earned_at)
  select v_keep, a.achievement_id, a.earned_at
  from public.player_achievements a where a.player_id = v_merge
  on conflict (player_id, achievement_id) do update
    set earned_at = least(public.player_achievements.earned_at, excluded.earned_at);
  delete from public.player_achievements where player_id = v_merge;
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

-- A finished tournament (🏅) from the host device: one call per tournament.
-- p_tournament (src/tournament.js tournamentPayload):
--   { "id": 22-char id, "levelPipes": [10, 25, …],
--     "players": [{ "id": player id | null, "name": name | null }, …],   (null id = a guest)
--     "matches": [{ "id": "quarter0", "round": "quarter", "a": 0, "b": 3, "winner": 0 | 1,
--                   "by": "score" | "deaths" | "levelWins" | "finalFirst",
--                   "slots": [{ "score", "deaths", "levelWins", "finalFirst" }, …] }, …] }
-- Raced matches only (byes are implied). Returns 'ok', or 'duplicate' for a
-- tournament already received (a resend after a lost answer). Raises 'bad host
-- id', 'rate limited' (another tournament from this host in the last 60 s) or
-- 'bad tournament: <why>' when the bracket is not one createTournament can
-- produce: per-round counts from the player count, each player at most once per
-- round, every semi side the winner of its quarter or a bye, the final the two
-- semi winners (3 players: the semi winner and the bye), the bronze match the
-- two semi losers, and each winner the one its slots give (score, then fewer
-- crashes, then more level wins, then first across the final line: raceOutcome).
-- The medals are derived here: the client only reports races. Then each linked
-- player's stats row gets +1 event, their medal and their best race score, and
-- every race between two linked players becomes a matchup row.
create or replace function public.submit_tournament(p_host_id text, p_tournament jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t jsonb := p_tournament;
  v_host text;
  v_tid text;
  v_n int;
  v_size int;
  v_pipes int[];
  v_ids text[];
  v_names text[];
  v_pid text;
  v_pname text;
  p jsonb;
  m jsonb;
  i int;
  k int;
  a int;
  b int;
  w int;
  v_by text;
  v_mid text;
  v_round text;
  sc0 int; sc1 int; d0 int; d1 int; lw0 int; lw1 int; ff0 boolean; ff1 boolean;
  v_want text;
  v_rows int;
  -- per match id: the winner / loser player index, and the two sides
  win jsonb := '{}'::jsonb;
  lose jsonb := '{}'::jsonb;
  sides jsonb := '{}'::jsonb;
  in_quarters int[] := '{}';
  in_semis int[] := '{}';
  seen int[];
  v_gold int;
  v_silver int;
  v_bronze int;
  v_best int;
  v_name text;
  q int;
  side_player int;
begin
  if p_host_id is null or p_host_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad host id';
  end if;
  if t is null or jsonb_typeof(t) <> 'object' or jsonb_typeof(t->'players') is distinct from 'array' or jsonb_typeof(t->'matches') is distinct from 'array' then
    raise exception 'bad tournament: shape';
  end if;
  v_tid := t->>'id';
  if v_tid is null or v_tid !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad tournament: id';
  end if;
  if jsonb_typeof(t->'levelPipes') is distinct from 'array' or jsonb_array_length(t->'levelPipes') not between 1 and 50
     or exists (select 1 from jsonb_array_elements(t->'levelPipes') e where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-9]{1,4}$' or (e #>> '{}')::int not between 1 and 1000) then
    raise exception 'bad tournament: levelPipes';
  end if;
  select array_agg((e #>> '{}')::int order by o) into v_pipes from jsonb_array_elements(t->'levelPipes') with ordinality x(e, o);

  -- One tournament at a time per host; the receipt first, so a resend (or two
  -- drains racing) is answered 'duplicate' before anything is counted twice.
  v_host := public.resolve_player(p_host_id);
  perform pg_advisory_xact_lock(hashtext('tournament:' || v_host));
  v_n := jsonb_array_length(t->'players');
  if v_n < 3 or v_n > 8 then
    raise exception 'bad tournament: % players', v_n;
  end if;
  insert into public.tournaments (id, host_id, players, level_pipes) values (v_tid, v_host, v_n, v_pipes)
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return 'duplicate';
  end if;
  if exists (select 1 from public.tournaments r where r.host_id = v_host and r.id <> v_tid and r.submitted_at > now() - interval '60 seconds') then
    raise exception 'rate limited';
  end if;

  -- Players: a valid id and name, or a guest (both null). Linked ids are resolved
  -- and must be distinct: two codes of one (merged) player are one competitor.
  v_ids := array_fill(null::text, array[v_n]);
  v_names := array_fill(null::text, array[v_n]);
  for i in 0 .. v_n - 1 loop
    p := t->'players'->i;
    if jsonb_typeof(p) is distinct from 'object' then
      raise exception 'bad tournament: player %', i;
    end if;
    v_pid := p->>'id';
    v_pname := p->>'name';
    if v_pid is null then
      continue;
    end if;
    if v_pid !~ '^[A-Za-z0-9_-]{22}$' or v_pname is null or v_pname !~ '^[^[:cntrl:]]{1,16}$' then
      raise exception 'bad tournament: player %', i;
    end if;
    v_pid := public.resolve_player(v_pid);
    if v_pid = any(v_ids) then
      raise exception 'bad tournament: one player twice';
    end if;
    v_ids[i + 1] := v_pid;
    v_names[i + 1] := v_pname;
  end loop;

  -- Matches: the right number per round for v_n players, each id once.
  v_size := case when v_n <= 4 then 4 else 8 end;
  if (select count(*) from jsonb_array_elements(t->'matches') e where e->>'round' = 'quarter') <> greatest(0, v_n - 4)
     or (select count(*) from jsonb_array_elements(t->'matches') e where e->>'round' = 'semi') <> (case when v_n >= 4 then 2 else 1 end)
     or (select count(*) from jsonb_array_elements(t->'matches') e where e->>'round' = 'bronze') <> (case when v_n >= 4 then 1 else 0 end)
     or (select count(*) from jsonb_array_elements(t->'matches') e where e->>'round' = 'final') <> 1
     or jsonb_array_length(t->'matches') <> v_n - 1 + (case when v_n >= 4 then 1 else 0 end) then
    raise exception 'bad tournament: match count';
  end if;

  for k in 0 .. jsonb_array_length(t->'matches') - 1 loop
    m := t->'matches'->k;
    v_mid := m->>'id';
    v_round := m->>'round';
    if v_mid is null or sides ? v_mid
       or not (v_round = 'quarter' and v_size = 8 and v_mid ~ '^quarter[0-3]$'
            or v_round = 'semi' and v_mid ~ '^semi[01]$'
            or v_round = 'bronze' and v_mid = 'bronze'
            or v_round = 'final' and v_mid = 'final') then
      raise exception 'bad tournament: match id %', coalesce(v_mid, '?');
    end if;
    if coalesce(m->>'a', '') !~ '^[0-9]$' or coalesce(m->>'b', '') !~ '^[0-9]$' or coalesce(m->>'winner', '') !~ '^[01]$' then
      raise exception 'bad tournament: % sides', v_mid;
    end if;
    a := (m->>'a')::int;
    b := (m->>'b')::int;
    w := (m->>'winner')::int;
    if a >= v_n or b >= v_n or a = b then
      raise exception 'bad tournament: % sides', v_mid;
    end if;
    if jsonb_typeof(m->'slots') is distinct from 'array' or jsonb_array_length(m->'slots') <> 2
       or exists (select 1 from jsonb_array_elements(m->'slots') e
                  where jsonb_typeof(e) is distinct from 'object'
                     or coalesce(e->>'score', '') !~ '^[0-9]{1,4}$' or coalesce(e->>'deaths', '') !~ '^[0-9]{1,4}$'
                     or coalesce(e->>'levelWins', '') !~ '^[0-9]{1,2}$' or jsonb_typeof(e->'finalFirst') is distinct from 'boolean') then
      raise exception 'bad tournament: % slots', v_mid;
    end if;
    sc0 := (m->'slots'->0->>'score')::int;  sc1 := (m->'slots'->1->>'score')::int;
    d0  := (m->'slots'->0->>'deaths')::int; d1  := (m->'slots'->1->>'deaths')::int;
    lw0 := (m->'slots'->0->>'levelWins')::int; lw1 := (m->'slots'->1->>'levelWins')::int;
    ff0 := (m->'slots'->0->>'finalFirst')::boolean; ff1 := (m->'slots'->1->>'finalFirst')::boolean;
    if sc0 > 1000 or sc1 > 1000 then
      raise exception 'bad tournament: % score', v_mid;
    end if;
    -- The winner its slots give (raceOutcome); a tournament race cannot be a draw.
    v_by := m->>'by';
    v_want := case when sc0 <> sc1 then 'score' when d0 <> d1 then 'deaths' when lw0 <> lw1 then 'levelWins' when ff0 <> ff1 then 'finalFirst' end;
    if v_want is null or v_by is distinct from v_want
       or w <> (case v_want when 'score' then (case when sc0 > sc1 then 0 else 1 end)
                            when 'deaths' then (case when d0 < d1 then 0 else 1 end)
                            when 'levelWins' then (case when lw0 > lw1 then 0 else 1 end)
                            else (case when ff0 then 0 else 1 end) end) then
      raise exception 'bad tournament: % winner', v_mid;
    end if;
    sides := sides || jsonb_build_object(v_mid, jsonb_build_array(a, b));
    win := win || jsonb_build_object(v_mid, case when w = 0 then a else b end);
    lose := lose || jsonb_build_object(v_mid, case when w = 0 then b else a end);
    if v_round = 'quarter' then
      in_quarters := in_quarters || array[a, b];
    elsif v_round = 'semi' then
      in_semis := in_semis || array[a, b];
    end if;
  end loop;

  -- Each player at most once per round.
  if (select count(distinct x) from unnest(in_quarters) x) <> coalesce(array_length(in_quarters, 1), 0)
     or (select count(distinct x) from unnest(in_semis) x) <> coalesce(array_length(in_semis, 1), 0) then
    raise exception 'bad tournament: a player twice in a round';
  end if;

  -- Semis (8 slots): side k of semi s is the winner of quarter 2s + k, or, when
  -- that quarter had a bye, a player who raced no quarter.
  if v_size = 8 then
    for k in 0 .. 1 loop
      for i in 0 .. 1 loop
        side_player := (sides->('semi' || k)->>i)::int;
        q := 2 * k + i;
        if sides ? ('quarter' || q) then
          if side_player <> (win->>('quarter' || q))::int then
            raise exception 'bad tournament: semi% side %', k, i;
          end if;
        elsif side_player = any(in_quarters) then
          raise exception 'bad tournament: semi% side %', k, i;
        end if;
      end loop;
    end loop;
  end if;

  -- The final: side s is the winner of semi s, or (3 players) a player in no semi.
  for i in 0 .. 1 loop
    side_player := (sides->'final'->>i)::int;
    if sides ? ('semi' || i) then
      if side_player <> (win->>('semi' || i))::int then
        raise exception 'bad tournament: final side %', i;
      end if;
    elsif v_size <> 4 or side_player = any(in_semis) then
      raise exception 'bad tournament: final side %', i;
    end if;
  end loop;

  -- The bronze match: side s is the loser of semi s.
  if sides ? 'bronze' then
    for i in 0 .. 1 loop
      if (sides->'bronze'->>i)::int <> (lose->>('semi' || i))::int then
        raise exception 'bad tournament: bronze side %', i;
      end if;
    end loop;
  end if;

  -- Every player raced at least once (the counts and the checks above imply it; cheap to state).
  select array_agg(distinct x) into seen from (
    select (e->>'a')::int x from jsonb_array_elements(t->'matches') e
    union select (e->>'b')::int from jsonb_array_elements(t->'matches') e) s;
  if coalesce(array_length(seen, 1), 0) <> v_n then
    raise exception 'bad tournament: a player never raced';
  end if;

  v_gold := (win->>'final')::int;
  v_silver := (lose->>'final')::int;
  v_bronze := case when sides ? 'bronze' then (win->>'bronze')::int
                   else (lose->>(case when sides ? 'semi0' then 'semi0' else 'semi1' end))::int end;

  -- Stats, one linked player at a time in id order (two tournaments sharing
  -- players lock rows in the same order). The name: the player's score-board
  -- name when they have one; else the code's name unless another player holds
  -- it on the score board (a code can carry any name), then their stats name or 'Player'.
  for i in select o - 1 from unnest(v_ids) with ordinality u(id, o) where id is not null order by id loop
    v_pid := v_ids[i + 1];
    select max(case when (e->>'a')::int = i then (e->'slots'->0->>'score')::int else (e->'slots'->1->>'score')::int end)
      into v_best
      from jsonb_array_elements(t->'matches') e
      where (e->>'a')::int = i or (e->>'b')::int = i;
    select s.name into v_name from public.scores s where s.player_id = v_pid order by s.updated_at desc limit 1;
    if v_name is null then
      if public.name_blocked(public.name_key(v_names[i + 1]), v_pid) then
        select st.name into v_name from public.tournament_stats st where st.player_id = v_pid;
        v_name := coalesce(v_name, 'Player');
      else
        v_name := v_names[i + 1];
      end if;
    end if;
    insert into public.tournament_stats (player_id, name, best_score, gold, silver, bronze, events, updated_at)
    values (v_pid, v_name, coalesce(v_best, 0),
            case when i = v_gold then 1 else 0 end, case when i = v_silver then 1 else 0 end, case when i = v_bronze then 1 else 0 end,
            1, now())
    on conflict (player_id) do update
      set name       = excluded.name,
          best_score = greatest(public.tournament_stats.best_score, excluded.best_score),
          gold       = public.tournament_stats.gold + excluded.gold,
          silver     = public.tournament_stats.silver + excluded.silver,
          bronze     = public.tournament_stats.bronze + excluded.bronze,
          events     = public.tournament_stats.events + 1,
          updated_at = now();
  end loop;

  -- Head-to-head: every race between two linked players.
  insert into public.tournament_matchups (tournament_id, match_id, round, player_a, player_b, winner_id, score_a, score_b, deaths_a, deaths_b, level_wins_a, level_wins_b, decided_by)
  select v_tid, e->>'id', e->>'round', v_ids[(e->>'a')::int + 1], v_ids[(e->>'b')::int + 1],
         v_ids[(case when (e->>'winner')::int = 0 then e->>'a' else e->>'b' end)::int + 1],
         (e->'slots'->0->>'score')::int, (e->'slots'->1->>'score')::int,
         (e->'slots'->0->>'deaths')::int, (e->'slots'->1->>'deaths')::int,
         (e->'slots'->0->>'levelWins')::int, (e->'slots'->1->>'levelWins')::int,
         e->>'by'
  from jsonb_array_elements(t->'matches') e
  where v_ids[(e->>'a')::int + 1] is not null and v_ids[(e->>'b')::int + 1] is not null;

  return 'ok';
end;
$$;

-- The 🏅 board: the top p_limit (1–100) linked players by gold, silver, bronze,
-- best race score (earlier first on a full tie), each with the name on the
-- score board when they have one. With p_player_id, that player's row is
-- flagged `me` and appended with its true rank when it is below the top. No
-- ids leave the server.
drop function if exists public.tournament_board(text, int);
create or replace function public.tournament_board(p_player_id text default null, p_limit int default 25)
returns table (rank int, name text, best_score int, gold int, silver int, bronze int, events int, me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select public.resolve_player(p_player_id) as cid where p_player_id ~ '^[A-Za-z0-9_-]{22}$'
  ), ranked as (
    select st.player_id as pid,
           coalesce((select s.name from public.scores s where s.player_id = st.player_id order by s.updated_at desc limit 1), st.name) as pname,
           st.best_score as pbest, st.gold as pgold, st.silver as psilver, st.bronze as pbronze, st.events as pevents,
           row_number() over (order by st.gold desc, st.silver desc, st.bronze desc, st.best_score desc, st.updated_at asc)::int as prank
    from public.tournament_stats st
  )
  select r.prank, r.pname, r.pbest, r.pgold, r.psilver, r.pbronze, r.pevents,
         coalesce(r.pid = (select cid from caller), false)
  from ranked r
  where r.prank <= least(greatest(coalesce(p_limit, 25), 1), 100) or r.pid = (select cid from caller)
  order by r.prank;
$$;

-- A Daily Dump score (🌞). p_day is the run's UTC day: today, or yesterday (a run
-- that ended after midnight, or posted later from offline); p_level must be that
-- day's level (daily_level). The name follows the score board's claim rule. The
-- first post per player and day is kept: a resend (or a second device) answers
-- 'duplicate' and changes nothing. Returns 'ok' or 'duplicate'; errors raise.
create or replace function public.submit_daily_score(p_player_id text, p_name text, p_day date, p_score int, p_level int, p_pipes int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_id text;
  v_key text;
  v_rows int;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  if p_name is null or p_name !~ '^[^[:cntrl:]]{1,16}$' then
    raise exception 'bad name';
  end if;
  if p_score is null or p_score < 0 or p_score > 10000 then
    raise exception 'bad score';
  end if;
  if p_pipes is null or p_pipes < 0 then
    raise exception 'bad pipes';
  end if;
  if p_day is null or p_day not in (v_today, v_today - 1) then
    raise exception 'bad day';
  end if;
  if p_level is null or p_level <> public.daily_level(p_day) then
    raise exception 'bad level';
  end if;

  v_id := public.resolve_player(p_player_id);
  v_key := public.name_key(p_name);
  perform pg_advisory_xact_lock(hashtext(v_key));
  if public.name_blocked(v_key, v_id) then
    raise exception 'name taken';
  end if;

  insert into public.daily_scores (player_id, day, name, score, level, pipes)
  values (v_id, p_day, p_name, p_score, p_level, p_pipes)
  on conflict (player_id, day) do nothing;
  get diagnostics v_rows = row_count;
  return case when v_rows = 0 then 'duplicate' else 'ok' end;
end;
$$;

-- The 🌞 board for p_day (default: today, UTC): the top p_limit (1–100) by score,
-- earlier post first on a tie, each with the name on the score board when the
-- player has one. With p_player_id, that player's row is flagged `me` and
-- appended with its true rank when it is below the top. `total` is how many
-- played that day. No ids leave the server.
create or replace function public.daily_board(p_player_id text default null, p_day date default null, p_limit int default 25)
returns table (rank int, name text, score int, level int, pipes int, me boolean, total int)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select public.resolve_player(p_player_id) as cid where p_player_id ~ '^[A-Za-z0-9_-]{22}$'
  ), today as (
    select coalesce(p_day, (now() at time zone 'utc')::date) as d
  ), ranked as (
    select ds.player_id as pid,
           coalesce((select s.name from public.scores s where s.player_id = ds.player_id order by s.updated_at desc limit 1), ds.name) as pname,
           ds.score as pscore, ds.level as plevel, ds.pipes as ppipes,
           row_number() over (order by ds.score desc, ds.submitted_at asc)::int as prank,
           (count(*) over ())::int as ptotal
    from public.daily_scores ds
    where ds.day = (select d from today)
  )
  select r.prank, r.pname, r.pscore, r.plevel, r.ppipes,
         coalesce(r.pid = (select cid from caller), false), r.ptotal
  from ranked r
  where r.prank <= least(greatest(coalesce(p_limit, 25), 1), 100) or r.pid = (select cid from caller)
  order by r.prank;
$$;

-- Lifetime counters (plan 08): add one batch of this device's runs to the
-- player's totals and return the totals (merged across every device and merged
-- id), so the game can judge lifetime badges on them. p_batch is the receipt: the
-- same batch again (a reply lost on the way back) changes nothing and returns the
-- totals. One batch per player per 5 s ('rate limited': the client keeps it and
-- retries). A batch is checked as a whole: every value a whole number up to
-- 1,000,000; a run scores at most LEADERBOARD.maxScore and reaches at most level
-- TUNING.levels.lastLevel. Errors raise ('bad ...': the client drops the batch).
create or replace function public.submit_counters(p_player_id text, p_batch text, p_counters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_row public.player_counters%rowtype;
  v_merged jsonb;
  v_games bigint;
  r record;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  if p_batch is null or p_batch !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad batch';
  end if;
  if p_counters is null or jsonb_typeof(p_counters) <> 'object' then
    raise exception 'bad counters';
  end if;
  if (select count(*) from jsonb_object_keys(p_counters)) not between 1 and 40 then
    raise exception 'bad counters: keys';
  end if;
  for r in select e.key, e.value from jsonb_each(p_counters) e loop
    if r.key !~ '^[a-z][A-Za-z0-9]{0,23}$' or jsonb_typeof(r.value) <> 'number' or (r.value #>> '{}') !~ '^[0-9]{1,7}$' then
      raise exception 'bad counters: %', r.key;
    end if;
    if (r.value #>> '{}')::bigint > 1000000 then
      raise exception 'bad counters: %', r.key;
    end if;
  end loop;
  v_games := coalesce((p_counters->>'games')::bigint, 0);
  if coalesce((p_counters->>'maxLevel')::bigint, 0) > 7
     or coalesce((p_counters->>'sumScore')::bigint, 0) > v_games * 1000
     or coalesce((p_counters->>'sumLevel')::bigint, 0) > v_games * 7
     or coalesce((p_counters->>'wins')::bigint, 0) > v_games then
    raise exception 'bad counters: totals';
  end if;

  v_id := public.resolve_player(p_player_id);
  perform pg_advisory_xact_lock(hashtext('counters:' || v_id));
  select * into v_row from public.player_counters where player_id = v_id;
  if found and v_row.last_batch = p_batch then
    return v_row.counters;
  end if;
  if found and v_row.updated_at > now() - interval '5 seconds' then
    raise exception 'rate limited';
  end if;
  v_merged := public.merge_counters(coalesce(v_row.counters, '{}'::jsonb), p_counters);
  if (select count(*) from jsonb_object_keys(v_merged)) > 60 then
    raise exception 'bad counters: too many keys';
  end if;
  insert into public.player_counters (player_id, counters, last_batch, updated_at)
  values (v_id, v_merged, p_batch, now())
  on conflict (player_id) do update
    set counters = excluded.counters, last_batch = excluded.last_batch, updated_at = excluded.updated_at;
  return v_merged;
end;
$$;

-- A player's profile (plan 08), for anyone: by id (the player's own, resolved)
-- or by a name as a board shows it (player_by_name); a valid id wins. Never an id
-- in the answer. {found: false} for a name nobody shows under; otherwise
--   name         the board's name for them (null with no rows anywhere)
--   single       games, wins, maxLevel (the counter or their best board row's
--                level, whichever is higher), avgLevel, avgScore (null at 0 games)
--   daily        dumps played; gold / silver / bronze = days they ranked 1st / 2nd
--                / 3rd, ranked as daily_board ranks (score, then earlier post)
--   tournament   events and medals (tournament_stats), and rival: the opponent
--                they lost to most (then met most, then by name) in
--                tournament_matchups, self-races left by merges ignored; or null
--   counters     their lifetime counters as stored
--   achievements [{ id, at: 'YYYY-MM-DD' (UTC) }], oldest first
create or replace function public.player_stats(p_player_id text default null, p_name text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id text;
  v_name text;
  v_c jsonb;
  v_games bigint;
  v_daily jsonb;
  v_tour jsonb;
  v_rival jsonb;
  v_ach jsonb;
begin
  if p_player_id ~ '^[A-Za-z0-9_-]{22}$' then
    v_id := public.resolve_player(p_player_id);
  elsif p_name ~ '^[^[:cntrl:]]{1,16}$' then
    v_id := public.player_by_name(p_name);
  end if;
  if v_id is null then
    return jsonb_build_object('found', false);
  end if;

  v_name := coalesce(
    (select s.name from public.scores s where s.player_id = v_id order by s.updated_at desc limit 1),
    (select t.name from public.tournament_stats t where t.player_id = v_id),
    (select d.name from public.daily_scores d where d.player_id = v_id order by d.submitted_at desc limit 1));
  v_c := coalesce((select pc.counters from public.player_counters pc where pc.player_id = v_id), '{}'::jsonb);
  v_games := coalesce((v_c->>'games')::bigint, 0);

  select jsonb_build_object(
           'dumps', count(*),
           'gold', count(*) filter (where x.rk = 1),
           'silver', count(*) filter (where x.rk = 2),
           'bronze', count(*) filter (where x.rk = 3))
  into v_daily
  from (
    select 1 + (select count(*) from public.daily_scores o
                where o.day = d.day and (o.score > d.score or (o.score = d.score and o.submitted_at < d.submitted_at))) as rk
    from public.daily_scores d
    where d.player_id = v_id
  ) x;

  select jsonb_build_object('name', y.oname, 'meetings', y.meetings, 'losses', y.losses)
  into v_rival
  from (
    select coalesce((select s.name from public.scores s where s.player_id = x.opp order by s.updated_at desc limit 1),
                    (select t.name from public.tournament_stats t where t.player_id = x.opp)) as oname,
           x.meetings, x.losses
    from (
      select case when m.player_a = v_id then m.player_b else m.player_a end as opp,
             count(*)::int as meetings,
             count(*) filter (where m.winner_id <> v_id)::int as losses
      from public.tournament_matchups m
      where v_id in (m.player_a, m.player_b) and m.player_a <> m.player_b
      group by 1
    ) x
  ) y
  order by y.losses desc, y.meetings desc, y.oname asc nulls last
  limit 1;

  select jsonb_build_object('events', t.events, 'gold', t.gold, 'silver', t.silver, 'bronze', t.bronze)
  into v_tour
  from public.tournament_stats t where t.player_id = v_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', a.achievement_id, 'at', to_char(a.earned_at at time zone 'utc', 'YYYY-MM-DD'))
                            order by a.earned_at, a.achievement_id), '[]'::jsonb)
  into v_ach
  from public.player_achievements a where a.player_id = v_id;

  return jsonb_build_object(
    'found', true,
    'name', v_name,
    'single', jsonb_build_object(
      'games', v_games,
      'wins', coalesce((v_c->>'wins')::bigint, 0),
      'maxLevel', greatest(coalesce((v_c->>'maxLevel')::int, 0),
                           coalesce((select max(s.level) from public.scores s where s.player_id = v_id), 0)),
      'avgLevel', case when v_games > 0 then round(coalesce((v_c->>'sumLevel')::numeric, 0) / v_games, 1) end,
      'avgScore', case when v_games > 0 then round(coalesce((v_c->>'sumScore')::numeric, 0) / v_games, 1) end),
    'daily', v_daily,
    'tournament', coalesce(v_tour, jsonb_build_object('events', 0, 'gold', 0, 'silver', 0, 'bronze', 0))
                  || jsonb_build_object('rival', v_rival),
    'counters', v_c,
    'achievements', v_ach);
end;
$$;

-- Claim achievements the game says this player earned (plan 08). Returns
-- { stored: [...], closed: [...] }: stored = kept (or already held); closed = a
-- time-boxed quest (achievement_defs) claimed outside its window plus two days'
-- grace, which the game then forgets. Any other well-formed id is an
-- always-available badge and is kept. 1–50 ids a call, 300 per player. Errors
-- raise ('bad ...': the client drops those claims).
create or replace function public.claim_achievements(p_player_id text, p_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_today date := (now() at time zone 'utc')::date;
  v_stored text[] := '{}';
  v_closed text[] := '{}';
  x text;
  d record;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 50 then
    raise exception 'bad ids';
  end if;
  if exists (select 1 from unnest(p_ids) u where u is null or u !~ '^[a-z0-9_]{1,40}$') then
    raise exception 'bad ids';
  end if;

  v_id := public.resolve_player(p_player_id);
  perform pg_advisory_xact_lock(hashtext('achievements:' || v_id));
  foreach x in array array(select distinct u from unnest(p_ids) u order by u) loop
    select ad.starts, ad.ends into d from public.achievement_defs ad where ad.id = x;
    if found and (v_today < d.starts or v_today > d.ends + 2) then
      v_closed := v_closed || x;
      continue;
    end if;
    insert into public.player_achievements (player_id, achievement_id) values (v_id, x)
    on conflict (player_id, achievement_id) do nothing;
    v_stored := v_stored || x;
  end loop;
  if (select count(*) from public.player_achievements pa where pa.player_id = v_id) > 300 then
    raise exception 'bad ids: too many achievements';
  end if;
  return jsonb_build_object('stored', to_jsonb(v_stored), 'closed', to_jsonb(v_closed));
end;
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
revoke execute on function public.submit_tournament(text, jsonb) from public, authenticated;
grant  execute on function public.submit_tournament(text, jsonb) to anon;
revoke execute on function public.tournament_board(text, int) from public, authenticated;
grant  execute on function public.tournament_board(text, int) to anon;
revoke execute on function public.submit_daily_score(text, text, date, int, int, int) from public, authenticated;
grant  execute on function public.submit_daily_score(text, text, date, int, int, int) to anon;
revoke execute on function public.daily_board(text, date, int) from public, authenticated;
grant  execute on function public.daily_board(text, date, int) to anon;
revoke execute on function public.submit_counters(text, text, jsonb) from public, authenticated;
grant  execute on function public.submit_counters(text, text, jsonb) to anon;
revoke execute on function public.player_stats(text, text) from public, authenticated;
grant  execute on function public.player_stats(text, text) to anon;
revoke execute on function public.claim_achievements(text, text[]) from public, authenticated;
grant  execute on function public.claim_achievements(text, text[]) to anon;

-- Tell PostgREST about the new functions right away.
notify pgrst, 'reload schema';
