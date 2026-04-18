-- Adds opportunity_score columns used by the prospect bot's new scoring logic.
-- opportunity_score (0-5): review_count + rating based commercial attractiveness.
-- Bot sorts qualified leads by opportunity_score DESC, then pain_score DESC.
-- Applied manually in production on 2026-04-17; versioning here for completeness.

ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS opportunity_score smallint,
  ADD COLUMN IF NOT EXISTS opportunity_reasons text[];
