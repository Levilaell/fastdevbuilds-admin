-- Add new columns for enhanced Claude Code prompt generation
-- Run this migration against your Supabase database

ALTER TABLE projects ADD COLUMN IF NOT EXISTS pending_info TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS info_request_message TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS prompt_updated_at TIMESTAMPTZ;
