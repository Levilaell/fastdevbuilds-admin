-- Store the Vercel preview URL of the generated site. Populated by the
-- admin when Levi pastes the URL after running Claude Code locally. In the
-- US-WhatsApp preview-first flow, the outreach message embeds this URL —
-- the lead clicks straight into a working site instead of being asked
-- permission to see one.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS preview_url TEXT;

COMMENT ON COLUMN public.projects.preview_url IS
  'Vercel preview URL of the generated site. Set by admin when Levi pastes it. Reused to build the outreach WhatsApp/email message.';
