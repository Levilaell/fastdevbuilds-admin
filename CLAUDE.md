# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # next dev — local on :3000
npm run build      # next build — also runs type-check
npm run lint       # eslint (flat config, eslint-config-next)
npm start          # next start (after build)
```

There are no tests. Verify changes by running `npm run build` (type errors surface here) and exercising the affected flow against a real Supabase + Evolution instance — see "Local testing" below.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 (no UI library) · Supabase (Postgres + Auth) · Anthropic SDK · Evolution API for WhatsApp · Instantly for email · deployed on Vercel.

## Next.js 16 — read before editing

This is **not** the Next.js most training data describes. Heed `AGENTS.md`. Specifics that bite:

- Auth/edge logic lives in `proxy.ts` (root), not `middleware.ts`. The exported function is `proxy`, not `middleware`. The matcher syntax is the same, but a file named `middleware.ts` is silently ignored.
- `params` and `searchParams` in pages/layouts are `Promise`s — `await` them.
- Root `app/layout.tsx` returns `children` only; `(auth)` and `(dashboard)` route groups own their own `<html>`/`<body>` so the auth pages can be chromeless.
- When in doubt about an API, check `node_modules/next/dist/docs/` rather than guessing from memory.

## Architecture

### Three Supabase clients — pick deliberately

| File | Use from | Purpose |
|---|---|---|
| `lib/supabase/client.ts` | browser components | anon key, RLS-bound to current user |
| `lib/supabase/server.ts` | server components & route handlers | anon key + cookies, RLS-bound to current user |
| `lib/supabase/service.ts` | webhooks, cron, AI workers | service-role, **bypasses RLS** |

Service-role routes that aren't auth-gated by the proxy MUST authenticate the caller themselves (`lib/supabase/auth.ts` → `getAuthUser` / `unauthorizedResponse`) or be opened intentionally as public webhooks under `/api/webhook/*` (the proxy whitelists that prefix).

### Outbound messaging — single dispatcher

Every WhatsApp/email send for a known lead goes through `dispatchMessage()` in `lib/messages/dispatch.ts`. It is the only place that owns these invariants — do not bypass it from new code:

- exactly one `conversations` row per successful send (direction `out`)
- `last_outbound_at` set, `outreach_error` cleared
- status transitions `prospected → sent` and `replied → negotiating`
- `whatsapp_jid` backfilled from the send response, falling back to `lookupJidFromPhone` (Evolution's `/chat/whatsappNumbers/<instance>`) so future inbound webhooks match by JID
- pending AI suggestions for the lead are dismissed
- a 24h follow-up is scheduled unless `isFollowUp: true` or `follow_up_paused`

The webhook (`app/api/webhook/whatsapp/route.ts`) replicates the status-transition + outbound-tracking logic for echoes from sends that originated **outside** the dashboard (sales rep typing on their phone, or the prospect-bot writing leads + calling Evolution directly without dispatcher visibility). Keep these two paths in sync.

### Inbound webhook matching

`matchLead()` in the WhatsApp webhook route tries, in order:

1. `whatsapp_jid` exact match
2. phone match (after `normalizePhone` — strips formatting, prefixes `55` for BR)
3. text-echo: outbound `fromMe` event whose message text matches a lead with `whatsapp_jid IS NULL` on the same instance (catches bot-sent leads before any JID is known)
4. instance-attribution: same instance + recent outbound + `last_inbound_at IS NULL`, fires only when exactly **one** candidate exists in a 2h window

If all four fail, an `unknown_<phone>` (or `unknown_<lid>`) shadow lead is created — these show up in the inbox and are a signal the matching heuristics missed something. JID is **refreshed on every match** because Evolution migrates contacts between `@s.whatsapp.net` and `@lid` and the same lead will show up in either form across events.

LID JIDs (`*@lid`) don't contain a phone number; resolution goes through `resolvePhoneFromLid` (`lib/whatsapp.ts`), which matches profile-picture URLs across `findContacts` calls — slow, racy, and may return null. Don't assume `phone` is non-null on inbound paths.

### Multi-instance Evolution

Configure via `EVOLUTION_INSTANCES_JSON` (preferred, hot-swappable) or numbered `EVOLUTION_INSTANCE_<N>` / `EVOLUTION_API_KEY_<N>` env vars (legacy). `getOrAssignInstance()` does least-sends-in-last-24h round-robin and persists `evolution_instance` on the lead — never reassign it manually. Each instance has its own API key; webhook payloads are identified by header `apikey` (or fallback body field), and the matched instance name flows into all match heuristics.

### Auto-reply detection

`lib/auto-reply.ts` — two-tier classifier (strong patterns trigger immediately; weak signals require composite score ≥ 3) plus `isInstantReply` (< 3s after our outbound = auto). When triggered, the inbound is recorded with `approved_by: 'auto-reply'`, `last_auto_reply_at` is set, `follow_up_paused = true`, and pending suggestions are dismissed — but no AI suggestion is generated.

### AI workflow

`lib/ai-workflow.ts` runs three stages with explicit model choices:

- `classifyAndSuggest` (Haiku 4.5) — on every real inbound, writes to `ai_suggestions`
- `generateProposal` (Sonnet 4) — on demand, writes to `projects`; if a previously-dismissed proposal exists (`proposal_message IS NULL`), it skips regeneration
- `generateClaudeCodePrompt` (Sonnet 4) — generates the build prompt + placeholder list once a project is scoped

System/user prompts and the model-version constants live in `lib/prompts.ts` and `lib/ai-workflow.ts`. Country routing (`isUSLead`) controls language, currency, and channel (BR → WhatsApp/PT/BRL, US → email/EN/USD).

### Bot integration

The actual prospecting bot is a **separate repo** (`prospect-bot`) running on Railway. This dashboard is the source of truth for niches/cities/country config (`lib/bot-config.ts`) — that config is sent to the bot-server with each `/api/bot/queue` and `/api/bot/run-auto` call. After a bot run, `lib/leads/backfill-jid.ts` looks up canonical JIDs for newly-sent leads via Evolution because the bot doesn't write `whatsapp_jid` itself.

### Bot → CRM outreach endpoints

The **only** correct way for the bot to report a send from here on:

- `POST /api/bot/outreach/sent` — successful send. Reuses `recordOutboundMessage` (`lib/messages/record-outbound.ts`) so the lead picks up the same invariants `dispatchMessage` enforces (status transition, `last_outbound_at`, JID backfill, follow-up scheduling, suggestion dismissal). Idempotent within ±60s on `(place_id, direction='out', message)` so retries are safe.
- `POST /api/bot/outreach/failed` — failed send. Writes `outreach_error` only; leaves status, `outreach_sent`, and conversations untouched so the lead remains retryable.

Both require `Authorization: Bearer $BOT_TO_CRM_SECRET` (fail-closed when unset) and are whitelisted in `proxy.ts` so the bot-server can reach them without Supabase cookies. The bot is expected to upsert the lead row **before** calling `/sent`; missing leads return 404.

### Follow-up cron

`POST /api/follow-up/run` is the worker. It requires `Authorization: Bearer <CRON_SECRET>` (env var, not in `.env.example`). Schedule it externally (Vercel Cron, GitHub Actions, etc.) — there is no internal scheduler. Two follow-ups max, gated by `next_follow_up_at` (24h after first send, 72h between follow-ups). Permanent failures (HTTP 400 / 501) clear `next_follow_up_at` so they aren't retried.

## Schema essentials

Three primary tables (full column list in `lib/types.ts`): `leads` (PK `place_id`), `conversations` (`direction in|out`, `channel whatsapp|email`), `projects` (one per closed lead). `ai_suggestions` carries Claude reply suggestions (status `pending|approved|rejected|sent`).

Lead status enum and pipeline order:
```
prospected → sent → replied → negotiating → scoped → closed → finalizado → pago
                                                            ↘ lost / disqualified
```
`PIPELINE_STATUSES` in `lib/types.ts` controls which columns render on the kanban; `lost`/`disqualified`/`finalizado`/`pago` are intentionally hidden there.

Migrations are split across `migrations/` (legacy, hand-applied) and `supabase/migrations/` (newer). The schema definitions in `lib/types.ts` are authoritative — if a column there isn't in the DB, run the matching migration.

## Local testing

There is no test suite. Verify webhook/dispatch changes by:

1. Pointing Evolution's webhook at a tunnel (e.g. `ngrok http 3000`) → `https://<tunnel>/api/webhook/whatsapp`
2. Sending a real WhatsApp message and watching `[webhook:match]` / `[dispatch:*]` logs — they're verbose by design and the only way to trace the matching path
3. For follow-up: `curl -X POST localhost:3000/api/follow-up/run -H "Authorization: Bearer $CRON_SECRET"`

## Visual conventions

Dark theme defined in `app/globals.css` as CSS vars consumed by Tailwind v4's `@theme inline`. Use the semantic tokens (`bg-bg`, `bg-card`, `border-border`, `text-text`, `text-muted`, `bg-accent`) — never hardcode hex. Visual direction is Linear/Vercel/Raycast: 1px borders for depth (no shadows), violet accent (`#7C3AED`), semi-transparent badge fills.
