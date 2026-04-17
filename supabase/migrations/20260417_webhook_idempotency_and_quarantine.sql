-- PR 2 — Webhook inbound: idempotência real + quarentena de LID não-resolvível.
--
-- All DDL here is idempotent (IF NOT EXISTS). Safe to re-run.

-- ─── 1. Idempotent dedup via Evolution `key.id` ───────────────────────────
-- Replaces the fragile ±5s / 120s time-window dedup in the webhook handler
-- with a unique constraint on the provider-supplied message id.
--
-- Partial uniqueness: NULL is allowed (old conversations pre-date this
-- column, and the rare Evolution payload without key.id should still be
-- persisted rather than dropped).

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_provider_message_id_unique
  ON conversations (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_provider_message_id_idx
  ON conversations (provider_message_id);

-- ─── 2. Webhook inbound quarantine ────────────────────────────────────────
-- Destination for inbound events we can't attribute to a known lead AND
-- can't safely represent as `unknown_<phone>` (e.g. @lid with no resolvable
-- phone). Previously the handler would create `unknown_<lid>@lid` shadow
-- leads, which then hijacked all future messages from that contact via the
-- JID-exact match path.
--
-- Write-only from the webhook; a future reconciliation worker will attempt
-- to match these to real leads retroactively.

CREATE TABLE IF NOT EXISTS webhook_inbound_quarantine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_message_id TEXT,
  remote_jid TEXT NOT NULL,
  push_name TEXT,
  message_text TEXT,
  evolution_instance TEXT,
  from_me BOOLEAN,
  reason TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_to_place_id TEXT
);

CREATE INDEX IF NOT EXISTS webhook_quarantine_unresolved_idx
  ON webhook_inbound_quarantine (received_at DESC)
  WHERE resolved = false;

CREATE INDEX IF NOT EXISTS webhook_quarantine_remote_jid_idx
  ON webhook_inbound_quarantine (remote_jid);
