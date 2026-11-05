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
-- A player has up to two rows: their best on the toilet and their best off it
-- (primary key player_id + toilet, since 2026-11-04).
-- and nothing else: no INSERT / UPDATE / DELETE on the table.
--
-- Maintenance (SQL editor):
--   remove a cheater or a ghost row:
--     delete from public.scores where name = 'somebody';
--   raise the score cap (also raise it inside submit_score below and
--   LEADERBOARD.maxScore in src/config.js):
--     alter table public.scores drop constraint scores_score_check;
--     alter table public.scores add constraint scores_score_check check (score between 0 and 1000);
--   wipe the board:
--     truncate public.scores;

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

create index if not exists scores_board on public.scores (score desc, updated_at asc);

alter table public.scores enable row level security;

drop policy if exists anon_read on public.scores;
create policy anon_read on public.scores for select to anon using (true);

grant usage on schema public to anon;
revoke all on public.scores from anon, authenticated;
grant select (name, score, toilet, level, updated_at) on public.scores to anon;

-- Upsert one player's best for one toilet state (p_toilet picks the row). Raises
-- (HTTP 400 through PostgREST) on bad input or when that row was written less
-- than 5 s ago, so the client never records a skipped write as confirmed. Name
-- always overwrites; score keeps the max; the level follows the score only when
-- the new score is higher. p_toilet / p_level default so older clients still post.
drop function if exists public.submit_score(text, text, int, boolean);
create or replace function public.submit_score(p_player_id text, p_name text, p_score int, p_toilet boolean default false, p_level int default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  last_write timestamptz;
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

  select updated_at into last_write from public.scores where player_id = p_player_id and toilet = coalesce(p_toilet, false);
  if last_write is not null and last_write > now() - interval '5 seconds' then
    raise exception 'rate limited';
  end if;

  insert into public.scores (player_id, name, score, toilet, level, updated_at)
  values (p_player_id, p_name, p_score, coalesce(p_toilet, false), p_level, now())
  on conflict (player_id, toilet) do update
    set name       = excluded.name,
        score      = greatest(public.scores.score, excluded.score),
        level      = case when excluded.score > public.scores.score then excluded.level else public.scores.level end,
        updated_at = now();
end;
$$;

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
  where s.player_id = p_player_id and s.toilet = coalesce(p_toilet, false);
$$;

revoke execute on function public.submit_score(text, text, int, boolean, int) from public, authenticated;
grant  execute on function public.submit_score(text, text, int, boolean, int) to anon;
revoke execute on function public.player_rank(text, boolean) from public, authenticated;
grant  execute on function public.player_rank(text, boolean) to anon;

-- Tell PostgREST about the new functions right away.
notify pgrst, 'reload schema';
