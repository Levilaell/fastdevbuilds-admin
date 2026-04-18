-- Adds opportunity_score + opportunity_reasons for the prospect bot's new scoring.
-- opportunity_score (0-5): review_count + rating based commercial attractiveness.
-- opportunity_reasons (text): comma-separated reasons (consistent with score_reasons).
-- Applied manually in production on 2026-04-17.

ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS opportunity_score smallint,
  ADD COLUMN IF NOT EXISTS opportunity_reasons text;
