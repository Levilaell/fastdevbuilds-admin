-- Split project status `in_progress` into explicit `preview_sent` + `adjusting`
-- to align with the user's actual sales workflow:
--
--   approved → preview_sent → adjusting → delivered → paid
--                                                 ↘ cancelled
--
-- Why: the old `in_progress` collapsed two distinct phases — preview shipped
-- (waiting client feedback, user is idle) vs. adjusting (user is actively
-- iterating on client feedback). The pipeline UI needs them separate so
-- "waiting on them" is visually distinct from "working on it".
--
-- Backfill strategy for existing rows (13 projects): every project had a
-- preview URL outbound after creation, so all 13 are classified `preview_sent`
-- here. Inbound replies from the client after the preview are NOT treated as
-- an auto-transition to `adjusting` — that's a manual call (whether the user
-- has started applying changes is unrelated to whether the client responded).
-- `preview_sent_at` is backfilled from the preview outbound's sent_at.

-- 1. Allow the new enum values via CHECK constraint. Existing `in_progress`
-- is kept briefly so the UPDATEs below don't violate the constraint; a
-- follow-up migration can tighten this after we're sure no row uses it.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('approved','in_progress','preview_sent','adjusting','delivered','paid','cancelled'));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS preview_sent_at TIMESTAMPTZ;

-- 2. Backfill — per-row status + preview_sent_at, generated from actual
-- conversation data. See scripts/build_migration.py (session 2026-04-23).

UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T18:41:47.406+00:00' WHERE place_id='ChIJIWSmtPzJyJQRxc2XC7u8U2g';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T18:44:58.523+00:00' WHERE place_id='ChIJw4Zokl5XzJQRaBGCmS4q1kA';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T09:11:43.847+00:00' WHERE place_id='ChIJx6QeMQa_uZQRtaTR6WHSPq8';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T09:14:38+00:00' WHERE place_id='ChIJaYQriOZDzpQRfDaa4ROGG2k';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T09:15:28.216+00:00' WHERE place_id='ChIJMSVK4ss9NAURL5iwhAU7a30';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T19:42:51.342+00:00' WHERE place_id='ChIJn2jyQJlXzJQR2cSpr3OGamU';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T21:17:53.455+00:00' WHERE place_id='ChIJKRVsZtppzpQRdC9MA0XBHss';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T20:24:44.729+00:00' WHERE place_id='ChIJa9kSAsD_zpQRc1fCCgXuTCA';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T21:16:48.188+00:00' WHERE place_id='ChIJb9Mxkk7PyJQRPOy3IwAXgwY';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T21:18:36.742+00:00' WHERE place_id='ChIJL2JZ2CL_zpQRkXVrPFn2PPU';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T21:24:05.247+00:00' WHERE place_id='ChIJ47lwsqz_zpQRf3cC7UEzApo';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T21:25:18.911+00:00' WHERE place_id='ChIJ5yHSyLj_zpQRtfChcQ-F0hU';
UPDATE projects SET status='preview_sent', preview_sent_at='2026-04-22T18:43:03.221+00:00' WHERE place_id='ChIJb10yxqj5zJQRVxp0NBZP7U0';

-- 3. Any stragglers (shouldn't exist but defensively remap) — a row still
-- on `in_progress` after this point is data we didn't classify; promote to
-- `adjusting` conservatively (user can downgrade via UI if it was actually
-- just preview_sent).
UPDATE projects SET status = 'adjusting' WHERE status = 'in_progress';

-- 4. Tighten the constraint now that `in_progress` is vacated.
ALTER TABLE projects DROP CONSTRAINT projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('approved','preview_sent','adjusting','delivered','paid','cancelled'));
