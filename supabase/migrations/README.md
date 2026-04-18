# Supabase Migrations

Versioned migrations from April 2026 onwards.

## What this folder contains

Delta migrations applied after we started versioning schema changes. Each file is dated (`YYYYMMDD_description.sql`) and represents a single atomic change.

## What this folder does NOT contain

The full schema history. The database was built majority via the Supabase SQL Editor before versioning started. Earlier DDL (`projects`, `leads`, `conversations`, most columns, indexes, RLS policies) was applied directly and never captured in files here.

## Source of truth for current schema

The live Supabase database is canonical. To inspect:

1. Supabase Dashboard → Database → Schema
2. Or: `supabase db dump --schema-only` (requires local Supabase CLI auth)

Do not assume these files can reconstruct the database from scratch.

## When adding a new migration

- File name: `YYYYMMDD_short_description.sql` (e.g. `20260418_drop_ai_suggestions.sql`)
- Prefer `IF NOT EXISTS` / `IF EXISTS` for safety
- Apply via Supabase SQL Editor; commit the file as record of the change
