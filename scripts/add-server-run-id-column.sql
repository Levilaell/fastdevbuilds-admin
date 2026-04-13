-- Add server_run_id column to bot_runs for polling-based auto mode
ALTER TABLE bot_runs ADD COLUMN IF NOT EXISTS server_run_id TEXT;
