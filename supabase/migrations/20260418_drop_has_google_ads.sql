-- Drops has_google_ads column.
-- Was collected by the bot scraper but had zero readers (no scoring, no
-- messaging, no CRM UI). Only appeared in CSV export.
-- Applied manually in production on 2026-04-18.

ALTER TABLE leads DROP COLUMN IF EXISTS has_google_ads;
