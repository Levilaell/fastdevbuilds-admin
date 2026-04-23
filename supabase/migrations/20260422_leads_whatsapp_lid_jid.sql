-- whatsapp_lid_jid — secondary WhatsApp identifier used when a contact replies
-- from the `@lid` form instead of the canonical `@s.whatsapp.net` stored in
-- `whatsapp_jid`. Populated via the quarantine triage UI once an orphaned
-- inbound is manually attributed to the lead; after that, subsequent messages
-- from the same @lid match via JID-exact (method #1) with zero manual work.
--
-- Kept separate from `whatsapp_jid` so outbound dispatch keeps using the
-- canonical form (Evolution's `/chat/whatsappNumbers` returns @s.whatsapp.net),
-- while the webhook match can check both columns.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS whatsapp_lid_jid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS leads_whatsapp_lid_jid_unique
  ON leads (whatsapp_lid_jid)
  WHERE whatsapp_lid_jid IS NOT NULL;
