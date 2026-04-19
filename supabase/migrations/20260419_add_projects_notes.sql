-- Add notes column to projects table for "Criar projeto" UI flow.
-- Captures optional observations/preferences from Levi when manually
-- creating a project — included in the generateClaudeCodePrompt context
-- as "## Observações do Levi" section.
--
-- Column is optional. When NULL, the prompt omits the section entirely
-- and relies purely on conversation history + lead data for context.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes TEXT;
