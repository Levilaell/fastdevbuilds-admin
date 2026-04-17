-- Consistency hardening for the WhatsApp CRM.
--
-- Adds indexes that support the webhook's new multi-step lead matching and
-- documents the safe merge strategy for duplicate `unknown_*` shadow leads.
--
-- All DDL here is idempotent and non-destructive. The merge section is a
-- RUN BOOK for manual review — do NOT execute blindly.

-- ─── Indexes for fast lead matching ───────────────────────────────────────

-- Webhook match path 1: whatsapp_jid exact
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_jid
  ON leads (whatsapp_jid)
  WHERE whatsapp_jid IS NOT NULL;

-- Webhook match path 2: narrows full-table scan for phone matching
CREATE INDEX IF NOT EXISTS idx_leads_phone_not_null
  ON leads (phone)
  WHERE phone IS NOT NULL;

-- Webhook match path 3: outbound echo by message text
CREATE INDEX IF NOT EXISTS idx_leads_outbound_echo_match
  ON leads (evolution_instance, message)
  WHERE outreach_sent = true
    AND whatsapp_jid IS NULL
    AND message IS NOT NULL;

-- Webhook match path 4: instance attribution window + bot-sync queries
CREATE INDEX IF NOT EXISTS idx_leads_instance_outreach_sent_at
  ON leads (evolution_instance, outreach_sent_at DESC)
  WHERE outreach_sent = true;

-- Inbox aggregation
CREATE INDEX IF NOT EXISTS idx_conversations_place_id_sent_at
  ON conversations (place_id, sent_at DESC);

-- Follow-up dedup check (dispatch's 120s duplicate guard)
CREATE INDEX IF NOT EXISTS idx_conversations_outbound_dedup
  ON conversations (place_id, direction, sent_at DESC)
  WHERE direction = 'out';

-- ─── Duplicate `unknown_*` merge strategy (design only) ────────────────────
--
-- Background:
--   Before the webhook matching fixes, inbound replies from bot-sent leads
--   could be stored under `unknown_<jid>` place_ids instead of the original
--   lead, producing two logical rows for the same phone.
--
-- Detection query (safe to run — read only):
--
--   WITH candidates AS (
--     SELECT
--       u.place_id       AS unknown_place_id,
--       u.phone          AS unknown_phone,
--       u.whatsapp_jid   AS unknown_jid,
--       u.last_inbound_at,
--       l.place_id       AS real_place_id,
--       l.phone          AS real_phone,
--       l.status         AS real_status,
--       l.business_name  AS real_business_name
--     FROM leads u
--     JOIN leads l
--       ON l.place_id <> u.place_id
--      AND l.phone IS NOT NULL
--      AND u.phone IS NOT NULL
--      AND l.phone = u.phone
--     WHERE u.place_id LIKE 'unknown\_%' ESCAPE '\'
--       AND l.place_id NOT LIKE 'unknown\_%' ESCAPE '\'
--   )
--   SELECT * FROM candidates ORDER BY unknown_place_id;
--
-- Merge procedure (manual, per-row — review before running each step):
--
--   1. For each (unknown_place_id, real_place_id) pair, reassign the
--      conversation rows to the real lead:
--
--        UPDATE conversations
--        SET place_id = :real_place_id
--        WHERE place_id = :unknown_place_id;
--
--   2. Reassign any ai_suggestions:
--
--        UPDATE ai_suggestions
--        SET place_id = :real_place_id
--        WHERE place_id = :unknown_place_id;
--
--   3. Copy latest inbound tracking onto the real lead, being careful to
--      preserve earlier values when the real lead already advanced:
--
--        UPDATE leads r
--        SET
--          last_inbound_at     = GREATEST(COALESCE(r.last_inbound_at, 'epoch'::timestamptz),     u.last_inbound_at),
--          last_human_reply_at = GREATEST(COALESCE(r.last_human_reply_at, 'epoch'::timestamptz), u.last_human_reply_at),
--          last_auto_reply_at  = GREATEST(COALESCE(r.last_auto_reply_at,  'epoch'::timestamptz), u.last_auto_reply_at),
--          whatsapp_jid        = COALESCE(r.whatsapp_jid, u.whatsapp_jid),
--          evolution_instance  = COALESCE(r.evolution_instance, u.evolution_instance),
--          follow_up_paused    = r.follow_up_paused OR u.follow_up_paused,
--          status              = CASE
--            WHEN r.status = 'sent' AND u.status IN ('replied','negotiating') THEN 'replied'
--            ELSE r.status
--          END,
--          status_updated_at   = GREATEST(r.status_updated_at, u.status_updated_at)
--        FROM leads u
--        WHERE r.place_id = :real_place_id
--          AND u.place_id = :unknown_place_id;
--
--   4. Delete the shadow lead last, and only after conversations / suggestions
--      have moved:
--
--        DELETE FROM leads WHERE place_id = :unknown_place_id;
--
-- Prevention:
--   The webhook now attributes inbounds via whatsapp_jid, phone, outbound
--   echo text, and instance + recent-outbound fallbacks BEFORE creating an
--   `unknown_*` shadow. New duplicates should be rare; any that occur are
--   worth investigating (bot attribution data missing, multi-instance
--   ambiguity, etc.).
