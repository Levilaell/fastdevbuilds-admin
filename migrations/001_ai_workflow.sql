-- AI Suggestions table
CREATE TABLE ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id TEXT REFERENCES leads(place_id),
  conversation_id UUID REFERENCES conversations(id),
  intent TEXT,
  confidence NUMERIC(3,2),
  suggested_reply TEXT,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'sent')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_ai_suggestions_place_id ON ai_suggestions(place_id);
CREATE INDEX idx_ai_suggestions_status ON ai_suggestions(status);

-- Update projects status constraint
ALTER TABLE projects
DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects
ADD CONSTRAINT projects_status_check
CHECK (status IN ('scoped','approved','in_progress','delivered','client_approved','paid','cancelled'));

-- New columns on projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS proposal_message TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS claude_code_prompt TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMPTZ;
