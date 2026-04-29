-- Heuristic backfill of campaign_code on pre-instrumentation leads.
-- Apply ONCE, after 20260428_experiment_tracking.sql.
--
-- Strategy: infer campaign from observable fields (country, channel, niche,
-- outreach_sent_at). Not perfect — borderline cases (e.g., a BR estética lead
-- collected pre-Phase-1 but reused for BR-WA-PREVIEW) might be misattributed.
-- Good enough to enable retroactive segmentation in /metrics; future leads
-- get the canonical stamp from the bot-server.
--
-- Order matters: most-specific predicates first. ON CONFLICT logic isn't
-- needed because we only set when campaign_code IS NULL — re-running is
-- idempotent.

-- ─── BR-WA-PREVIEW (Fase 1: clínicas estética + 3 cidades + ≥ 2026-04-28) ───
-- The Phase 1 cohort is the most identifiable: niche fixed to estética, GEO
-- restricted, outreach_sent_at on/after launch day. Other estética leads
-- collected earlier under the legacy BR campaign keep campaign_code='BR'.
UPDATE leads
SET campaign_code = 'BR-WA-PREVIEW'
WHERE campaign_code IS NULL
  AND country = 'BR'
  AND outreach_channel = 'whatsapp'
  AND niche = 'clínicas de estética'
  AND outreach_sent_at >= '2026-04-28';

-- ─── US-WA: WhatsApp campaign in the US (preview-first solo-operator niches)
UPDATE leads
SET campaign_code = 'US-WA'
WHERE campaign_code IS NULL
  AND country = 'US'
  AND outreach_channel = 'whatsapp';

-- ─── US-EM: cold email US (anything country=US that wasn't whatsapp)
UPDATE leads
SET campaign_code = 'US-EM'
WHERE campaign_code IS NULL
  AND country = 'US'
  AND outreach_channel = 'email';

-- ─── US-SMS (currently inactive — kept for symmetry if any rows exist)
UPDATE leads
SET campaign_code = 'US-SMS'
WHERE campaign_code IS NULL
  AND country = 'US'
  AND outreach_channel = 'sms';

-- ─── BR legacy: everything else BR + whatsapp falls back here.
-- This is the dominant pre-Fase-1 cohort (~535 leads).
UPDATE leads
SET campaign_code = 'BR'
WHERE campaign_code IS NULL
  AND country = 'BR'
  AND outreach_channel = 'whatsapp';

-- ─── Sanity: anything still NULL after the rules above gets flagged as
-- '_legacy_unknown' so /metrics can still segment without losing rows.
-- Drop or rename later if a pattern emerges.
UPDATE leads
SET campaign_code = '_legacy_unknown'
WHERE campaign_code IS NULL
  AND outreach_sent = true;

-- ─── bot_runs backfill: if any historical run has NULL campaign_code, mark
-- it 'unknown' so /bot history page doesn't show blanks. New runs get
-- params.market stamped at insert time (see app/api/bot/run-auto/route.ts).
UPDATE bot_runs
SET campaign_code = 'unknown'
WHERE campaign_code IS NULL;

-- ─── Verification queries (run manually, do NOT execute as part of migration)
--
-- SELECT campaign_code, COUNT(*) FROM leads
--   WHERE outreach_sent = true GROUP BY campaign_code ORDER BY 2 DESC;
--
-- Expected ballpark (snapshot 2026-04-28):
--   BR              ~503
--   US-WA           ~70
--   BR-WA-PREVIEW   ~22-30 (Phase 1)
--   _legacy_unknown ~0-5 (only if some lead has an unusual country/channel combo)
