-- Drop follow-up automation columns after removing the feature.
-- next_follow_up_at, follow_up_count, follow_up_paused were written by
-- now-deleted worker; no code path reads them anymore.
-- Applied manually on 2026-04-18; versioning here for completeness.

ALTER TABLE leads 
  DROP COLUMN IF EXISTS next_follow_up_at,
  DROP COLUMN IF EXISTS follow_up_count,
  DROP COLUMN IF EXISTS follow_up_paused;

DROP INDEX IF EXISTS idx_leads_follow_up_due;
