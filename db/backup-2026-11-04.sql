-- Leaderboard backup, taken before the "two rows per player" change (2026-11-04).
--
-- Run this in the Supabase SQL editor BEFORE running the updated db/schema.sql.
-- It copies every row (including player ids) into a private table that the
-- game's publishable key cannot read, then shows how many rows were copied.
-- Safe to re-run: it never overwrites an existing backup.

create table if not exists public.scores_backup_20261104 as select * from public.scores;
revoke all on public.scores_backup_20261104 from anon, authenticated;

select count(*) as rows_backed_up from public.scores_backup_20261104;

-- Restore (only if something went wrong; puts the board back exactly as it was):
--   alter table public.scores drop constraint if exists scores_pkey;
--   truncate public.scores;
--   insert into public.scores select * from public.scores_backup_20261104;
--   alter table public.scores add primary key (player_id);
--   -- then re-run the db/schema.sql from commit b41fb14 (git show b41fb14:db/schema.sql).
--
-- Drop the backup once the new board has been checked:
--   drop table public.scores_backup_20261104;
