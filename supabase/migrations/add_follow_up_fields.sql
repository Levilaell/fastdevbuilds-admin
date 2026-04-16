-- Follow-up automation fields
-- Safe to re-run: uses IF NOT EXISTS

ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_count integer NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_paused boolean NOT NULL DEFAULT false;

-- Partial index for the worker query
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_due
  ON leads (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL
    AND follow_up_paused = false
    AND follow_up_count < 2;
