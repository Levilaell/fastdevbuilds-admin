-- Add email_subject and country columns to leads for US cold email support
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS country TEXT;

-- Add subject column to conversations for email threads
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subject TEXT;

-- Backfill country based on existing data
UPDATE leads SET country = 'BR' WHERE country IS NULL AND outreach_channel = 'whatsapp';
UPDATE leads SET country = 'US' WHERE country IS NULL AND outreach_channel = 'email';
