-- Simplify bot_runs table: drop config columns that were never read.
-- Operator confirmed /bot UI was used only to execute, never to browse history.
-- fillFromRun + showRunLog features removed from UI — the dropped columns
-- (niche, city, limit_count, min_score, lang, export_target, dry_run, send,
-- duration_seconds) had no other readers.
--
-- Remaining columns: id, status, collected, qualified, sent, started_at,
-- finished_at, server_run_id — enough for run-status polling and basic
-- history (timeAgo + status badge).
--
-- Applied manually in production on 2026-04-18.

ALTER TABLE bot_runs 
  DROP COLUMN IF EXISTS niche,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS limit_count,
  DROP COLUMN IF EXISTS min_score,
  DROP COLUMN IF EXISTS lang,
  DROP COLUMN IF EXISTS export_target,
  DROP COLUMN IF EXISTS dry_run,
  DROP COLUMN IF EXISTS send,
  DROP COLUMN IF EXISTS duration_seconds;
