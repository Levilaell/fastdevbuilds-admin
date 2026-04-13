-- Add evolution_instance column to leads for multi-number WhatsApp rotation
ALTER TABLE leads ADD COLUMN IF NOT EXISTS evolution_instance TEXT;

-- Backfill: all existing leads that were sent via WhatsApp used instance 1
UPDATE leads
SET evolution_instance = 'fastdevbuilds'
WHERE outreach_sent = true
  AND outreach_channel = 'whatsapp'
  AND evolution_instance IS NULL;
