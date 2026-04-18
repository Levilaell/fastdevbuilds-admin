-- Drop ai_suggestions table after removing the automatic classify-and-suggest feature.
-- The table was written to on every inbound human message (via classifyAndSuggest
-- in the webhooks) but the UI cards generated never had measurable use —
-- 3 pending rows in 2 weeks, zero approved or rejected, all ignored.
--
-- Manual path (reply-box "Sugerir com IA" button) is preserved; it calls
-- /api/conversations/suggest inline without persisting.
--
-- Applied manually in production on 2026-04-18.

DROP TABLE IF EXISTS ai_suggestions;
