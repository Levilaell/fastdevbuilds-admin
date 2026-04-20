-- UNIQUE + NOT NULL on projects(place_id)
-- 
-- Before: schema allowed NULL place_id and duplicate projects per lead.
-- After: each lead can have at most 1 project, and place_id is required.
--
-- Applied manually via Supabase SQL Editor on 2026-04-20.
-- Prerequisite: no existing NULLs and no duplicates (verified before apply).
-- Validated: insert of duplicate place_id returned 23505 as expected.
--
-- Violation behavior:
-- - Duplicate place_id -> error 23505 unique_violation
-- - NULL place_id -> error 23502 not_null_violation

ALTER TABLE projects ALTER COLUMN place_id SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT projects_place_id_key UNIQUE (place_id);
