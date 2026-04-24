-- Backfill `country` on leads created before the column was populated
-- consistently. Without this, filters or routing that rely on country (new
-- country-aware Evolution instance routing, US-WA/US-SMS campaigns) would
-- silently miss older rows that have NULL.
--
-- Safe to re-run: the WHERE clause skips rows that already have a country.
UPDATE public.leads
SET country = 'BR'
WHERE country IS NULL;
