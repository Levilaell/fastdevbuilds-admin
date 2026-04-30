-- Pivot v2 cleanup — drop columns/tables made dead by the BR-volume model.
--
-- ICP novo (microempresa sem site) não usa nenhuma coluna de scoring,
-- PageSpeed, visual analysis, tech stack, ou attribution-by-LID. Email/SMS
-- channels também saíram. webhook_inbound_quarantine não tem mais
-- writers (webhook simplificado).
--
-- Rodar em produção depois de garantir que pivot-v2 está deployado e
-- estável por pelo menos 24h. As colunas continuam existindo no código TS
-- (lib/types.ts) como nullable até esse drop, e o type-check passa sem
-- elas mesmas como queries antigas.
--
-- Idempotente: usa IF EXISTS em todos os DROPs.

BEGIN;

-- ─── leads: drop scoring/PageSpeed/visual columns ─────────────────────────
ALTER TABLE leads
  DROP COLUMN IF EXISTS pain_score,
  DROP COLUMN IF EXISTS opportunity_score,
  DROP COLUMN IF EXISTS opportunity_reasons,
  DROP COLUMN IF EXISTS score_reasons,
  DROP COLUMN IF EXISTS perf_score,
  DROP COLUMN IF EXISTS mobile_score,
  DROP COLUMN IF EXISTS fcp,
  DROP COLUMN IF EXISTS lcp,
  DROP COLUMN IF EXISTS cls,
  DROP COLUMN IF EXISTS has_ssl,
  DROP COLUMN IF EXISTS is_mobile_friendly,
  DROP COLUMN IF EXISTS has_pixel,
  DROP COLUMN IF EXISTS has_analytics,
  DROP COLUMN IF EXISTS has_form,
  DROP COLUMN IF EXISTS has_booking,
  DROP COLUMN IF EXISTS tech_stack,
  DROP COLUMN IF EXISTS scrape_failed,
  DROP COLUMN IF EXISTS visual_score,
  DROP COLUMN IF EXISTS visual_notes;

-- ─── leads: drop email/SMS channel columns ────────────────────────────────
ALTER TABLE leads
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS email_source,
  DROP COLUMN IF EXISTS email_subject;

-- ─── leads: drop @lid attribution column (LID resolution removed) ─────────
ALTER TABLE leads
  DROP COLUMN IF EXISTS whatsapp_lid_jid;

-- ─── leads: drop owner_probability (experiment-tracking exotic field) ─────
ALTER TABLE leads
  DROP COLUMN IF EXISTS owner_probability;

-- ─── leads: drop has_google_ads (não preenchido em lugar nenhum) ──────────
ALTER TABLE leads
  DROP COLUMN IF EXISTS has_google_ads;

-- ─── webhook_inbound_quarantine: nenhum writer mais (webhook simplificado)
DROP TABLE IF EXISTS webhook_inbound_quarantine;

COMMIT;
