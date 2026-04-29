-- Experiment tracking: stamp every lead with the campaign that created it,
-- the bot_run that batched it, the copy variant used, and an owner-probability
-- heuristic. See GTM_LAB_ARCHITECTURE.md for the rationale.
--
-- All DDL here is idempotent (IF NOT EXISTS). Safe to re-run.
-- Apply manually via Supabase SQL Editor (no ORM migration tool in this repo).
--
-- Backfill for pre-instrumentation rows is in
-- supabase/migrations/20260428_experiment_tracking_backfill.sql — kept
-- separate so a re-run of this DDL doesn't redo the heuristic UPDATE.

-- ─── 1. Stamp columns on leads ──────────────────────────────────────────────
--
-- campaign_code: the `code` from lib/bot-config.ts COUNTRIES that produced
--   this lead. Examples: 'BR', 'BR-WA-PREVIEW', 'US-WA'. Stamped by the
--   prospect-bot at upsert time. NULL on pre-instrumentation rows (covered
--   by the backfill migration).
--
-- outreach_variant: optional A/B copy version stamp. NULL = default variant.
--   Set at dispatch time (not at collection) so the same lead can be dispatched
--   under different variants if the campaign re-tests it later — though in
--   practice each lead gets one variant.
--
-- bot_run_id: which bot_runs row created this lead. Optional FK so old rows
--   stay valid. Race rule: ON CONFLICT (place_id) DO UPDATE SET bot_run_id =
--   COALESCE(leads.bot_run_id, EXCLUDED.bot_run_id) — first run that touched
--   the lead "owns" the attribution; later runs don't overwrite.
--
-- owner_probability: 0-100 heuristic for "this WhatsApp number reaches the
--   decision-maker" (vs receptionist/bot). Computed in qualify step from
--   business_name regex + address regex + niche×reviews intersection. See
--   TOP_OF_FUNNEL_AUDIT.md §7. NULL until populated by bot-server.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS campaign_code TEXT,
  ADD COLUMN IF NOT EXISTS outreach_variant TEXT,
  ADD COLUMN IF NOT EXISTS bot_run_id UUID REFERENCES bot_runs(id),
  ADD COLUMN IF NOT EXISTS owner_probability SMALLINT;

COMMENT ON COLUMN leads.campaign_code IS
  'Campaign code from lib/bot-config.ts (e.g., BR, BR-WA-PREVIEW). Stamped by prospect-bot on insert. Drives experiment segmentation in metrics.';

COMMENT ON COLUMN leads.outreach_variant IS
  'Optional A/B copy version stamp (e.g., V1, V2-roi-framing). Stamped at dispatch time. NULL = default variant.';

COMMENT ON COLUMN leads.bot_run_id IS
  'Which bot_runs row created this lead. NULL = pre-instrumentation or manual insert. First-write wins via COALESCE in upsert.';

COMMENT ON COLUMN leads.owner_probability IS
  'Heuristic 0-100 score for owner reachability. Computed in prospect-bot qualify step. See TOP_OF_FUNNEL_AUDIT.md §7. Used as predicate in HOT lead filter.';

-- ─── 2. Stamp column on bot_runs ────────────────────────────────────────────
--
-- bot_runs lost niche/city/lang in 2026-04-18 (simplify_bot_runs migration).
-- Without campaign_code, runs can't be filtered to a specific experiment
-- after the fact. Adding a single column restores that traceability without
-- reintroducing the columns we dropped on purpose.

ALTER TABLE bot_runs
  ADD COLUMN IF NOT EXISTS campaign_code TEXT;

COMMENT ON COLUMN bot_runs.campaign_code IS
  'The campaign (params.market in /api/bot/run-auto) this run was launched under. Lets us aggregate by experiment in /metrics and filter run history by campaign.';

-- ─── 3. Indexes ─────────────────────────────────────────────────────────────
--
-- Partial indexes to skip the dominant NULL case on legacy rows. As campaign
-- coverage grows, the partials stay small and selective.

CREATE INDEX IF NOT EXISTS idx_leads_campaign
  ON leads (campaign_code, outreach_sent_at DESC)
  WHERE campaign_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_bot_run
  ON leads (bot_run_id)
  WHERE bot_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bot_runs_campaign
  ON bot_runs (campaign_code, started_at DESC)
  WHERE campaign_code IS NOT NULL;
