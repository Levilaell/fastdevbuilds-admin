-- Add Google Places enrichment columns to leads
--
-- hours: { weekday_text: string[], open_now: boolean }
--   weekday_text comes directly from opening_hours.weekday_text in the
--   Place Details API response (e.g. "Monday: 9:00 AM – 7:00 PM").
--   open_now is the boolean captured at collection time.
--
-- reviews: array of up to 3 objects
--   { author_name, rating, text, relative_time_description, time }
--   Populated from the Place Details API. Used literally by the Opus
--   prompt builder — no translation, no paraphrasing.
--
-- photos_urls: array of up to 5 strings
--   Each URL is a Google Places Photo API request of the form
--     https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600
--       &photo_reference={ref}&key={key}
--   The URL returns a 302 to the real image; we store it verbatim so
--   the frontend can render <img src> directly without proxying.
--
-- Populated by prospect-bot/steps/collect.js right after Text Search,
-- before the downstream enrichments (scraper, pagespeed, etc).
-- All three columns are fail-silent: if Place Details errors out,
-- they stay NULL and the rest of the lead still gets upserted.
--
-- Apply manually via Supabase SQL Editor (no ORM migration tool in this repo).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS hours jsonb NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reviews jsonb NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS photos_urls jsonb NULL;
