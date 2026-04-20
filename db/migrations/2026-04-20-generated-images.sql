-- Add generated_images column to projects table
--
-- Stores the result of lib/image-generator.ts → generateSiteImages():
--   { hero: string, services: Array<{ name: string, url: string }> }
--
-- Populated by generateClaudeCodePrompt (lib/ai-workflow.ts) right after
-- the prompt is generated. The same URLs are also inlined into
-- claude_code_prompt under the "## Imagens disponíveis" section so
-- Claude Code can drop them directly into <img src>.
--
-- NULL when image generation was skipped or failed — callers must tolerate
-- the absence; the Claude Code prompt already falls back to CSS gradients
-- + SVG placeholders when no URLs are present.
--
-- Apply manually via Supabase SQL Editor (no ORM migration tool in this repo).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS generated_images JSONB NULL;
