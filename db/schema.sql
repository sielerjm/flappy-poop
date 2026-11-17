-- Flappy Poop leaderboard: Supabase (Postgres + PostgREST) schema.
--
-- How to apply: Supabase dashboard -> SQL editor -> paste this whole file -> Run.
-- Expect "Success. No rows returned". Safe to re-run (idempotent).
-- After an edit, `npm run schema:stamp` rewrites the stamp at the end of the file (schema_version()).
-- `npm run schema:check` says which version the live database has; `npm run push` refuses to push
-- until the live database has this one, then keeps tests/fixtures/schema-applied.sql equal to it.
-- This file is run by hand only. It is the source of truth: a deleted project
-- can be recreated by running it again. Nothing pushed to GitHub touches the
-- database (the GitHub integration is disabled on purpose).
--
-- Access model. The game ships the project's publishable key, which runs every
-- request as the `anon` role. anon can
--   * SELECT name, score, toilet, level, updated_at  (never player_id: that is the
--     player's secret save-code id, and reading it would let anyone rename them; never
--     a row the owner hid, admin_flag_player, plan 30)
--   * call submit_score(...)   the only way to write; keeps the max score
--   * call player_rank(...)    rank of one of a player's rows, looked up by their own id
--   * call name_available(...) whether a username is free for this player's id
--   * call merge_players(...)  fold one of the player's ids into another (needs both secrets)
--   * call player_name(...)    the name on the board for this player's id (2026-11-09)
--   * call submit_tournament(...) a finished 🏅 tournament, re-checked here (2026-11-09)
--   * call tournament_board(...)  the 🏅 medal board (names and counts, never ids); a page from p_offset (plan 28)
--   * call submit_daily_score(...) a Daily Dump (🌞) score, once per player and UTC day (2026-11-10)
--   * call daily_board(...)        the 🌞 board for a day (names and scores, never ids); a page from p_offset (plan 28)
--   * call submit_counters(...)    add a batch of runs to the player's lifetime counters (2026-11-11)
--   * call claim_achievements(...) record achievements the game says the player earned (2026-11-11)
--   * call player_stats(...)       any player's public profile, by id or board name (never ids)
--   * call board_tags(...)         the 🔧 / 🎖️ / 🆕 tags of the names a board shows (2026-11-12)
--   * call share_education(...)    put the player on the 📚 education board, by their own choice (2026-11-13); by invitation (plan 28)
--   * call submit_education_grades(...) add a batch of graded education runs to a sharing player's row
--   * call rename_education(...)   a sharing player's name on the 📚 board follows a rename (never adds a player)
--   * call unshare_education(...)  take the player off the 📚 board: the row is deleted
--   * call education_board(...)    the 📚 board: names, average grades and run counts, never ids; a page from p_offset (plan 28)
--   * call enrol_research(...)     join the education tester pilot with the invite code (2026-11-13)
--   * call submit_research_events(...) a pilot participant's answer events, under their research id
--   * call delete_research(...)    withdraw from the pilot: the participant and their answers are deleted
--   * call submit_runs(...)        a batch of run summaries, as numbers (plan 30); stored owner-only, 90 days
--   * call score_board(...)        the 🏆 top list as one player sees it: their own rows at their own best (names, never ids); a page from p_offset (plan 28)
--   * call schema_version()        which version of this file the database last ran (a stamp of the file; 2026-11-13)
--   * call play_days(...)          the days the player played, for their day streaks (plan 34): their own id only, days only
-- A player has up to two rows: their best on the toilet and their best off it
-- (primary key player_id + toilet, since 2026-11-04).
-- and nothing else: no INSERT / UPDATE / DELETE on the table, and nothing at all
-- on player_aliases, the tournament tables (tournaments, tournament_stats,
-- tournament_matchups), daily_scores, player_counters, achievement_defs,
-- player_achievements, player_meta, education_settings, education_public, research_participants
-- or research_responses (nor the research_* views), run_log, run_rejects, held_scores,
-- score_steps or board_settings. Profiles are public
-- (2026-11-11): player_stats returns anyone's stats, counters, achievements and biggest rival, by
-- the name a board shows; and, only for a player who shares them, their education grade (2026-11-13).
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
-- player_stats / board_tags / share_education / submit_education_grades / rename_education /
-- unshare_education / education_board / enrol_research / submit_research_events / delete_research /
-- submit_runs / score_board / schema_version / play_days;
-- an old client keeps working (same submit_score signature).
--
-- Maintenance (SQL editor):
--   hide a player from every board and from other players' lookups, by the name a board shows
--   (plan 30; nothing is deleted, and the player's own device sees its rows as before):
--     select public.admin_flag_player('somebody', 'why, for your own notes');
--   show them again: select public.admin_unflag_player('somebody');
--   a player's run summaries, newest first (plan 30): select * from public.admin_runs('somebody');
--   hold one run (its best leaves the board for others; nothing is deleted), and release it:
--     select public.hold_run('<player id>', '<run id>'); select public.release_run('<player id>', '<run id>');
--   hold a best with no run behind it as well: select public.admin_set_require_run(true);
--   who is hidden: select * from public.admin_flagged();
--   remove a ghost row (a test name, say): delete from public.scores where name = 'somebody';
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
--   tag a game dev 🔧 (or untag with false), by the name a board shows:
--     select public.admin_set_dev('somebody', true);
--   the 📚 education board (plan 21). Sharing is closed to everyone but 🔧 devs until you open it:
--     select public.admin_set_education_open(true);     -- or false to close it again
--   take one player off the 📚 board (their device stops sending when it next syncs):
--     delete from public.education_public where name = 'somebody';
--   wipe the 📚 board: truncate public.education_public;
--   the education tester pilot (plan 21): answer events from testers who joined with the invite
--   code. Set the code (16 characters or more; only its hash is stored; a new code stops the old
--   one; null closes enrolment), then give it to the testers:
--     select public.admin_set_invite('a-long-code-you-made-up');
--   read the answers (owner only): select * from public.research_summary;
--     select * from public.research_by_card; select * from public.research_by_participant;
--     select * from public.research_retention; select * from public.research_responses;
--   delete every participant and answer of a phase (the pilot's, before the beta):
--     select public.admin_purge_phase('pilot');
--   undo the streak backfill (plan 34, 34.13): drop function public.play_days(text, text);
--   undo the stamp: drop function public.schema_version();
--   undo the board pages (plan 28, 5.2): drop function public.score_board(text, int, int),
--     public.daily_board(text, date, int, int), public.tournament_board(text, int, int),
--     public.education_board(text, int, int); then restore the four from git (without p_offset)
--     and their grants, and run this file.
--   undo hiding (plan 30): drop function public.admin_flag_player(text, text),
--     public.admin_unflag_player(text), public.admin_flagged(); then restore anon_read (using true),
--     submit_score, submit_daily_score, player_rank, tournament_board, daily_board, education_board,
--     player_stats, board_tags and fold_player from git and run this file; then
--     drop function public.player_hidden(text); alter table public.scores drop column hidden;
--     alter table public.player_meta drop column hidden_at, drop column hidden_note.
--   undo the invitation (plan 28): drop function public.share_education(text, text, boolean, text);
--     alter table public.player_meta drop column edu_invited; then restore share_education,
--     enrol_research and fold_player from git and run this file.
--   undo the 🌞 / 🏅 name rule (plan 25): drop index public.daily_scores_name_key; then restore
--     name_blocked and submit_daily_score from git and run this file.
--   undo the receipt lists (plan 24): alter table public.player_counters drop column recent_batches;
--     alter table public.education_public drop column recent_batches; then restore submit_counters,
--     submit_education_grades and fold_player from git and run this file.
--   undo the pilot (before the 📚 board's undo: the pilot reads education_settings):
--     drop view public.research_summary, public.research_by_card,
--     public.research_by_participant, public.research_retention;
--     drop function public.enrol_research(text, text, boolean, text),
--     public.submit_research_events(text, text, jsonb, timestamptz), public.delete_research(text),
--     public.admin_set_invite(text), public.admin_purge_phase(text);
--     drop table public.research_responses, public.research_participants; then restore
--     fold_player from git and run this file.
--   undo the 📚 board: drop function public.share_education(text, text, boolean, text),
--     public.submit_education_grades(text, text, timestamptz, int, bigint, jsonb),
--     public.rename_education(text, text), public.unshare_education(text),
--     public.education_board(text, int, int), public.admin_set_education_open(boolean),
--     public.education_lock(text), public.education_paced(text);
--     alter table public.player_meta drop column edu_named_at;
--     drop table public.education_public, public.education_settings; then restore
--     player_by_name, fold_player and player_stats from git and run this file.
--   undo the v0.16.0 tags: drop function public.board_tags(text[]), public.player_tags(text),
--     public.admin_set_dev(text, boolean), public.touch_player(text), public.add_server_counter(text, text, int);
--     drop table public.player_meta; then restore submit_score, submit_daily_score,
--     submit_counters, claim_achievements, submit_tournament, fold_player and player_stats from git.
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

-- Postgres 15 or later (the pilot's security_invoker views need it): the paste stops here, before
-- anything is changed, on an older server (plan 25).
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'db/schema.sql needs Postgres 15 or later (this server is %)', current_setting('server_version');
  end if;
end;
$$;

create table if not exists public.scores (
  player_id  text not null check (player_id ~ '^[A-Za-z0-9_-]{22}$'), -- save-code id: 16 random bytes, base64url
  name       text not null check (name ~ '^[^[:cntrl:]]{1,16}$'),        -- NAME_MAX in src/save.js
  score      int  not null check (score between 0 and 1000),              -- LEADERBOARD.maxScore in src/config.js
  toilet     boolean not null default false,                              -- the run that set `score` was on the toilet
  level      int not null default 1 check (level between 1 and 7),        -- level the run that set `score` ended in (TUNING.levels.lastLevel)
  updated_at timestamptz not null default now()
);

-- Added 2026-11-04 (levels): safe on a table created before the column existed.
alter table public.scores add column if not exists level int not null default 1 check (level between 1 and 7);

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

-- Level cap (TUNING.levels.lastLevel, 7 since 5 Nov; plan 30): re-applied the same way, so a table
-- made under the old 1–50 check takes it. A row stored above the last level is lowered to it first.
update public.scores set level = 7 where level > 7;
alter table public.scores drop constraint if exists scores_level_check;
alter table public.scores add constraint scores_level_check check (level between 1 and 7);

-- Hidden rows (plan 30): admin_flag_player hides a player's rows instead of deleting them; anon_read
-- leaves them out of the board, and anon has no grant on the column. submit_score keeps it in step
-- with the player's state (player_meta.hidden_at).
alter table public.scores add column if not exists hidden boolean not null default false;

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
-- they are (grandfathered). A name another player shows under on the 📚 board
-- (education_public, below) is held the same way, unless this player holds it
-- there or on the score board (plan 24, AUD-022). plpgsql, so the 📚 table may be
-- made further down this file.
create or replace function public.name_blocked(p_key text, p_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- The score board's claim: another player's score row holds the name and this player has none
  -- under it.
  if exists (select 1 from public.scores s where public.name_key(s.name) = p_key and s.player_id <> p_id)
     and not exists (select 1 from public.scores s where public.name_key(s.name) = p_key and s.player_id = p_id) then
    return true;
  end if;
  -- A name this player already shows under, on any board, stays theirs (plan 25).
  if exists (select 1 from public.scores s where public.name_key(s.name) = p_key and s.player_id = p_id)
     or exists (select 1 from public.daily_scores d where public.name_key(d.name) = p_key and d.player_id = p_id)
     or exists (select 1 from public.tournament_stats t where public.name_key(t.name) = p_key and t.player_id = p_id)
     or exists (select 1 from public.education_public e where public.name_key(e.name) = p_key and e.player_id = p_id) then
    return false;
  end if;
  -- Otherwise the name is another player's when they show under it on the 📚 board (plan 24,
  -- AUD-022), or on the 🌞 or 🏅 board with no score row (the players a tapped name opens,
  -- player_by_name; plan 25). The 🏅 placeholder 'Player' is no one's.
  return exists (select 1 from public.education_public e where public.name_key(e.name) = p_key and e.player_id <> p_id)
      or exists (select 1 from public.daily_scores d
                  where public.name_key(d.name) = p_key and d.player_id <> p_id
                    and not exists (select 1 from public.scores s where s.player_id = d.player_id))
      or (p_key <> 'player' and exists (select 1 from public.tournament_stats t
                  where public.name_key(t.name) = p_key and t.player_id <> p_id
                    and not exists (select 1 from public.scores s where s.player_id = t.player_id)));
end;
$$;
revoke execute on function public.name_blocked(text, text) from public, anon, authenticated;

alter table public.scores enable row level security;

drop policy if exists anon_read on public.scores;
create policy anon_read on public.scores for select to anon using (not hidden);

grant usage on schema public to anon;
revoke all on public.scores from anon, authenticated;
grant select (name, score, toilet, level, updated_at) on public.scores to anon;

-- The run log and holding (plan 30): the tables, and the two read helpers the 🏆 and rank functions
-- below use. What they are for is said where submit_runs and hold_run are defined, further down.
-- Run summaries (plan 30): one row per finished single-player or Daily run, as numbers (src/runStats.js
-- makes them; never a test run, an education run or a match half). The device sends them in
-- submit_runs before its score posts. Owner-only: no role may read or write the tables, and no
-- profile or board shows them. A row is kept 90 days (received_at), except a held row and a hidden
-- player's rows. Times: started_at and ended_at are the device's clock; clock_offset_ms is the
-- server's clock minus the device's, measured when the batch was sent; received_at is the server's.
create table if not exists public.run_log (
  player_id       text not null check (player_id ~ '^[A-Za-z0-9_-]{22}$'), -- resolved (resolve_player)
  run_id          text not null check (run_id ~ '^[A-Za-z0-9_-]{22}$'),    -- made by the device
  session         text not null check (session ~ '^[A-Za-z0-9_-]{8,22}$'), -- one page load
  mode            text not null check (mode in ('single', 'daily')),
  day             date,                                                    -- the Daily's day
  stub            boolean not null default false,                          -- a Daily cut off by a reload
  score           int  not null check (score between 0 and 10000),
  level           int  not null check (level between 1 and 7),
  toilet          boolean not null default false,
  won             boolean not null default false,
  started_at      timestamptz,
  ended_at        timestamptz,
  length_ms       int check (length_ms between 0 and 86400000),           -- start to end, monotonic clock
  paused_ms       int check (paused_ms between 0 and 86400000),           -- paused or hidden, inside length_ms
  clock_offset_ms bigint not null default 0,
  version         text not null check (version ~ '^[0-9A-Za-z.+-]{1,24}$'),
  data            jsonb not null default '{}'::jsonb,                      -- run_data_keys(): numbers only
  received_at     timestamptz not null default now(),
  held            boolean not null default false,                          -- hold_run (moderation)
  held_at         timestamptz,
  primary key (player_id, run_id),
  check ((mode = 'daily') = (day is not null)),
  check (not stub or mode = 'daily')
);
create index if not exists run_log_received on public.run_log (player_id, received_at);
create index if not exists run_log_started on public.run_log (player_id, started_at);
alter table public.run_log enable row level security;
revoke all on public.run_log from public, anon, authenticated;

-- What submit_runs could not store, counted by UTC day, reason and client version (no ids).
create table if not exists public.run_rejects (
  day     date not null default (now() at time zone 'utc')::date,
  reason  text not null,
  version text not null,
  n       int  not null default 0,
  primary key (day, reason, version)
);
alter table public.run_rejects enable row level security;
revoke all on public.run_rejects from public, anon, authenticated;

create table if not exists public.held_scores (
  id          bigserial primary key,
  player_id   text not null,
  board       text not null check (board in ('scores', 'daily')),
  toilet      boolean not null default false,
  day         date,
  name        text not null,
  score       int  not null,
  level       int  not null,
  pipes       int,
  run_id      text,                                  -- the held run it matched, if any
  posted_at   timestamptz not null default now(),
  released_at timestamptz,
  check ((board = 'daily') = (day is not null))
);
create index if not exists held_scores_player on public.held_scores (player_id, board);
alter table public.held_scores enable row level security;
revoke all on public.held_scores from public, anon, authenticated;
revoke all on sequence public.held_scores_id_seq from public, anon, authenticated;

-- Every raise of a 🏆 row: score, level and the run that backed it (null: none, or a row from
-- before this table). hold_run reads it to put a row back to the best before a held run. Seeded
-- once with the rows of the day it was made. Owner-only.
create table if not exists public.score_steps (
  player_id text not null,
  toilet    boolean not null,
  score     int  not null,
  level     int  not null,
  run_id    text,
  at        timestamptz not null default now()
);
create index if not exists score_steps_player on public.score_steps (player_id, toilet, score);
alter table public.score_steps enable row level security;
revoke all on public.score_steps from public, anon, authenticated;
insert into public.score_steps (player_id, toilet, score, level, run_id, at)
select s.player_id, s.toilet, s.score, s.level, null, s.updated_at from public.scores s
where not exists (select 1 from public.score_steps);

-- Board switches (one row). require_run: a raise with no run behind it is held too.
create table if not exists public.board_settings (
  id          boolean primary key default true check (id),
  require_run boolean not null default false
);
insert into public.board_settings (id) values (true) on conflict (id) do nothing;
alter table public.board_settings enable row level security;
revoke all on public.board_settings from public, anon, authenticated;
-- own_best: a player's own 🏆 rows as their own device should see them: for each 🚽 kind, the
-- higher of the stored row and a held best (held_scores), under the name they last posted. A
-- player's own views read it; nobody else's do. Internal.
create or replace function public.own_best(p_id text)
returns table (pid text, name text, score int, toilet boolean, level int, at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p_id,
         coalesce((select s.name from public.scores s where s.player_id = p_id order by s.updated_at desc limit 1),
                  (select h.name from public.held_scores h where h.player_id = p_id order by h.posted_at desc limit 1)),
         c.score, c.toilet, c.level, c.at
  from (
    select distinct on (x.toilet) x.toilet, x.score, x.level, x.at
    from (
      select s.toilet, s.score, s.level, s.updated_at as at, 0 as pri from public.scores s where s.player_id = p_id
      union all
      select h.toilet, h.score, h.level, h.posted_at, 1 from public.held_scores h
      where h.player_id = p_id and h.board = 'scores' and h.released_at is null
    ) x
    order by x.toilet, x.score desc, x.pri asc
  ) c
  where p_id is not null;
$$;
revoke execute on function public.own_best(text) from public, anon, authenticated;

-- board_rows: the 🏆 rows as p_caller sees them: everyone's visible rows, and the caller's own
-- (own_best, hidden or not). p_caller null: the visible rows alone. Internal.
create or replace function public.board_rows(p_caller text)
returns table (pid text, name text, score int, toilet boolean, level int, at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.player_id, s.name, s.score, s.toilet, s.level, s.updated_at from public.scores s
  where not s.hidden and s.player_id is distinct from p_caller
  union all
  select * from public.own_best(p_caller);
$$;
revoke execute on function public.board_rows(text) from public, anon, authenticated;

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
  v_top_before text;
  v_top_after text;
  v_hidden boolean;
  v_current public.scores%rowtype;
  v_score int := p_score;
  v_level int := p_level;
  v_raise boolean;
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
  if p_level is null or p_level < 1 or p_level > 7 then
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
  if last_write is null then -- a held first post paces like a stored one (plan 30)
    select max(h.posted_at) into last_write from public.held_scores h
    where h.player_id = v_id and h.board = 'scores' and h.toilet = coalesce(p_toilet, false);
  end if;
  if last_write is not null and last_write > now() - interval '5 seconds' then
    raise exception 'rate limited';
  end if;
  perform public.touch_player(v_id);
  v_hidden := public.player_hidden(v_id);

  -- A post that raises the row (or makes the first) is matched to its run (plan 30): held, it is
  -- kept in held_scores and the post goes on as one that raised nothing.
  select * into v_current from public.scores where player_id = v_id and toilet = coalesce(p_toilet, false);
  v_raise := v_current.player_id is null or p_score > v_current.score;
  if v_raise and public.post_must_hold(v_id, coalesce(p_toilet, false), p_score, p_level, null) then
    insert into public.held_scores (player_id, board, toilet, name, score, level, run_id)
    values (v_id, 'scores', coalesce(p_toilet, false), p_name, p_score, p_level,
            (select r.run_id from public.run_log r where r.player_id = v_id and r.mode = 'single' and r.held
               and r.toilet = coalesce(p_toilet, false) and r.score = p_score and r.level = p_level
             order by r.received_at desc limit 1));
    v_raise := false;
    if v_current.player_id is null then
      update public.scores set name = p_name where player_id = v_id and name <> p_name;
      return;
    end if;
    v_score := v_current.score;
    v_level := v_current.level;
  end if;

  -- 👑 Dethroned: the 🏆 #1 (score, then the earlier write) before and after this post, among the
  -- rows the board shows (plan 30).
  perform pg_advisory_xact_lock(hashtext('board:scores'));
  select s.player_id into v_top_before from public.scores s where not s.hidden order by s.score desc, s.updated_at asc limit 1;
  insert into public.scores (player_id, name, score, toilet, level, updated_at, hidden)
  values (v_id, p_name, v_score, coalesce(p_toilet, false), v_level, now(), v_hidden)
  on conflict (player_id, toilet) do update
    set name       = excluded.name,
        score      = greatest(public.scores.score, excluded.score),
        level      = case when excluded.score > public.scores.score then excluded.level else public.scores.level end,
        updated_at = now(),
        hidden     = excluded.hidden;
  if v_raise then
    insert into public.score_steps (player_id, toilet, score, level, run_id)
    values (v_id, coalesce(p_toilet, false), p_score, p_level, public.post_run(v_id, coalesce(p_toilet, false), p_score, p_level, null));
  end if;
  -- The player's other row (the other toilet kind) follows the name too.
  update public.scores set name = p_name where player_id = v_id and name <> p_name;
  select s.player_id into v_top_after from public.scores s where not s.hidden order by s.score desc, s.updated_at asc limit 1;
  if v_top_after = v_id and v_top_before is not null and v_top_before <> v_id then
    perform public.add_server_counter(v_id, 'dethroned', 1);
  end if;
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
create index if not exists daily_scores_name_key on public.daily_scores (public.name_key(name)); -- name_blocked (plan 25)
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
  player_id      text primary key check (player_id ~ '^[A-Za-z0-9_-]{22}$'),
  counters       jsonb not null default '{}'::jsonb,
  last_batch     text,
  updated_at     timestamptz not null default now(),
  recent_batches text[] not null default '{}'
);
-- recent_batches (plan 24): the receipts of the latest 64 batches, newest first. A player's devices
-- each resend their own batch until it is confirmed, so one receipt (last_batch) let a device's
-- resend after another device's batch count twice. last_batch stays the latest, for older rows.
alter table public.player_counters add column if not exists recent_batches text[] not null default '{}';
-- A row from before the list keeps its one receipt in it (a re-run finds the list filled and leaves it).
update public.player_counters set recent_batches = array[last_batch] where last_batch is not null and recent_batches = '{}';
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

-- Added 2026-11-12 (player tags, v0.16.0). One row per (resolved) player: when the
-- server first saw them (joined_at; exact = recorded by a write function, false
-- for the backfill below, which only knows the earliest timestamp a table still
-- holds) and whether they are a game dev (set by the owner: admin_set_dev).
-- Readable by no role: player_stats and board_tags return the tags.
create table if not exists public.player_meta (
  player_id text primary key check (player_id ~ '^[A-Za-z0-9_-]{22}$'),
  joined_at timestamptz not null default now(),
  exact     boolean not null default true,
  dev       boolean not null default false
);
-- When this player last shared or renamed on the 📚 board (plan 25): share_education and
-- rename_education wait 5 s between two (education_paced). Here, not on the 📚 row, because Stop
-- sharing deletes that row.
alter table public.player_meta add column if not exists edu_named_at timestamptz;
-- Invited to share on the 📚 board (plan 28, 2.4): set by every share share_education takes (the first
-- with the invite code); an invited player shares and joins the pilot without it. Joining the pilot sets
-- nothing here (AUD-040): the pilot keeps to its own tables.
alter table public.player_meta add column if not exists edu_invited boolean not null default false;
-- Hidden by the owner (plan 30, admin_flag_player): when, and the owner's note. Every board and every
-- lookup by name leaves a hidden player out for everyone but the player.
alter table public.player_meta add column if not exists hidden_at timestamptz;
alter table public.player_meta add column if not exists hidden_note text check (hidden_note is null or length(hidden_note) <= 200);
alter table public.player_meta enable row level security;
revoke all on public.player_meta from public, anon, authenticated;

-- Backfill: every player the tables already know, at their earliest timestamp
-- (inexact: a score row's time moves when the best improves). Re-running adds
-- nobody new: the write functions record players as they post (touch_player).
insert into public.player_meta (player_id, joined_at, exact)
select pid, min(ts), false from (
  select player_id as pid, updated_at as ts from public.scores
  union all select player_id, submitted_at from public.daily_scores
  union all select player_id, updated_at from public.tournament_stats
  union all select host_id, submitted_at from public.tournaments
  union all select player_id, updated_at from public.player_counters
  union all select player_id, earned_at from public.player_achievements
) x
group by pid
on conflict (player_id) do nothing;

-- A (resolved) player seen by a write function: recorded once, exact. Internal.
create or replace function public.touch_player(v_id text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.player_meta (player_id, joined_at, exact) values (v_id, now(), true)
  on conflict (player_id) do nothing;
$$;
revoke execute on function public.touch_player(text) from public, anon, authenticated;

-- Is this (resolved) player hidden by the owner (plan 30)? Internal.
create or replace function public.player_hidden(v_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.player_meta m where m.player_id = v_id and m.hidden_at is not null);
$$;
revoke execute on function public.player_hidden(text) from public, anon, authenticated;

-- Added 2026-11-13 (education mode's 📚 board, plan 21 Stage 3b). Education mode keeps its
-- answers, grades and badges on the device. A player may choose to show a little of it: their
-- name, the average of their graded runs, how many runs that is, and their education badges.
-- That choice is one row here, made by share_education and deleted by unshare_education; nothing
-- about a player who has not chosen is ever stored. Right and wrong counts never come here.
--
-- education_settings: one row. board_open: while false only 🔧 dev players may share (the owner
-- opens it: admin_set_education_open). invite_hash and phase belong to the tester pilot's
-- answer uploads (a later step of plan 21).
create table if not exists public.education_settings (
  id          boolean primary key default true check (id),
  board_open  boolean not null default false,
  invite_hash text,
  phase       text not null default 'pilot' check (phase in ('pilot', 'beta', 'study'))
);
insert into public.education_settings (id) values (true) on conflict (id) do nothing;
alter table public.education_settings enable row level security;
revoke all on public.education_settings from public, anon, authenticated;

-- education_public: one row per (resolved) player who shares. runs = graded runs; grade_sum =
-- their grades added up, each a whole number of hundredths of a percent (0–10000), so the
-- average is grade_sum / runs. badges = { id: 'YYYY-MM-DD' }, ids starting edu_ (EDU_ACHIEVEMENTS
-- in src/achievements.js). name follows the score board's claim rule and is what the 📚 board
-- shows for a player with no score-board row. last_batch is the receipt of the latest batch.
-- shared_at names this round of sharing: a device sends it with every batch, and a device still
-- holding an older round's (sharing was stopped and started again elsewhere) is told to start
-- over, so no run is counted twice or left out. A new row's updated_at starts an hour back, so
-- the first batch is not rate limited. Readable by no role: education_board and player_stats.
create table if not exists public.education_public (
  player_id  text primary key check (player_id ~ '^[A-Za-z0-9_-]{22}$'),
  name       text not null check (name ~ '^[^[:cntrl:]]{1,16}$'),
  runs       int not null default 0 check (runs >= 0),
  grade_sum  bigint not null default 0 check (grade_sum >= 0),
  badges     jsonb not null default '{}'::jsonb,
  last_batch text,
  shared_at  timestamptz not null default date_trunc('milliseconds', clock_timestamp()),
  updated_at timestamptz not null default now() - interval '1 hour',
  recent_batches text[] not null default '{}',
  check (grade_sum <= runs::bigint * 10000)
);
-- recent_batches (plan 24): the receipts of the latest 64 batches in this round, newest first (as
-- player_counters', above: several devices feed one row).
alter table public.education_public add column if not exists recent_batches text[] not null default '{}';
update public.education_public set recent_batches = array[last_batch] where last_batch is not null and recent_batches = '{}';
create index if not exists education_public_name_key on public.education_public (public.name_key(name));
alter table public.education_public enable row level security;
revoke all on public.education_public from public, anon, authenticated;

-- Added 2026-11-13 (the education tester pilot, plan 21 Stage 3b). A tester who chooses to, in
-- the game's Education data panel, sends each quiz answer here: an adult, with the invite code.
-- The pilot tests the tools. Its answers are never analysed or quoted, and are deleted before
-- the next phase (admin_purge_phase).
--
-- research_participants: one row per (resolved) player who joined. research_id is a random id
-- made here; it is the only id the answers carry. phase is education_settings.phase when they
-- joined. last_batch is the receipt of their latest batch of events. This table is the one
-- place a player id meets a research id: readable by no role, and withdrawing deletes the row.
create table if not exists public.research_participants (
  player_id       text primary key check (player_id ~ '^[A-Za-z0-9_-]{22}$'),
  research_id     text not null unique default replace(gen_random_uuid()::text, '-', ''),
  phase           text not null check (phase in ('pilot', 'beta', 'study')),
  adult           boolean not null check (adult),
  consent_version text not null check (consent_version ~ '^[a-z0-9._-]{1,24}$'),
  consented_at    timestamptz not null default now(),
  last_batch      text,
  updated_at      timestamptz not null default now() - interval '1 hour',
  joined_at       timestamptz not null default date_trunc('milliseconds', clock_timestamp())
);
-- joined_at (plan 24): this participation's token. Set when the row is made and never changed, so
-- every device of one participation holds the same value (enrol_research hands it out); a withdrawal
-- and a new join make a new one, and a device still holding the old one is refused ('not enrolled').
alter table public.research_participants add column if not exists joined_at timestamptz not null default date_trunc('milliseconds', clock_timestamp());
alter table public.research_participants enable row level security;
revoke all on public.research_participants from public, anon, authenticated;

-- research_responses: one row per quiz answer, under the research id, never a player id.
-- event_id is made on the device, so a resent batch adds nothing. The columns are what the
-- owner's views read; data is the whole event as the game recorded it (src/research.js
-- answerEvent), its known fields only. client_at is the device's clock, received_at ours.
create table if not exists public.research_responses (
  event_id    text primary key check (event_id ~ '^[A-Za-z0-9_-]{22}$'),
  research_id text not null,
  phase       text not null check (phase in ('pilot', 'beta', 'study')),
  card_id     text not null check (card_id ~ '^[A-Z]{2}-[0-9]{2}$'),
  context     text not null check (context in ('break', 'revive', 'bonus')),
  correct     boolean not null,
  rt_ms       int check (rt_ms is null or rt_ms >= 0),
  seen        int not null default 0 check (seen >= 0),
  since_ms    bigint check (since_ms is null or since_ms >= 0),
  client_at   timestamptz not null,
  received_at timestamptz not null default now(),
  data        jsonb not null default '{}'::jsonb
);
create index if not exists research_responses_participant on public.research_responses (research_id, client_at);
create index if not exists research_responses_card on public.research_responses (card_id);

-- The invitation's backfill (plan 28, 2.4): players already on the 📚 board were invited before the
-- column existed; marked so Stop then Share still works. Re-running changes nothing. A pilot
-- participant gets no mark: taking part lets them share and join without the code, and the pilot
-- leaves nothing in player_meta, so Withdraw and the purge leave only what RESEARCH.md names (AUD-040).
insert into public.player_meta (player_id, joined_at, exact, edu_invited)
select player_id, now(), false, true from public.education_public
on conflict (player_id) do update set edu_invited = true;
alter table public.research_responses enable row level security;
revoke all on public.research_responses from public, anon, authenticated;

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

-- Add n to a server-only counter (SERVER_COUNTERS: dethroned) of a (resolved)
-- player. Leaves last_batch and updated_at alone; a row it creates starts an hour
-- back, so the player's next counter batch is not rate limited by it. Internal.
create or replace function public.add_server_counter(v_id text, p_key text, p_n int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.player_counters (player_id, counters, last_batch, updated_at)
  values (v_id, jsonb_build_object(p_key, p_n), null, now() - interval '1 hour')
  on conflict (player_id) do update
    set counters = public.merge_counters(public.player_counters.counters, excluded.counters);
$$;
revoke execute on function public.add_server_counter(text, text, int) from public, anon, authenticated;

-- The player a board name belongs to, as the boards pick a display name: the
-- latest score-board name first; then a tournament, daily or 📚 education board
-- name, for a player with no score-board rows. Null when nobody shows under that
-- name. Internal.
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
      order by d.submitted_at desc limit 1),
    (select e.player_id from public.education_public e
      where public.name_key(e.name) = public.name_key(p_name)
        and not exists (select 1 from public.scores s where s.player_id = e.player_id)
      order by e.shared_at desc limit 1));
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
-- its earlier date; player_meta keeps the earlier join and either's dev flag.
-- The 📚 education row: when only the merged player shares, the row moves to the
-- kept id as it is. When both share, their devices each hold a different round
-- (shared_at) and each has sent its own runs: adding the rows would count a
-- device's runs twice once it is told to start over. So the kept row starts a
-- new, empty round instead (the kept name stays) and every device sends its
-- whole record again when it next syncs. A research participant moves to the kept
-- id; when both joined, the merged one's answers move under the kept research id
-- (one person, one participant). Internal.
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
  -- And their 📚 rows (plan 25, A2): a grade batch, share, rename or unshare waits for the fold
  -- instead of writing a row the fold is moving, then follows the alias (education_lock).
  perform pg_advisory_xact_lock(hashtext('education:' || least(v_keep, v_merge)));
  perform pg_advisory_xact_lock(hashtext('education:' || greatest(v_keep, v_merge)));
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
  insert into public.player_counters (player_id, counters, last_batch, updated_at, recent_batches)
  select v_keep, m.counters, m.last_batch, m.updated_at, m.recent_batches
  from public.player_counters m where m.player_id = v_merge
  on conflict (player_id) do update
    set counters   = public.merge_counters(public.player_counters.counters, excluded.counters),
        updated_at = greatest(public.player_counters.updated_at, excluded.updated_at),
        recent_batches = (public.player_counters.recent_batches || array_remove(array[excluded.last_batch], null) || excluded.recent_batches)[1:64];
  delete from public.player_counters where player_id = v_merge;
  insert into public.player_achievements (player_id, achievement_id, earned_at)
  select v_keep, a.achievement_id, a.earned_at
  from public.player_achievements a where a.player_id = v_merge
  on conflict (player_id, achievement_id) do update
    set earned_at = least(public.player_achievements.earned_at, excluded.earned_at);
  delete from public.player_achievements where player_id = v_merge;
  insert into public.player_meta (player_id, joined_at, exact, dev, edu_named_at, edu_invited, hidden_at, hidden_note)
  select v_keep, m.joined_at, m.exact, m.dev, m.edu_named_at, m.edu_invited, m.hidden_at, m.hidden_note from public.player_meta m where m.player_id = v_merge
  on conflict (player_id) do update
    set exact     = case when excluded.joined_at < public.player_meta.joined_at then excluded.exact else public.player_meta.exact end,
        joined_at = least(public.player_meta.joined_at, excluded.joined_at),
        dev       = public.player_meta.dev or excluded.dev,
        edu_named_at = greatest(public.player_meta.edu_named_at, excluded.edu_named_at),
        edu_invited = public.player_meta.edu_invited or excluded.edu_invited,
        hidden_at = least(public.player_meta.hidden_at, excluded.hidden_at), -- hidden when either was (plan 30)
        hidden_note = coalesce(public.player_meta.hidden_note, excluded.hidden_note);
  delete from public.player_meta where player_id = v_merge;
  update public.scores set hidden = public.player_hidden(v_keep) where player_id = v_keep;
  if exists (select 1 from public.education_public where player_id = v_keep) then
    if exists (select 1 from public.education_public where player_id = v_merge) then
      update public.education_public
        set runs = 0, grade_sum = 0, badges = '{}'::jsonb, last_batch = null, recent_batches = '{}',
            shared_at = date_trunc('milliseconds', clock_timestamp()), updated_at = now() - interval '1 hour'
      where player_id = v_keep;
      delete from public.education_public where player_id = v_merge;
    end if;
  else
    update public.education_public set player_id = v_keep where player_id = v_merge;
  end if;
  if exists (select 1 from public.research_participants where player_id = v_keep) then
    -- (The alias is not `r`: that is this function's loop record.)
    update public.research_responses resp
      set research_id = k.research_id
    from public.research_participants k, public.research_participants m
    where k.player_id = v_keep and m.player_id = v_merge and resp.research_id = m.research_id;
    delete from public.research_participants where player_id = v_merge;
  else
    update public.research_participants set player_id = v_keep where player_id = v_merge;
  end if;
  delete from public.run_log m where m.player_id = v_merge
    and exists (select 1 from public.run_log k where k.player_id = v_keep and k.run_id = m.run_id);
  update public.run_log set player_id = v_keep where player_id = v_merge; -- plan 30
  update public.held_scores set player_id = v_keep where player_id = v_merge;
  update public.score_steps set player_id = v_keep where player_id = v_merge;
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
-- in the order the board uses (score desc, then earlier write first), among the
-- rows the board shows and the player's own rows (plan 30). Returns null when the
-- player has no row of that kind.
--   {"rank": 23, "total": 150, "score": 41, "toilet": true, "level": 3}
drop function if exists public.player_rank(text);
create or replace function public.player_rank(p_player_id text, p_toilet boolean default false)
returns json
language sql
stable
security definer
set search_path = public
as $$
  -- Among the rows this player sees (board_rows: their own at their own best, held ones included, plan 30).
  with b as (
    select * from public.board_rows(public.resolve_player(p_player_id))
  ), me as (
    select * from b where b.pid = public.resolve_player(p_player_id) and b.toilet = coalesce(p_toilet, false)
  )
  select json_build_object(
    'rank',   1 + (select count(*) from b o where o.score > me.score or (o.score = me.score and o.at < me.at)),
    'total',  (select count(*) from b),
    'score',  me.score,
    'toilet', me.toilet,
    'level',  me.level)
  from me;
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
    perform public.touch_player(v_pid);
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
-- flagged `me` and appended with its true rank when it is not on the page. No
-- ids leave the server. p_offset (plan 28, 5.2; default 0, so page 1's call is
-- unchanged): the page of places p_offset + 1 to p_offset + p_limit. The old
-- two-argument signature is dropped first, so a call never finds two.
drop function if exists public.tournament_board(text, int);
create or replace function public.tournament_board(p_player_id text default null, p_limit int default 25, p_offset int default 0)
returns table (rank int, name text, best_score int, gold int, silver int, bronze int, events int, me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select public.resolve_player(p_player_id) as cid where p_player_id ~ '^[A-Za-z0-9_-]{22}$'
  ), page as ( -- places lo + 1 to hi (plan 28, 5.2)
    select least(greatest(coalesce(p_offset, 0), 0), 1000000) as lo, least(greatest(coalesce(p_offset, 0), 0), 1000000) + least(greatest(coalesce(p_limit, 25), 1), 100) as hi
  ), ranked as (
    select st.player_id as pid,
           coalesce((select s.name from public.scores s where s.player_id = st.player_id order by s.updated_at desc limit 1), st.name) as pname,
           st.best_score as pbest, st.gold as pgold, st.silver as psilver, st.bronze as pbronze, st.events as pevents,
           row_number() over (order by st.gold desc, st.silver desc, st.bronze desc, st.best_score desc, st.updated_at asc)::int as prank
    from public.tournament_stats st
    where not public.player_hidden(st.player_id) or st.player_id = (select cid from caller) -- plan 30
  )
  select r.prank, r.pname, r.pbest, r.pgold, r.psilver, r.pbronze, r.pevents,
         coalesce(r.pid = (select cid from caller), false)
  from ranked r
  where (r.prank > (select lo from page) and r.prank <= (select hi from page)) or r.pid = (select cid from caller)
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
  v_top_before text;
  v_top_after text;
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

  perform public.touch_player(v_id);

  -- The day's first post is matched to its run (plan 30): held, it is kept in held_scores and
  -- answered as stored ('ok', then 'duplicate'); the player's earlier days follow the name as usual.
  if not exists (select 1 from public.daily_scores ds where ds.player_id = v_id and ds.day = p_day) then
    if exists (select 1 from public.held_scores h where h.player_id = v_id and h.board = 'daily' and h.day = p_day and h.released_at is null) then
      return 'duplicate';
    end if;
    if public.post_must_hold(v_id, false, p_score, p_level, p_day) then
      insert into public.held_scores (player_id, board, day, name, score, level, pipes, run_id)
      values (v_id, 'daily', p_day, p_name, p_score, p_level, p_pipes,
              (select r.run_id from public.run_log r where r.player_id = v_id and r.mode = 'daily' and r.held
                 and r.day = p_day and r.score = p_score order by r.received_at desc limit 1));
      update public.daily_scores set name = p_name where player_id = v_id and name <> p_name;
      return 'ok';
    end if;
  end if;

  -- 👑 Dethroned: that day's #1 (score, then the earlier post) before and after this post.
  perform pg_advisory_xact_lock(hashtext('board:daily:' || p_day::text));
  select ds.player_id into v_top_before from public.daily_scores ds where ds.day = p_day and not public.player_hidden(ds.player_id) order by ds.score desc, ds.submitted_at asc limit 1;
  insert into public.daily_scores (player_id, day, name, score, level, pipes)
  values (v_id, p_day, p_name, p_score, p_level, p_pipes)
  on conflict (player_id, day) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    -- The player's earlier days follow the name posted now, as score rows do, so a rename frees the
    -- old name (name_blocked counts 🌞 names; plan 25).
    update public.daily_scores set name = p_name where player_id = v_id and name <> p_name;
    select ds.player_id into v_top_after from public.daily_scores ds where ds.day = p_day and not public.player_hidden(ds.player_id) order by ds.score desc, ds.submitted_at asc limit 1;
    if v_top_after = v_id and v_top_before is not null and v_top_before <> v_id then
      perform public.add_server_counter(v_id, 'dethroned', 1);
    end if;
  end if;
  return case when v_rows = 0 then 'duplicate' else 'ok' end;
end;
$$;

-- The 🌞 board for p_day (default: today, UTC): the top p_limit (1–100) by score,
-- earlier post first on a tie, each with the name on the score board when the
-- player has one. With p_player_id, that player's row is flagged `me` and
-- appended with its true rank when it is not on the page. `total` is how many
-- played that day. No ids leave the server. p_offset (plan 28, 5.2; default 0,
-- so page 1's call is unchanged): the page of places p_offset + 1 to p_offset +
-- p_limit. The old three-argument signature is dropped first.
drop function if exists public.daily_board(text, date, int);
create or replace function public.daily_board(p_player_id text default null, p_day date default null, p_limit int default 25, p_offset int default 0)
returns table (rank int, name text, score int, level int, pipes int, me boolean, total int)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select public.resolve_player(p_player_id) as cid where p_player_id ~ '^[A-Za-z0-9_-]{22}$'
  ), page as ( -- places lo + 1 to hi (plan 28, 5.2)
    select least(greatest(coalesce(p_offset, 0), 0), 1000000) as lo, least(greatest(coalesce(p_offset, 0), 0), 1000000) + least(greatest(coalesce(p_limit, 25), 1), 100) as hi
  ), today as (
    select coalesce(p_day, (now() at time zone 'utc')::date) as d
  ), ranked as (
    select ds.player_id as pid,
           coalesce((select s.name from public.scores s where s.player_id = ds.player_id order by s.updated_at desc limit 1), ds.name) as pname,
           ds.score as pscore, ds.level as plevel, ds.pipes as ppipes,
           row_number() over (order by ds.score desc, ds.submitted_at asc)::int as prank,
           (count(*) over ())::int as ptotal
    from (
      select x.player_id, x.day, x.name, x.score, x.level, x.pipes, x.submitted_at from public.daily_scores x
      union all -- the caller's own held post of the day (plan 30)
      select h.player_id, h.day, h.name, h.score, h.level, coalesce(h.pipes, 0), h.posted_at from public.held_scores h
      where h.board = 'daily' and h.released_at is null and h.player_id = (select cid from caller)
        and not exists (select 1 from public.daily_scores y where y.player_id = h.player_id and y.day = h.day)
    ) ds
    where ds.day = (select d from today)
      and (not public.player_hidden(ds.player_id) or ds.player_id = (select cid from caller)) -- plan 30
  )
  select r.prank, r.pname, r.pscore, r.plevel, r.ppipes,
         coalesce(r.pid = (select cid from caller), false), r.ptotal
  from ranked r
  where (r.prank > (select lo from page) and r.prank <= (select hi from page)) or r.pid = (select cid from caller)
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
  -- Server-only counters (add_server_counter) never come from a client.
  if p_counters ? 'dethroned' then
    raise exception 'bad counters: dethroned';
  end if;
  v_games := coalesce((p_counters->>'games')::bigint, 0);
  if coalesce((p_counters->>'maxLevel')::bigint, 0) > 7
     or coalesce((p_counters->>'sumScore')::bigint, 0) > v_games * 1000
     or coalesce((p_counters->>'sumLevel')::bigint, 0) > v_games * 7
     or coalesce((p_counters->>'wins')::bigint, 0) > v_games then
    raise exception 'bad counters: totals';
  end if;

  v_id := public.resolve_player(p_player_id);
  perform public.touch_player(v_id);
  perform pg_advisory_xact_lock(hashtext('counters:' || v_id));
  select * into v_row from public.player_counters where player_id = v_id;
  if found and (v_row.last_batch = p_batch or p_batch = any(v_row.recent_batches)) then
    return v_row.counters;
  end if;
  if found and v_row.updated_at > now() - interval '5 seconds' then
    raise exception 'rate limited';
  end if;
  v_merged := public.merge_counters(coalesce(v_row.counters, '{}'::jsonb), p_counters);
  if (select count(*) from jsonb_object_keys(v_merged)) > 60 then
    raise exception 'bad counters: too many keys';
  end if;
  insert into public.player_counters (player_id, counters, last_batch, updated_at, recent_batches)
  values (v_id, v_merged, p_batch, now(), array[p_batch])
  on conflict (player_id) do update
    set counters = excluded.counters, last_batch = excluded.last_batch, updated_at = excluded.updated_at,
        recent_batches = (array[excluded.last_batch] || public.player_counters.recent_batches)[1:64];
  return v_merged;
end;
$$;

-- A player's tags (v0.16.0), in display order: 'dev' (🔧 set by the owner),
-- 'og' (🎖️ first seen before 1 Dec 2026: the game's first month), 'new' (🆕
-- first seen by a write function in the last 7 days; the backfill never is).
-- Internal: player_stats and board_tags return them.
create or replace function public.player_tags(v_id text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select array_remove(array[
      case when m.dev then 'dev' end,
      case when m.joined_at < timestamptz '2026-12-01 00:00:00+00' then 'og' end,
      case when m.exact and m.joined_at > now() - interval '7 days' then 'new' end], null)
    from public.player_meta m where m.player_id = v_id), '{}'::text[]);
$$;
revoke execute on function public.player_tags(text) from public, anon, authenticated;

-- The tags of the names a board shows (at most 100), each looked up as the boards
-- name players (player_by_name): [{ name, tags }]. No ids leave the server.
create or replace function public.board_tags(p_names text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', x.n, 'tags',
           to_jsonb(case when public.player_hidden(x.pid) then '{}'::text[] else public.player_tags(x.pid) end))), '[]'::jsonb)
  from (select d.n, public.player_by_name(d.n) as pid
        from (select distinct n from unnest((coalesce(p_names, '{}'::text[]))[1:100]) n where n ~ '^[^[:cntrl:]]{1,16}$') d) x;
$$;

-- Maintenance only (no role may call it): mark the player a board shows under
-- p_name as a game dev (🔧), or not. Returns 1, or 0 when nobody has that name.
--   select public.admin_set_dev('somebody', true);
create or replace function public.admin_set_dev(p_name text, p_on boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  v_id := public.player_by_name(p_name);
  if v_id is null then
    return 0;
  end if;
  insert into public.player_meta (player_id, joined_at, exact, dev) values (v_id, now(), false, coalesce(p_on, false))
  on conflict (player_id) do update set dev = coalesce(p_on, false);
  return 1;
end;
$$;
revoke execute on function public.admin_set_dev(text, boolean) from public, anon, authenticated;

-- Maintenance only (no role may call these; plan 30). admin_flag_player hides the player a board shows
-- under p_name: their rows stay, every board and every lookup by name leaves them out for everyone
-- else, and their own device sees what it saw before. p_note is the owner's own (200 characters at
-- most). A merge keeps the player hidden. admin_unflag_player shows them again. Each returns 1, or 0
-- when nobody has that name (unflag: or the player is not hidden). admin_flagged lists who is hidden.
--   select public.admin_flag_player('somebody', 'a note');
--   select public.admin_unflag_player('somebody');
--   select * from public.admin_flagged();
create or replace function public.admin_flag_player(p_name text, p_note text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  v_id := public.player_by_name(p_name);
  if v_id is null then
    return 0;
  end if;
  insert into public.player_meta (player_id, joined_at, exact, hidden_at, hidden_note) values (v_id, now(), false, now(), left(p_note, 200))
  on conflict (player_id) do update
    set hidden_at = coalesce(public.player_meta.hidden_at, now()),
        hidden_note = coalesce(left(p_note, 200), public.player_meta.hidden_note);
  update public.scores set hidden = true where player_id = v_id;
  return 1;
end;
$$;
revoke execute on function public.admin_flag_player(text, text) from public, anon, authenticated;

create or replace function public.admin_unflag_player(p_name text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_rows int;
begin
  v_id := public.player_by_name(p_name);
  if v_id is null then
    return 0;
  end if;
  update public.player_meta set hidden_at = null, hidden_note = null where player_id = v_id and hidden_at is not null;
  get diagnostics v_rows = row_count;
  update public.scores set hidden = false where player_id = v_id;
  return v_rows;
end;
$$;
revoke execute on function public.admin_unflag_player(text) from public, anon, authenticated;

create or replace function public.admin_flagged()
returns table (name text, hidden_at timestamptz, note text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           (select s.name from public.scores s where s.player_id = m.player_id order by s.updated_at desc limit 1),
           (select t.name from public.tournament_stats t where t.player_id = m.player_id),
           (select d.name from public.daily_scores d where d.player_id = m.player_id order by d.submitted_at desc limit 1),
           (select e.name from public.education_public e where e.player_id = m.player_id)),
         m.hidden_at, m.hidden_note
  from public.player_meta m
  where m.hidden_at is not null
  order by m.hidden_at;
$$;
revoke execute on function public.admin_flagged() from public, anon, authenticated;

-- The 📚 education board (plan 21, Stage 3b). Sharing is the player's own choice, made in the
-- game's Education data panel, for adults only.
--
-- education_lock (internal, plan 25): take this player's 📚 lock and return the id it holds. The
-- caller resolved the id before the lock; a fold that held it meanwhile (fold_player takes both
-- players' 📚 locks) may have made that id an alias, so the id is resolved again under the lock
-- and the kept player's lock taken too, until they agree.
create or replace function public.education_lock(p_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := p_id;
  v_now text;
begin
  loop
    perform pg_advisory_xact_lock(hashtext('education:' || v_id));
    v_now := public.resolve_player(v_id);
    exit when v_now = v_id;
    v_id := v_now;
  end loop;
  return v_id;
end;
$$;
revoke execute on function public.education_lock(text) from public, anon, authenticated;

-- education_paced (internal, plan 25): a share or rename on the 📚 board, at most one per 5 s per
-- player ('too soon'; the game reads it as offline and tries again later). Called under the
-- player's 📚 lock. Stop sharing is never paced.
create or replace function public.education_paced(v_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.touch_player(v_id);
  if exists (select 1 from public.player_meta where player_id = v_id and edu_named_at > now() - interval '5 seconds') then
    raise exception 'too soon';
  end if;
  update public.player_meta set edu_named_at = now() where player_id = v_id;
end;
$$;
revoke execute on function public.education_paced(text) from public, anon, authenticated;
--
-- share_education: put this player on the board under p_name, or rename a player already on it
-- (the game calls it again after a rename; nothing else about the row changes). p_adult must be
-- true: the game's "I am 18 or older" box. While the board is closed (education_settings) only
-- a 🔧 dev may share: 'closed'. The name follows the score board's claim rule ('name taken'): a
-- player who only plays education has no score-board row, so the name travels with the share.
-- Returns the row's shared_at, which names this round of sharing. Errors raise.
-- Sharing is by invitation (plan 28, 2.4): a 🔧 dev, a player the server knows as invited
-- (player_meta.edu_invited), a pilot participant or a player already on the board shares as before;
-- anyone else brings p_invite, the code whose SHA-256 is education_settings.invite_hash (the pilot's),
-- which marks them invited (as every share the server takes does). 'needs invite' otherwise (also while
-- no code is set). An old client's
-- 3-argument call reaches this one through p_invite's default.
drop function if exists public.share_education(text, text, boolean);
create or replace function public.share_education(p_player_id text, p_name text, p_adult boolean, p_invite text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_key text;
  v_at timestamptz;
  v_hash text;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  if p_name is null or p_name !~ '^[^[:cntrl:]]{1,16}$' then
    raise exception 'bad name';
  end if;
  if p_adult is not true then
    raise exception 'not adult';
  end if;
  v_id := public.resolve_player(p_player_id);
  if not (select es.board_open from public.education_settings es)
     and not coalesce((select m.dev from public.player_meta m where m.player_id = v_id), false) then
    raise exception 'closed';
  end if;
  if not (coalesce((select m.dev or m.edu_invited from public.player_meta m where m.player_id = v_id), false)
          or exists (select 1 from public.research_participants r where r.player_id = v_id)
          or exists (select 1 from public.education_public e where e.player_id = v_id)) then
    select es.invite_hash into v_hash from public.education_settings es;
    if v_hash is null or p_invite is null or length(p_invite) > 200
       or encode(sha256(convert_to(p_invite, 'UTF8')), 'hex') <> v_hash then
      raise exception 'needs invite';
    end if;
  end if;
  v_key := public.name_key(p_name);
  perform pg_advisory_xact_lock(hashtext(v_key));
  if public.name_blocked(v_key, v_id) then
    raise exception 'name taken';
  end if;
  -- A name a 🌞 or 🏅 player shows under (player_by_name) is theirs on the 📚 board too, unless
  -- this player holds it on the score board (plan 24, AUD-022).
  if coalesce(public.player_by_name(p_name) <> v_id, false)
     and not exists (select 1 from public.scores s where s.player_id = v_id and public.name_key(s.name) = v_key) then
    raise exception 'name taken';
  end if;
  perform public.touch_player(v_id);
  v_id := public.education_lock(v_id);
  perform public.education_paced(v_id);
  update public.player_meta set edu_invited = true where player_id = v_id; -- any share the server takes: invited from now on
  insert into public.education_public (player_id, name) values (v_id, p_name)
  on conflict (player_id) do update set name = excluded.name
  returning shared_at into v_at;
  return v_at;
end;
$$;

-- submit_education_grades: add one batch of this device's graded education runs to a sharing
-- player's row. p_runs graded runs (0–50) whose grades add up to p_grade_sum (hundredths of a
-- percent: at most p_runs × 10000), and p_badges = { edu_id: 'YYYY-MM-DD' } (a badge keeps its
-- earlier day; a day after tomorrow or before 2000 is stored as today). p_shared_at is the round
-- the device believes it is in. Answers
--   { status: 'ok', shared_at, runs, grade_sum }   added (or p_batch, the receipt, was already in:
--                                                  a resend changes nothing)
--   { status: 'restart', shared_at }               the row is another round's: nothing changed; the
--                                                  device takes this shared_at and sends its whole
--                                                  record again, from zero
-- and raises 'not shared' for a player with no row (the device then turns sharing off), 'rate
-- limited' (one batch per player per 5 s: the device keeps it and retries), or 'bad ...' (the
-- device drops the batch). A batch with no runs and no badges is a probe: it gets 'restart' or the
-- totals and changes nothing, so a device with nothing new still learns of a new round (plan 24).
create or replace function public.submit_education_grades(p_player_id text, p_batch text, p_shared_at timestamptz, p_runs int, p_grade_sum bigint, p_badges jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_row public.education_public%rowtype;
  v_badges jsonb;
  v_in jsonb := '{}'::jsonb;
  v_today text := to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD');
  r record;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  if p_batch is null or p_batch !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad batch';
  end if;
  if p_runs is null or p_runs < 0 or p_runs > 50 then
    raise exception 'bad runs';
  end if;
  if p_grade_sum is null or p_grade_sum < 0 or p_grade_sum > p_runs::bigint * 10000 then
    raise exception 'bad grade sum';
  end if;
  if p_badges is null or jsonb_typeof(p_badges) <> 'object' or (select count(*) from jsonb_object_keys(p_badges)) > 20 then
    raise exception 'bad badges';
  end if;
  -- A badge's day is the device's clock: one after tomorrow or before 2000 (a clock set wrong) is
  -- stored as today, so the batch's runs still reach the board (plan 24, AUD-010).
  for r in select e.key, e.value from jsonb_each(p_badges) e loop
    if r.key !~ '^edu_[a-z0-9_]{1,36}$' or jsonb_typeof(r.value) <> 'string' or (r.value #>> '{}') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
      raise exception 'bad badges: %', r.key;
    end if;
    v_in := v_in || jsonb_build_object(r.key, case
      when (r.value #>> '{}') < '2000-01-01' or (r.value #>> '{}') > to_char((now() at time zone 'utc')::date + 1, 'YYYY-MM-DD') then v_today
      else r.value #>> '{}' end);
  end loop;
  v_id := public.resolve_player(p_player_id);
  v_id := public.education_lock(v_id);
  select * into v_row from public.education_public where player_id = v_id;
  if not found then
    raise exception 'not shared';
  end if;
  if p_shared_at is distinct from v_row.shared_at then
    return jsonb_build_object('status', 'restart', 'shared_at', v_row.shared_at);
  end if;
  -- An empty batch is a probe (plan 24, AUD-009): a device with nothing new asks whether its round
  -- is still the row's. It writes nothing and takes no receipt and no rate-limit slot.
  if p_runs = 0 and p_badges = '{}'::jsonb then
    return jsonb_build_object('status', 'ok', 'shared_at', v_row.shared_at, 'runs', v_row.runs, 'grade_sum', v_row.grade_sum);
  end if;
  if v_row.last_batch = p_batch or p_batch = any(v_row.recent_batches) then
    return jsonb_build_object('status', 'ok', 'shared_at', v_row.shared_at, 'runs', v_row.runs, 'grade_sum', v_row.grade_sum);
  end if;
  if v_row.updated_at > now() - interval '5 seconds' then
    raise exception 'rate limited';
  end if;
  if v_row.runs + p_runs > 1000000 then
    raise exception 'bad runs: too many';
  end if;
  -- Badges join; one held already keeps the earlier of its two days (ISO days compare as text).
  select coalesce(jsonb_object_agg(k, least(v_row.badges ->> k, v_in ->> k)), '{}'::jsonb)
  into v_badges
  from (select jsonb_object_keys(v_row.badges) as k union select jsonb_object_keys(v_in)) keys;
  if (select count(*) from jsonb_object_keys(v_badges)) > 40 then
    raise exception 'bad badges: too many';
  end if;
  update public.education_public
    set runs = runs + p_runs, grade_sum = grade_sum + p_grade_sum, badges = v_badges, last_batch = p_batch, updated_at = now(),
        recent_batches = (array[p_batch] || recent_batches)[1:64]
  where player_id = v_id;
  return jsonb_build_object('status', 'ok', 'shared_at', v_row.shared_at, 'runs', v_row.runs + p_runs, 'grade_sum', v_row.grade_sum + p_grade_sum);
end;
$$;

-- rename_education: a sharing player's name on the 📚 board follows a rename made on their
-- device. It changes the name of an existing row and nothing else, and never puts a player on
-- the board (a device that has not heard the player stopped sharing must not share for them
-- again): true when renamed, false when the player does not share. The name follows the score
-- board's claim rule ('name taken'). Errors raise.
create or replace function public.rename_education(p_player_id text, p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
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
  v_id := public.resolve_player(p_player_id);
  v_key := public.name_key(p_name);
  perform pg_advisory_xact_lock(hashtext(v_key));
  if public.name_blocked(v_key, v_id) then
    raise exception 'name taken';
  end if;
  -- A name a 🌞 or 🏅 player shows under (player_by_name) is theirs on the 📚 board too, unless
  -- this player holds it on the score board (plan 24, AUD-022).
  if coalesce(public.player_by_name(p_name) <> v_id, false)
     and not exists (select 1 from public.scores s where s.player_id = v_id and public.name_key(s.name) = v_key) then
    raise exception 'name taken';
  end if;
  v_id := public.education_lock(v_id);
  if not exists (select 1 from public.education_public where player_id = v_id) then
    return false; -- not sharing: nothing to rename, and no pace taken
  end if;
  perform public.education_paced(v_id);
  update public.education_public set name = p_name where player_id = v_id;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- unshare_education: take this player off the 📚 board. The row is deleted at once; true when
-- there was one. Their other devices are told 'not shared' when they next send a batch.
create or replace function public.unshare_education(p_player_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_rows int;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  v_id := public.resolve_player(p_player_id);
  v_id := public.education_lock(v_id);
  delete from public.education_public where player_id = v_id;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- The 📚 board: sharing players with at least 3 graded runs (TUNING.education.boardMinRuns in
-- src/config.js), the top p_limit (1–100) by average grade, then more runs, then who shared
-- first. grade is the average in percent to one decimal. Each row carries the name on the score
-- board when the player has one, else the name they shared under. With p_player_id, that
-- player's row is flagged `me` and appended with its true rank when it is not on the page (a
-- caller with fewer than 3 runs is not on the board). `total` is how many are on it. No ids
-- leave the server. p_offset (plan 28, 5.2; default 0, so page 1's call is unchanged): the page
-- of places p_offset + 1 to p_offset + p_limit. The old two-argument signature is dropped first.
drop function if exists public.education_board(text, int);
create or replace function public.education_board(p_player_id text default null, p_limit int default 25, p_offset int default 0)
returns table (rank int, name text, grade numeric, runs int, me boolean, total int)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select public.resolve_player(p_player_id) as cid where p_player_id ~ '^[A-Za-z0-9_-]{22}$'
  ), page as ( -- places lo + 1 to hi (plan 28, 5.2)
    select least(greatest(coalesce(p_offset, 0), 0), 1000000) as lo, least(greatest(coalesce(p_offset, 0), 0), 1000000) + least(greatest(coalesce(p_limit, 25), 1), 100) as hi
  ), ranked as (
    select e.player_id as pid,
           coalesce((select s.name from public.scores s where s.player_id = e.player_id order by s.updated_at desc limit 1), e.name) as pname,
           round(e.grade_sum::numeric / e.runs / 100, 1) as pgrade,
           e.runs as pruns,
           row_number() over (order by e.grade_sum::numeric / e.runs desc, e.runs desc, e.shared_at asc)::int as prank,
           (count(*) over ())::int as ptotal
    from public.education_public e
    where e.runs >= 3
      and (not public.player_hidden(e.player_id) or e.player_id = (select cid from caller)) -- plan 30
  )
  select r.prank, r.pname, r.pgrade, r.pruns,
         coalesce(r.pid = (select cid from caller), false), r.ptotal
  from ranked r
  where (r.prank > (select lo from page) and r.prank <= (select hi from page)) or r.pid = (select cid from caller)
  order by r.prank;
$$;

-- Maintenance only (no role may call it): open the 📚 board to every adult who chooses to share
-- (true), or close it again so only 🔧 devs can (false). Returns the new setting. Rows already on
-- the board stay either way.
--   select public.admin_set_education_open(true);
create or replace function public.admin_set_education_open(p_on boolean)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.education_settings set board_open = coalesce(p_on, false) returning board_open;
$$;
revoke execute on function public.admin_set_education_open(boolean) from public, anon, authenticated;

-- The education tester pilot (plan 21, Stage 3b). Joining is the tester's own choice, made in the
-- game's Education data panel, for adults only, with the invite code the owner gave them.
--
-- enrol_research: join. p_invite must hash to education_settings.invite_hash ('bad invite' for a
-- wrong or missing code; 'closed' while no code is set), unless the player is invited (a share
-- marked them: player_meta.edu_invited). It writes only to the pilot's tables (AUD-040). The code's length is the protection:
-- player ids are free to make, so a limit on guesses per player would stop nobody, and
-- admin_set_invite refuses a short code. p_adult must be true. p_consent_version names the
-- notice the tester agreed to (RESEARCH.md's version, from the game). Joining again keeps the
-- research id, the phase they joined in (so admin_purge_phase removes everyone who joined in it)
-- and the participation's token, and records the newer consent. Returns { status: 'ok', phase,
-- since }: since is joined_at, the token the device sends with its answers. Errors raise.
create or replace function public.enrol_research(p_player_id text, p_invite text, p_adult boolean, p_consent_version text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_set public.education_settings%rowtype;
  v_phase text;
  v_since timestamptz;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  if p_adult is not true then
    raise exception 'not adult';
  end if;
  if p_consent_version is null or p_consent_version !~ '^[a-z0-9._-]{1,24}$' then
    raise exception 'bad consent';
  end if;
  select * into v_set from public.education_settings;
  if v_set.invite_hash is null then
    raise exception 'closed';
  end if;
  v_id := public.resolve_player(p_player_id);
  -- An invited player (plan 28, 2.4: the 📚 board's invitation, marked by a share) joins without the code.
  if not coalesce((select m.edu_invited from public.player_meta m where m.player_id = v_id), false)
     and (p_invite is null or length(p_invite) > 200
          or encode(sha256(convert_to(p_invite, 'UTF8')), 'hex') <> v_set.invite_hash) then
    raise exception 'bad invite';
  end if;
  perform pg_advisory_xact_lock(hashtext('research:' || v_id));
  -- Nothing outside the pilot's own tables (AUD-040): no player_meta row, no invitation mark, so
  -- Withdraw and the purge leave nothing behind that RESEARCH.md does not name. While taking part,
  -- share_education lets the participant in without the code.
  insert into public.research_participants (player_id, phase, adult, consent_version)
  values (v_id, v_set.phase, true, p_consent_version)
  on conflict (player_id) do update
    set consent_version = excluded.consent_version, consented_at = now()
  returning phase, joined_at into v_phase, v_since;
  return jsonb_build_object('status', 'ok', 'phase', v_phase, 'since', v_since);
end;
$$;

-- submit_research_events: a participant's answer events, 1–200 a batch, stored under their
-- research id and the phase they joined in. Only a player who joined may send, from this
-- participation: p_since must be the token enrol_research gave (joined_at), so a device that joined
-- before a withdrawal and a new join cannot send its older answers under the new research id
-- (plan 24, AUD-002). 'not enrolled' otherwise (the device then stops recording). p_batch is the receipt: the same batch again
-- changes nothing; one batch per participant per 5 s ('rate limited': the device keeps it). An
-- event already stored (its event_id) is skipped, so a resend never doubles an answer. Each
-- event is checked: its ids, the card id, the context, a boolean `correct`, a device time no
-- more than 90 days old or a day ahead; only the fields the game is known to record are kept
-- (src/research.js answerEvent; since 2026-11-14 the schedule's FSRS stability, difficulty and
-- retrievability in place of SM-2's ease and interval_ms), and an event may not exceed 2000 characters. Returns
-- { status: 'ok', stored } (how many were new). Errors raise ('bad ...': the device drops the batch).
drop function if exists public.submit_research_events(text, text, jsonb);
create or replace function public.submit_research_events(p_player_id text, p_batch text, p_events jsonb, p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_part public.research_participants%rowtype;
  v_keys text[] := array['event_id', 'session_id', 'run_id', 'card_id', 'card_hash', 'audited', 'deck', 'context', 'seq', 'step', 'level',
                         'order', 'chosen', 'correct', 'rt_ms', 'interrupted', 'grade', 'reason',
                         'stability', 'difficulty', 'retrievability', 'reps', 'lapses', 'seen', 'since_ms',
                         'client_at', 'app', 'tuning', 'locale', 'field', 'input', 'consent', 'phase'];
  e jsonb;
  v_at timestamptz;
  v_rows int;
  v_stored int := 0;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  if p_batch is null or p_batch !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad batch';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) not between 1 and 200 then
    raise exception 'bad events';
  end if;
  for e in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(e) <> 'object' or length(e::text) > 2000 then
      raise exception 'bad events: shape';
    end if;
    if coalesce(e ->> 'event_id', '') !~ '^[A-Za-z0-9_-]{22}$' then
      raise exception 'bad events: event id';
    end if;
    if coalesce(e ->> 'card_id', '') !~ '^[A-Z]{2}-[0-9]{2}$' then
      raise exception 'bad events: card';
    end if;
    if coalesce(e ->> 'context', '') not in ('break', 'revive', 'bonus') or jsonb_typeof(e -> 'correct') is distinct from 'boolean' then
      raise exception 'bad events: answer';
    end if;
    if jsonb_typeof(e -> 'client_at') is distinct from 'number' or (e ->> 'client_at') !~ '^[0-9]{12,14}$' then
      raise exception 'bad events: time';
    end if;
    v_at := to_timestamp((e ->> 'client_at')::bigint / 1000.0);
    if v_at < now() - interval '90 days' or v_at > now() + interval '1 day' then
      raise exception 'bad events: time';
    end if;
    if (e ? 'rt_ms' and jsonb_typeof(e -> 'rt_ms') not in ('number', 'null'))
       or (e ? 'seen' and jsonb_typeof(e -> 'seen') <> 'number')
       or (e ? 'since_ms' and jsonb_typeof(e -> 'since_ms') not in ('number', 'null')) then
      raise exception 'bad events: numbers';
    end if;
  end loop;

  v_id := public.resolve_player(p_player_id);
  perform pg_advisory_xact_lock(hashtext('research:' || v_id));
  select * into v_part from public.research_participants where player_id = v_id;
  if not found or p_since is distinct from v_part.joined_at then
    raise exception 'not enrolled';
  end if;
  if v_part.last_batch = p_batch then
    return jsonb_build_object('status', 'ok', 'stored', 0);
  end if;
  if v_part.updated_at > now() - interval '5 seconds' then
    raise exception 'rate limited';
  end if;
  for e in select value from jsonb_array_elements(p_events) loop
    insert into public.research_responses (event_id, research_id, phase, card_id, context, correct, rt_ms, seen, since_ms, client_at, data)
    values (
      e ->> 'event_id', v_part.research_id, v_part.phase, e ->> 'card_id', e ->> 'context', (e ->> 'correct')::boolean,
      case when jsonb_typeof(e -> 'rt_ms') = 'number' then least(greatest(round((e ->> 'rt_ms')::numeric), 0), 3600000)::int end,
      case when jsonb_typeof(e -> 'seen') = 'number' then least(greatest(round((e ->> 'seen')::numeric), 0), 1000000)::int else 0 end,
      case when jsonb_typeof(e -> 'since_ms') = 'number' then least(greatest(round((e ->> 'since_ms')::numeric), 0), 9007199254740991)::bigint end,
      to_timestamp((e ->> 'client_at')::bigint / 1000.0),
      (select coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb) from jsonb_each(e) f where f.key = any(v_keys)))
    on conflict (event_id) do nothing;
    get diagnostics v_rows = row_count;
    v_stored := v_stored + v_rows;
  end loop;
  update public.research_participants set last_batch = p_batch, updated_at = now() where player_id = v_id;
  return jsonb_build_object('status', 'ok', 'stored', v_stored);
end;
$$;

-- delete_research: withdraw. The participant and every answer under their research id are
-- deleted at once; true when there was a participant. (Backups keep them until they roll off.)
create or replace function public.delete_research(p_player_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_rid text;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  v_id := public.resolve_player(p_player_id);
  perform pg_advisory_xact_lock(hashtext('research:' || v_id));
  select research_id into v_rid from public.research_participants where player_id = v_id;
  if v_rid is null then
    return false;
  end if;
  delete from public.research_responses where research_id = v_rid;
  delete from public.research_participants where player_id = v_id;
  return true;
end;
$$;

-- Maintenance only (no role may call these). admin_set_invite: set the pilot's invite code
-- (only its SHA-256 is stored), which stops the old one; null closes enrolment. The code is 16 to
-- 200 of A-Z a-z 0-9 - . _ ~ +, so it works typed and in an invite link (AUD-041); its length is what
-- keeps guessers out. Returns 'set' or 'closed'.
--   select public.admin_set_invite('a-long-code-you-made-up');
create or replace function public.admin_set_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null then
    update public.education_settings set invite_hash = null;
    return 'closed';
  end if;
  -- Only a code the game can send, typed or in an invite link (AUD-041): no space at an end (the game
  -- trims), nothing a link cannot carry raw (& # % or a space), ASCII only (the game counts UTF-16 units).
  if p_code !~ '^[A-Za-z0-9._~+-]{16,200}$' then
    raise exception 'bad code: 16 to 200 of A-Z a-z 0-9 - . _ ~ +';
  end if;
  update public.education_settings set invite_hash = encode(sha256(convert_to(p_code, 'UTF8')), 'hex');
  return 'set';
end;
$$;
revoke execute on function public.admin_set_invite(text) from public, anon, authenticated;

-- admin_purge_phase: delete every participant and answer of a phase (the pilot's before the
-- beta, the beta's before the study). Returns how many answers went.
--   select public.admin_purge_phase('pilot');
create or replace function public.admin_purge_phase(p_phase text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  delete from public.research_responses where phase = p_phase;
  get diagnostics v_rows = row_count;
  delete from public.research_participants where phase = p_phase;
  return v_rows;
end;
$$;
revoke execute on function public.admin_purge_phase(text) from public, anon, authenticated;

-- The owner's views of the answers (readable by no other role; security_invoker, so even a
-- stray grant would not open the tables behind them). A first sight is an answer to a card the
-- device had never shown before (seen = 0): it measures what the player already knew.
--   research_summary         per phase: participants, answers, the first and last received
--   research_by_card         per phase and card: answers and right ones, at first sight and later
--   research_by_participant  per research id: answers, right ones, cards, the first and last answer
--   research_retention       per phase and time since the card was last seen: answers and right ones
create or replace view public.research_summary with (security_invoker = true) as
  select p.phase,
         count(distinct p.research_id)::int as participants,
         count(r.event_id)::int as answers,
         min(r.received_at) as first_received,
         max(r.received_at) as last_received
  from public.research_participants p
  left join public.research_responses r on r.research_id = p.research_id
  group by p.phase;

create or replace view public.research_by_card with (security_invoker = true) as
  select phase, card_id,
         count(*)::int as answers,
         count(*) filter (where correct)::int as correct,
         count(*) filter (where seen = 0)::int as first_answers,
         count(*) filter (where seen = 0 and correct)::int as first_correct,
         count(*) filter (where seen > 0)::int as later_answers,
         count(*) filter (where seen > 0 and correct)::int as later_correct
  from public.research_responses
  group by phase, card_id;

create or replace view public.research_by_participant with (security_invoker = true) as
  select research_id, phase,
         count(*)::int as answers,
         count(*) filter (where correct)::int as correct,
         count(distinct card_id)::int as cards,
         min(client_at) as first_answer,
         max(client_at) as last_answer
  from public.research_responses
  group by research_id, phase;

create or replace view public.research_retention with (security_invoker = true) as
  select phase,
         case when since_ms is null then '0 first sight'
              when since_ms < 600000 then '1 under 10 min'
              when since_ms < 86400000 then '2 under 1 day'
              when since_ms < 604800000 then '3 under 1 week'
              else '4 1 week or more' end as since_last_seen,
         count(*)::int as answers,
         count(*) filter (where correct)::int as correct
  from public.research_responses
  group by 1, 2;

revoke all on public.research_summary, public.research_by_card, public.research_by_participant, public.research_retention from public, anon, authenticated;

-- A player's profile (plan 08), for anyone: by id (the player's own, resolved)
-- or by a name as a board shows it (player_by_name); a valid id wins. Never an id
-- in the answer. {found: false} for a name nobody shows under; otherwise
--   name         the board's name for them (null with no rows anywhere)
--   single       games, bestScore (their best score-board row, either kind),
--                wins, maxLevel (the counter or their best board row's
--                level, whichever is higher), avgLevel, avgScore (null at 0 games)
--   daily        dumps played; gold / silver / bronze = days they ranked 1st / 2nd
--                / 3rd, ranked as daily_board ranks (score, then earlier post)
--   tournament   events and medals (tournament_stats), and rival: the opponent
--                they lost to most (then met most, then by name) in
--                tournament_matchups, self-races left by merges ignored; or null
--   counters     their lifetime counters as stored
--   achievements [{ id, at: 'YYYY-MM-DD' (UTC) }], oldest first
--   tags         player_tags: 'dev' / 'og' / 'new'
--   education    null unless the player shares it (education_public): { grade (their average
--                in percent to one decimal; null before a graded run), runs, badges
--                { id: 'YYYY-MM-DD' } }
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
    if public.player_hidden(v_id) then
      v_id := null; -- hidden by the owner (plan 30): their own device asks by id
    end if;
  end if;
  if v_id is null then
    return jsonb_build_object('found', false);
  end if;

  v_name := coalesce(
    (select s.name from public.scores s where s.player_id = v_id order by s.updated_at desc limit 1),
    (select t.name from public.tournament_stats t where t.player_id = v_id),
    (select d.name from public.daily_scores d where d.player_id = v_id order by d.submitted_at desc limit 1),
    (select e.name from public.education_public e where e.player_id = v_id));
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
                where o.day = d.day and (o.score > d.score or (o.score = d.score and o.submitted_at < d.submitted_at))
                  and not public.player_hidden(o.player_id)) as rk
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
    where not public.player_hidden(x.opp) -- a hidden player is nobody's rival (plan 30)
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
      'bestScore', coalesce(case when p_player_id ~ '^[A-Za-z0-9_-]{22}$' -- their own device: their own best (plan 30)
                                 then (select max(o.score) from public.own_best(v_id) o)
                                 else (select max(s.score) from public.scores s where s.player_id = v_id) end, 0),
      'wins', coalesce((v_c->>'wins')::bigint, 0),
      'maxLevel', greatest(coalesce((v_c->>'maxLevel')::int, 0),
                           coalesce(case when p_player_id ~ '^[A-Za-z0-9_-]{22}$'
                                         then (select max(o.level) from public.own_best(v_id) o)
                                         else (select max(s.level) from public.scores s where s.player_id = v_id) end, 0)),
      'avgLevel', case when v_games > 0 then round(coalesce((v_c->>'sumLevel')::numeric, 0) / v_games, 1) end,
      'avgScore', case when v_games > 0 then round(coalesce((v_c->>'sumScore')::numeric, 0) / v_games, 1) end),
    'daily', v_daily,
    'tournament', coalesce(v_tour, jsonb_build_object('events', 0, 'gold', 0, 'silver', 0, 'bronze', 0))
                  || jsonb_build_object('rival', v_rival),
    'counters', v_c,
    'achievements', v_ach,
    'tags', to_jsonb(public.player_tags(v_id)),
    'education', (select jsonb_build_object(
                    'grade', case when e.runs > 0 then round(e.grade_sum::numeric / e.runs / 100, 1) end,
                    'runs', e.runs,
                    'badges', e.badges)
                  from public.education_public e where e.player_id = v_id));
end;
$$;

-- The ids of the game's badges: ACHIEVEMENTS in src/achievements.js, in its order
-- (tests/achievements.test.js keeps the two the same; education badges are never claimed).
-- A new badge adds its id here, and this file is applied before the client that awards it
-- is pushed. Internal.
create or replace function public.achievement_catalog()
returns text[]
language sql
immutable
as $$
  select array[
    'score_10', 'score_100', 'score_250', 'score_500', 'score_1000', 'level_2', 'level_3', 'level_4',
    'level_5', 'level_6', 'level_7', 'win_game', 'toilet_win', 'games_1000', 'deaths_1000', 'fart_100',
    'super_fart_25', 'fiber_1000', 'probiotic_1000', 'postbiotic_100', 'bacteria_1000', 'bean_100',
    'mystery_100', 'coin_1000', 'sky_diver', 'close_shave', 'ibs', 'constipated', 'icarus',
    'four_of_a_kind', 'lets_go_gambling'
  ]::text[];
$$;
revoke execute on function public.achievement_catalog() from public, anon, authenticated;

-- Claim achievements the game says this player earned (plan 08). Returns
-- { stored: [...], closed: [...] }: stored = kept (or already held); closed = a
-- time-boxed quest (achievement_defs) claimed outside its window plus two days'
-- grace, which the game then forgets. Any other id in achievement_catalog() is an
-- always-available badge and is kept. An id that is neither (plan 30) is left out
-- of both lists and changes nothing. 1–50 ids a call, 300 per player. Errors
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
  perform public.touch_player(v_id);
  perform pg_advisory_xact_lock(hashtext('achievements:' || v_id));
  foreach x in array array(select distinct u from unnest(p_ids) u order by u) loop
    select ad.starts, ad.ends into d from public.achievement_defs ad where ad.id = x;
    if found and (v_today < d.starts or v_today > d.ends + 2) then
      v_closed := v_closed || x;
      continue;
    end if;
    if not found and not (x = any(public.achievement_catalog())) then
      continue; -- not a badge the game has: neither stored nor closed (closed would delete it on the device)
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


-- The keys a run row's `data` may hold (src/runStats.js RUN_DATA_KEYS, in its order; tests keep the
-- two the same). Each value is a number, a boolean, or a list of at most 16 numbers. Internal.
create or replace function public.run_data_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'frame_ms', 'distance', 'pipes', 'falls', 'close_calls', 'deaths',
    'lv_pipes', 'lv_falls', 'lv_close', 'lv_deaths', 'lv_ms',
    'lip_n', 'lip_mean', 'lip_sd', 'lip_hist', 'gap_n', 'gap_med', 'gap_sd', 'gap_min', 'gap_hist',
    'fart_pipes', 'skip_pipes',
    'press_touch', 'press_mouse', 'press_key', 'press_pad', 'downs', 'ups', 'hold_mean', 'hold_sd', 'hold_min', 'taps',
    'webdriver', 'touch',
    'flaps', 'flaps_physics', 'flaps_internal', 'flaps_pressed', 'flaps_trusted', 'flaps_fresh',
    'break_ms', 'shop_opens', 'shop_buys', 'fps_mean', 'fps_sd', 'long_frames', 'field_w', 'pauses', 'hidden_ms'
  ]::text[];
$$;
revoke execute on function public.run_data_keys() from public, anon, authenticated;

-- Why a run row cannot be stored, or null when it can. p_sent is the device's clock when the batch
-- was sent (epoch ms). Internal.
create or replace function public.run_row_problem(e jsonb, p_sent bigint)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_mode text;
  v_start bigint;
  v_end bigint;
  f record;
  x jsonb;
  v_num text;
begin
  if jsonb_typeof(e) is distinct from 'object' then
    return 'shape';
  end if;
  if length(e::text) > 4096 then
    return 'size';
  end if;
  if exists (select 1 from jsonb_object_keys(e) k
             where k <> all(array['run_id', 'session', 'mode', 'day', 'stub', 'score', 'level', 'toilet', 'won',
                                  'started_at', 'ended_at', 'length_ms', 'paused_ms', 'version', 'data'])) then
    return 'key';
  end if;
  if coalesce(e ->> 'run_id', '') !~ '^[A-Za-z0-9_-]{22}$' or coalesce(e ->> 'session', '') !~ '^[A-Za-z0-9_-]{8,22}$' then
    return 'id';
  end if;
  if coalesce(e ->> 'version', '') !~ '^[0-9A-Za-z.+-]{1,24}$' then
    return 'version';
  end if;
  v_mode := e ->> 'mode';
  if v_mode is null or v_mode not in ('single', 'daily') then
    return 'mode';
  end if;
  if (v_mode = 'daily') <> (coalesce(e ->> 'day', '') ~ '^\d{4}-\d{2}-\d{2}$') then
    return 'day';
  end if;
  if v_mode = 'daily' then
    perform (e ->> 'day')::date; -- a real date (the guard below answers 'invalid' otherwise)
  end if;
  if e ? 'stub' and jsonb_typeof(e -> 'stub') <> 'boolean' then
    return 'stub';
  end if;
  if coalesce((e ->> 'stub')::boolean, false) and v_mode <> 'daily' then
    return 'stub';
  end if;
  if jsonb_typeof(e -> 'score') is distinct from 'number' or (e ->> 'score') !~ '^\d{1,5}$' then
    return 'score';
  end if;
  if (e ->> 'score')::int > (case when v_mode = 'daily' then 10000 else 1000 end) then
    return 'score';
  end if;
  if jsonb_typeof(e -> 'level') is distinct from 'number' or (e ->> 'level') !~ '^[1-7]$' then
    return 'level';
  end if;
  if (e ? 'toilet' and jsonb_typeof(e -> 'toilet') <> 'boolean') or (e ? 'won' and jsonb_typeof(e -> 'won') <> 'boolean') then
    return 'flag';
  end if;
  -- Times: whole epoch ms, start <= end, from the 90 days before the batch was sent, never after it.
  if e ? 'started_at' or e ? 'ended_at' then
    if jsonb_typeof(e -> 'started_at') is distinct from 'number' or (e ->> 'started_at') !~ '^\d{12,14}$' then
      return 'time';
    end if;
    if jsonb_typeof(e -> 'ended_at') is distinct from 'number' or (e ->> 'ended_at') !~ '^\d{12,14}$' then
      return 'time';
    end if;
    v_start := (e ->> 'started_at')::bigint;
    v_end := (e ->> 'ended_at')::bigint;
    if v_start > v_end or v_end > p_sent + 60000 or v_start < p_sent - 90::bigint * 86400000 then
      return 'time';
    end if;
  end if;
  foreach v_num in array array['length_ms', 'paused_ms'] loop
    if e ? v_num then
      if jsonb_typeof(e -> v_num) <> 'number' or (e ->> v_num) !~ '^\d{1,8}$' then
        return 'length';
      end if;
      if (e ->> v_num)::bigint > 86400000 then
        return 'length';
      end if;
    end if;
  end loop;
  if not coalesce((e ->> 'stub')::boolean, false) and not (e ? 'started_at' and e ? 'length_ms') then
    return 'time';
  end if;
  if e ? 'data' then
    if jsonb_typeof(e -> 'data') <> 'object' then
      return 'data';
    end if;
    for f in select key, value from jsonb_each(e -> 'data') loop
      if f.key <> all(public.run_data_keys()) then
        return 'data key';
      end if;
      if jsonb_typeof(f.value) = 'boolean' then
        continue;
      elsif jsonb_typeof(f.value) = 'number' then
        if abs((f.value #>> '{}')::numeric) > 1000000000 then
          return 'data number';
        end if;
      elsif jsonb_typeof(f.value) = 'array' then
        if jsonb_array_length(f.value) > 16 then
          return 'data list';
        end if;
        for x in select value from jsonb_array_elements(f.value) loop
          if jsonb_typeof(x) <> 'number' or abs((x #>> '{}')::numeric) > 1000000000 then
            return 'data list';
          end if;
        end loop;
      else
        return 'data value';
      end if;
    end loop;
  end if;
  return null;
exception when others then
  return 'invalid'; -- never let one odd row fail the batch
end;
$$;
revoke execute on function public.run_row_problem(jsonb, bigint) from public, anon, authenticated;

-- submit_runs: up to 20 run summaries (run_row_problem says what a row may hold). p_sent_at is the
-- device's clock as it sends (epoch ms). A row that cannot be stored is left out and counted in
-- run_rejects; a row already stored (player and run id) is skipped. One batch per player per 5 s
-- ('rate limited': the device keeps them). Errors raise only for the batch itself ('bad ...').
-- The answer never depends on the rows. Each call also deletes this player's rows older than 90
-- days, except held rows and a hidden player's.
create or replace function public.submit_runs(p_player_id text, p_sent_at bigint, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_offset bigint;
  v_problem text;
  e jsonb;
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad player id';
  end if;
  if p_sent_at is null or p_sent_at < 100000000000 or p_sent_at > 99999999999999 then
    raise exception 'bad time';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 20 then
    raise exception 'bad rows';
  end if;
  v_id := public.resolve_player(p_player_id);
  perform pg_advisory_xact_lock(hashtext('runs:' || v_id));
  if exists (select 1 from public.run_log r where r.player_id = v_id and r.received_at > now() - interval '5 seconds') then
    raise exception 'rate limited';
  end if;
  v_offset := round(extract(epoch from now()) * 1000)::bigint - p_sent_at;
  for e in select value from jsonb_array_elements(p_rows) loop
    v_problem := public.run_row_problem(e, p_sent_at);
    if v_problem is not null then
      insert into public.run_rejects (reason, version, n)
      values (v_problem, coalesce(substring(e ->> 'version' from '^[0-9A-Za-z.+-]{1,24}$'), '?'), 1)
      on conflict (day, reason, version) do update set n = public.run_rejects.n + 1;
      continue;
    end if;
    insert into public.run_log (player_id, run_id, session, mode, day, stub, score, level, toilet, won,
                                started_at, ended_at, length_ms, paused_ms, clock_offset_ms, version, data)
    values (
      v_id, e ->> 'run_id', e ->> 'session', e ->> 'mode', (e ->> 'day')::date, coalesce((e ->> 'stub')::boolean, false),
      (e ->> 'score')::int, (e ->> 'level')::int, coalesce((e ->> 'toilet')::boolean, false), coalesce((e ->> 'won')::boolean, false),
      case when e ? 'started_at' then to_timestamp((e ->> 'started_at')::bigint / 1000.0) end,
      case when e ? 'ended_at' then to_timestamp((e ->> 'ended_at')::bigint / 1000.0) end,
      (e ->> 'length_ms')::int, (e ->> 'paused_ms')::int, v_offset, e ->> 'version', coalesce(e -> 'data', '{}'::jsonb))
    on conflict (player_id, run_id) do nothing;
  end loop;
  if not public.player_hidden(v_id) then
    delete from public.run_log r where r.player_id = v_id and r.received_at < now() - interval '90 days' and not r.held;
  end if;
end;
$$;

-- play_days (plan 34, 34.13): the days a player played, so a device can fill in their day streaks
-- (src/streak.js mergeDayStreak), from any device with their save code. Daily Dump days are course
-- days (UTC), from daily_scores (since 2026-11-10, kept) and the run log's Daily rows (stubs too: the
-- device counts a Daily once claimed). Singleplayer days are the local days, in the time zone p_tz
-- (an IANA name the device sends; anything unknown reads as UTC), on which a one-player run ended
-- by the device's clock (run_log.ended_at, kept 90 days; the log starts with 0.19.1, 2026-11-15).
-- The newest 400 of each, oldest first, as 'YYYY-MM-DD'. Days only: no score, time or name. By the
-- player's own secret id (resolved), never by name; null for a malformed id. Reads, never writes.
create or replace function public.play_days(p_player_id text, p_tz text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id text;
  v_tz text := 'UTC';
begin
  if p_player_id is null or p_player_id !~ '^[A-Za-z0-9_-]{22}$' then
    return null;
  end if;
  v_id := public.resolve_player(p_player_id);
  if p_tz is not null and length(p_tz) <= 64 and exists (select 1 from pg_timezone_names z where z.name = p_tz) then
    v_tz := p_tz;
  end if;
  return jsonb_build_object(
    'daily', coalesce((
      select jsonb_agg(to_char(x.day, 'YYYY-MM-DD') order by x.day)
      from (
        select d.day from public.daily_scores d where d.player_id = v_id
        union
        select r.day from public.run_log r where r.player_id = v_id and r.mode = 'daily' and r.day is not null
        order by 1 desc
        limit 400
      ) x), '[]'::jsonb),
    'single', coalesce((
      select jsonb_agg(to_char(y.day, 'YYYY-MM-DD') order by y.day)
      from (
        select distinct (r.ended_at at time zone v_tz)::date as day
        from public.run_log r
        where r.player_id = v_id and r.mode = 'single' and r.ended_at is not null
        order by 1 desc
        limit 400
      ) y), '[]'::jsonb));
end;
$$;

-- admin_runs: the run rows of the player a board shows under this name, newest first (owner only,
-- in the SQL editor).
create or replace function public.admin_runs(p_name text)
returns setof public.run_log
language sql
stable
security definer
set search_path = public
as $$
  select r.* from public.run_log r
  where r.player_id = public.player_by_name(p_name)
  order by r.received_at desc;
$$;
revoke execute on function public.admin_runs(text) from public, anon, authenticated;

-- Holding a run (plan 30): a moderator can hold a stored run (hold_run). A score post whose only
-- matching runs are held (or, with board_settings.require_run on, that has no run at all) does not
-- reach the board for others: it is kept in held_scores, and the post is answered and paced as a
-- post that raised nothing. The player's own views read held_scores too. A post is matched to its
-- run by content: the same player, 🚽, score and level (a Daily: the same day and score). Only a
-- post that would raise the player's row, or make their first, needs a run. Owner-only tables.

-- Owner only (SQL editor): turn require_run on or off.
create or replace function public.admin_set_require_run(p_on boolean)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.board_settings set require_run = coalesce(p_on, false) where id returning require_run;
$$;
revoke execute on function public.admin_set_require_run(boolean) from public, anon, authenticated;

-- Whether a post of this content must be held: its only matching runs are held, or it has none
-- and require_run is on. p_day null: a 🏆 post; else a Daily post (score and day only). Internal.
create or replace function public.post_must_hold(p_id text, p_toilet boolean, p_score int, p_level int, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select r.held from public.run_log r
    where r.player_id = p_id and r.score = p_score
      and case when p_day is null then r.mode = 'single' and r.toilet = coalesce(p_toilet, false) and r.level = p_level
               else r.mode = 'daily' and r.day = p_day end
  )
  select case
    when exists (select 1 from m where not m.held) then false
    when exists (select 1 from m) then true
    else coalesce((select b.require_run from public.board_settings b where b.id), false)
  end;
$$;
revoke execute on function public.post_must_hold(text, boolean, int, int, date) from public, anon, authenticated;

-- The latest unheld run behind a post of this content, or null. Internal.
create or replace function public.post_run(p_id text, p_toilet boolean, p_score int, p_level int, p_day date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.run_id from public.run_log r
  where r.player_id = p_id and r.score = p_score and not r.held
    and case when p_day is null then r.mode = 'single' and r.toilet = coalesce(p_toilet, false) and r.level = p_level
             else r.mode = 'daily' and r.day = p_day end
  order by r.received_at desc limit 1;
$$;
revoke execute on function public.post_run(text, boolean, int, int, date) from public, anon, authenticated;

-- hold_run (owner only): hold one of a player's stored runs. If the board already shows the best that
-- run set (and no other unheld run of the same content backs it), that best moves to held_scores and
-- the row goes back to the best before it (score_steps), or leaves the board when there was none; a
-- Daily row moves to held_scores. Nothing is deleted. True when the run was found and not yet held.
create or replace function public.hold_run(p_player_id text, p_run_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := public.resolve_player(p_player_id);
  r public.run_log%rowtype;
  cur public.scores%rowtype;
  prev record;
  d public.daily_scores%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('runs:' || v_id));
  update public.run_log x set held = true, held_at = now()
  where x.player_id = v_id and x.run_id = p_run_id and not x.held
  returning * into r;
  if not found then
    return false;
  end if;
  if r.mode = 'single' then
    perform pg_advisory_xact_lock(hashtext('board:scores'));
    select * into cur from public.scores s where s.player_id = v_id and s.toilet = r.toilet;
    if found and cur.score = r.score and cur.level = r.level
       and public.post_run(v_id, r.toilet, r.score, r.level, null) is null then
      insert into public.held_scores (player_id, board, toilet, name, score, level, run_id, posted_at)
      values (v_id, 'scores', r.toilet, cur.name, cur.score, cur.level, r.run_id, cur.updated_at);
      select st.score, st.level, st.at into prev from public.score_steps st
      where st.player_id = v_id and st.toilet = r.toilet and st.score < cur.score
        and (st.run_id is null or not exists (select 1 from public.run_log y where y.player_id = v_id and y.run_id = st.run_id and y.held))
      order by st.score desc, st.at desc limit 1;
      if found then
        update public.scores set score = prev.score, level = prev.level, updated_at = prev.at
        where player_id = v_id and toilet = r.toilet;
      else
        delete from public.scores where player_id = v_id and toilet = r.toilet;
      end if;
    end if;
  else
    perform pg_advisory_xact_lock(hashtext('board:daily:' || r.day::text));
    select * into d from public.daily_scores ds where ds.player_id = v_id and ds.day = r.day;
    if found and d.score = r.score and public.post_run(v_id, false, r.score, r.level, r.day) is null then
      insert into public.held_scores (player_id, board, day, name, score, level, pipes, run_id, posted_at)
      values (v_id, 'daily', d.day, d.name, d.score, d.level, d.pipes, r.run_id, d.submitted_at);
      delete from public.daily_scores where player_id = v_id and day = r.day;
    end if;
  end if;
  return true;
end;
$$;
revoke execute on function public.hold_run(text, text) from public, anon, authenticated;

-- release_run (owner only): undo hold_run. The run counts again, and every held best of that
-- player with the run's content goes onto the board through the normal rules (the higher score
-- wins; a Daily day keeps the first). True when the run was found and held.
create or replace function public.release_run(p_player_id text, p_run_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := public.resolve_player(p_player_id);
  r public.run_log%rowtype;
  h public.held_scores%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('runs:' || v_id));
  update public.run_log x set held = false, held_at = null
  where x.player_id = v_id and x.run_id = p_run_id and x.held
  returning * into r;
  if not found then
    return false;
  end if;
  for h in select * from public.held_scores hs
           where hs.player_id = v_id and hs.released_at is null and hs.score = r.score
             and case when r.mode = 'single' then hs.board = 'scores' and hs.toilet = r.toilet and hs.level = r.level
                      else hs.board = 'daily' and hs.day = r.day end loop
    if h.board = 'scores' then
      perform pg_advisory_xact_lock(hashtext('board:scores'));
      insert into public.scores (player_id, name, score, toilet, level, updated_at, hidden)
      values (v_id, coalesce((select s.name from public.scores s where s.player_id = v_id order by s.updated_at desc limit 1), h.name),
              h.score, h.toilet, h.level, h.posted_at, public.player_hidden(v_id))
      on conflict (player_id, toilet) do update
        set score      = greatest(public.scores.score, excluded.score),
            level      = case when excluded.score > public.scores.score then excluded.level else public.scores.level end,
            updated_at = case when excluded.score > public.scores.score then excluded.updated_at else public.scores.updated_at end;
      insert into public.score_steps (player_id, toilet, score, level, run_id, at) values (v_id, h.toilet, h.score, h.level, r.run_id, h.posted_at);
    else
      insert into public.daily_scores (player_id, day, name, score, level, pipes, submitted_at)
      values (v_id, h.day, h.name, h.score, h.level, coalesce(h.pipes, 0), h.posted_at)
      on conflict (player_id, day) do nothing;
    end if;
    update public.held_scores set released_at = now() where id = h.id;
  end loop;
  return true;
end;
$$;
revoke execute on function public.release_run(text, text) from public, anon, authenticated;


-- score_board: the 🏆 top list for the player with this id (their own rows at their own best,
-- plan 30), or for nobody (null: the visible rows, as the table read gives them). Names, never ids.
-- p_offset (plan 28, 5.2; default 0, so page 1's call is unchanged): the rows after the first
-- p_offset. The old two-argument signature is dropped first, so a call never finds two.
drop function if exists public.score_board(text, int);
create or replace function public.score_board(p_player_id text default null, p_limit int default 25, p_offset int default 0)
returns table (name text, score int, toilet boolean, level int)
language sql
stable
security definer
set search_path = public
as $$
  select b.name, b.score, b.toilet, b.level
  from public.board_rows(case when p_player_id ~ '^[A-Za-z0-9_-]{22}$' then public.resolve_player(p_player_id) end) b
  order by b.score desc, b.at asc
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 1000000);
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
revoke execute on function public.tournament_board(text, int, int) from public, authenticated;
grant  execute on function public.tournament_board(text, int, int) to anon;
revoke execute on function public.submit_daily_score(text, text, date, int, int, int) from public, authenticated;
grant  execute on function public.submit_daily_score(text, text, date, int, int, int) to anon;
revoke execute on function public.daily_board(text, date, int, int) from public, authenticated;
grant  execute on function public.daily_board(text, date, int, int) to anon;
revoke execute on function public.submit_counters(text, text, jsonb) from public, authenticated;
grant  execute on function public.submit_counters(text, text, jsonb) to anon;
revoke execute on function public.player_stats(text, text) from public, authenticated;
grant  execute on function public.player_stats(text, text) to anon;
revoke execute on function public.claim_achievements(text, text[]) from public, authenticated;
grant  execute on function public.claim_achievements(text, text[]) to anon;
revoke execute on function public.board_tags(text[]) from public, authenticated;
grant  execute on function public.board_tags(text[]) to anon;
revoke execute on function public.share_education(text, text, boolean, text) from public, authenticated;
grant  execute on function public.share_education(text, text, boolean, text) to anon;
revoke execute on function public.submit_education_grades(text, text, timestamptz, int, bigint, jsonb) from public, authenticated;
grant  execute on function public.submit_education_grades(text, text, timestamptz, int, bigint, jsonb) to anon;
revoke execute on function public.rename_education(text, text) from public, authenticated;
grant  execute on function public.rename_education(text, text) to anon;
revoke execute on function public.unshare_education(text) from public, authenticated;
grant  execute on function public.unshare_education(text) to anon;
revoke execute on function public.education_board(text, int, int) from public, authenticated;
grant  execute on function public.education_board(text, int, int) to anon;
revoke execute on function public.enrol_research(text, text, boolean, text) from public, authenticated;
grant  execute on function public.enrol_research(text, text, boolean, text) to anon;
revoke execute on function public.submit_research_events(text, text, jsonb, timestamptz) from public, authenticated;
grant  execute on function public.submit_research_events(text, text, jsonb, timestamptz) to anon;
revoke execute on function public.delete_research(text) from public, authenticated;
grant  execute on function public.delete_research(text) to anon;
revoke execute on function public.submit_runs(text, bigint, jsonb) from public, authenticated;
grant  execute on function public.submit_runs(text, bigint, jsonb) to anon;
revoke execute on function public.play_days(text, text) from public, authenticated;
grant  execute on function public.play_days(text, text) to anon;
revoke execute on function public.score_board(text, int, int) from public, authenticated;
grant  execute on function public.score_board(text, int, int) to anon;

-- Which version of this file the database last ran: a short SHA-256 of the file with the value
-- below blanked (tools/schema_check.mjs). `npm run schema:stamp` rewrites it after an edit, and
-- tests/schema.test.js fails until it does. It is the last thing this file makes, so the live
-- database answers the new value only once a whole paste has run. Anyone may ask: the file is
-- public, so the value says nothing new. `npm run schema:check` and `npm run push` read it.
create or replace function public.schema_version()
returns text
language sql
immutable
as $$
  select '9c5aa98fe90774c9'::text; -- schema stamp
$$;
revoke execute on function public.schema_version() from public, authenticated;
grant  execute on function public.schema_version() to anon;

-- Tell PostgREST about the new functions right away.
notify pgrst, 'reload schema';
