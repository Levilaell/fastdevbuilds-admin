@AGENTS.md

# FastDevBuilds Admin — Project Guide

## Objective

Private admin panel for the FastDevBuilds sales team to manage the full prospect-to-close pipeline. A bot (separate repo: `prospect-bot`) automatically prospects clients via WhatsApp (BR) and email (US); this dashboard gives visibility and control over every lead's journey.

## Architecture

```
┌─────────────────────┐        ┌──────────────────────┐
│  fastdevbuilds-admin │  SSE   │    prospect-bot       │
│  (Vercel / Next.js)  │◄──────►│  (Railway / Node.js)  │
│                      │        │                       │
│  Dashboard + API     │        │  bot-server/server.js │
│  lib/bot-config.ts ──┼── config ──► queue + run-auto  │
│  (source of truth)   │        │  prospect.js (CLI)    │
└──────────┬───────────┘        └──────────┬────────────┘
           │                               │
           └───────── Supabase ◄───────────┘
```

**Config flow**: `bot-config.ts` is the single source of truth for niches, cities, and country settings. The dashboard sends this config to the bot-server with each `/api/bot/queue` and `/run-auto` call. The bot-server's `auto-config.js` is a legacy fallback only used for standalone CLI runs.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript strict) |
| Styling | Tailwind CSS v4 — no external component libraries |
| Database / Auth | Supabase (PostgreSQL + Auth + Realtime) |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Deploy | Vercel |

> **Next.js 16 breaking changes**: `middleware.ts` → `proxy.ts`, function name `middleware` → `proxy`. The edge runtime is NOT supported in proxy — it runs Node.js only. `params` in layouts/pages is now a `Promise` and must be `await`ed.

## Color Palette (dark theme — used everywhere)

Visual direction: Linear / Vercel / Raycast — near-black background, depth via 1px borders (no shadows), violet accent, semi-transparent badge fills.

| Token | CSS var | Value |
|---|---|---|
| Background | `--bg` | `#080808` |
| Card | `--card` | `#111111` |
| Card hover | `--card-hover` | `#1A1A1A` |
| Border | `--border` | `#222222` |
| Sidebar | `--sidebar` | `#0D0D0D` |
| Accent | `--accent` | `#7C3AED` |
| Accent hover | `--accent-hover` | `#6D28D9` |
| Text primary | `--text` | `#FAFAFA` |
| Text muted | `--muted` | `#525252` |
| Success | `--success` | `#10B981` |
| Warning | `--warning` | `#F59E0B` |
| Danger | `--danger` | `#EF4444` |

## Country-based Bot Configuration

`lib/bot-config.ts` defines a `COUNTRIES` array. Each country has:

| Field | Example (BR) | Example (US) |
|---|---|---|
| `code` | `'BR'` | `'US'` |
| `lang` | `'pt'` | `'en'` |
| `channel` | `'whatsapp'` | `'email'` |
| `niches` | Portuguese niche names with accents | English niche names |
| `cities` | 215 interior/medium cities | 330 interior/medium cities |

To add a new country, add an entry to `COUNTRIES`. Language, channel, niches, and cities all derive from the country. There is no separate language or export target selector in the UI.

**Important**: BR niche names use proper Portuguese accents (`clínicas odontológicas`, not `clinicas odontologicas`). This must match what's stored in Supabase for queue dedup to work correctly.

## Folder Structure

```
/
├── app/
│   ├── layout.tsx                       # Root layout — returns children, no html/body
│   ├── page.tsx                         # Redirects to /pipeline
│   ├── globals.css                      # Design system: CSS vars, scrollbar, transitions
│   ├── api/
│   │   ├── leads/
│   │   │   ├── route.ts                 # GET /api/leads — filtered list
│   │   │   └── [place_id]/
│   │   │       ├── route.ts             # GET /api/leads/[place_id] — full lead
│   │   │       └── status/route.ts      # PATCH — update lead status
│   │   ├── conversations/
│   │   │   ├── [place_id]/route.ts      # GET — conversation history
│   │   │   ├── [place_id]/read/route.ts # PATCH — mark inbound as read
│   │   │   ├── suggest/route.ts         # POST — Claude AI reply suggestion
│   │   │   └── send/route.ts            # POST — send message via Evolution/save
│   │   ├── inbox/route.ts               # GET — leads with conversations + unread counts
│   │   ├── bot/
│   │   │   ├── run/route.ts             # POST — manual bot run, streams SSE
│   │   │   ├── run-auto/route.ts        # POST — auto bot run, sends config + streams SSE
│   │   │   ├── queue/route.ts           # GET — fetches queue from bot-server (sends config)
│   │   │   ├── runs/route.ts            # GET — last 5 bot run history
│   │   │   ├── territories/route.ts     # GET — prospected niche/city combos
│   │   │   └── cancel/route.ts          # POST — cancel running bot
│   │   └── webhook/
│   │       └── whatsapp/route.ts        # POST — Evolution API inbound messages (public)
│   ├── (auth)/
│   │   ├── layout.tsx                   # Auth root layout — no sidebar
│   │   └── login/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx                   # Dashboard root layout — sidebar + header
│       ├── pipeline/page.tsx            # Kanban board (Server Component + Suspense)
│       ├── leads/[id]/page.tsx
│       ├── inbox/page.tsx
│       ├── bot/page.tsx
│       └── metrics/page.tsx
├── components/
│   ├── sidebar-nav.tsx                  # Nav links with icons + inbox badge (realtime)
│   ├── logout-button.tsx
│   ├── page-header.tsx
│   ├── user-avatar.tsx                  # Shows initial of logged-in user email
│   ├── pipeline/
│   │   ├── kanban-board.tsx             # DnD board with optimistic updates
│   │   ├── lead-card.tsx                # Card: name, channel badge, pain bar, city, time
│   │   └── pipeline-filters.tsx         # Search, channel, min score, niche
│   ├── inbox/
│   │   └── inbox-client.tsx             # Full inbox client (realtime, search, reply)
│   ├── bot/
│   │   └── bot-client.tsx               # Auto/manual mode, country selector, terminal
│   └── lead-detail/
│       ├── tech-analysis.tsx            # Boolean audit + PageSpeed + visual scores
│       ├── pain-score-card.tsx          # Score display + translated reasons
│       ├── outreach-card.tsx            # Bot message + send status
│       ├── status-select.tsx            # Pipeline status dropdown (client)
│       ├── conversation-panel.tsx       # Wraps history + reply box (client)
│       ├── conversation-history.tsx     # Message bubbles (client)
│       └── reply-box.tsx               # Textarea + AI suggest + send (client)
├── lib/
│   ├── bot-config.ts                    # Country config: niches, cities, lang, channel
│   ├── types.ts                         # Lead, LeadCard, LeadStatus, BotRun, etc.
│   ├── time-ago.ts                      # Relative time formatter (pt-BR)
│   └── supabase/
│       ├── client.ts                    # Browser client
│       ├── server.ts                    # Server client
│       └── service.ts                   # Service role client (server only)
├── proxy.ts                             # Auth route protection
├── .env.local                           # Secrets — never commit
└── .env.example
```

## Pages

| Route | Purpose |
|---|---|
| `/login` | Email + password auth — redirects to `/pipeline` on success |
| `/pipeline` | Kanban board of leads grouped by status enum |
| `/leads/[id]` | Lead detail: full profile + conversation history |
| `/inbox` | Received messages + reply composer with AI suggestion |
| `/bot` | Auto/manual prospect-bot runner with terminal output |
| `/metrics` | Conversion funnel chart + revenue totals |

## Supabase Schema

### `leads` table (PK: `place_id`)

| Column | Type | Notes |
|---|---|---|
| place_id | text | PK |
| business_name | text | |
| address | text | |
| city | text | Extracted from address |
| search_city | text | City string used in Google Places search |
| phone | text | |
| website | text | |
| rating | numeric(3,1) | |
| review_count | integer | |
| perf_score | numeric(5,2) | |
| mobile_score | numeric(5,2) | |
| fcp | numeric(10,2) | First Contentful Paint ms |
| lcp | numeric(10,2) | Largest Contentful Paint ms |
| cls | numeric(6,4) | Cumulative Layout Shift |
| has_ssl | boolean | |
| is_mobile_friendly | boolean | |
| has_pixel | boolean | Meta Pixel detected |
| has_analytics | boolean | Google Analytics/GTM |
| has_whatsapp | boolean | WhatsApp link on site |
| has_form | boolean | Contact form present |
| has_booking | boolean | Booking system present |
| tech_stack | text | wix/squarespace/wordpress/unknown |
| scrape_failed | boolean | |
| visual_score | numeric | AI visual analysis score |
| visual_notes | text[] | AI visual analysis notes |
| pain_score | smallint | 0–10 |
| score_reasons | text | Comma-separated reasons |
| message | text | Generated outreach message |
| message_variant | text | Message template variant used |
| email | text | Found via scraping or Hunter.io |
| email_source | text | scrape/hunter/null |
| email_subject | text | Subject line for email outreach |
| outreach_sent | boolean | |
| outreach_sent_at | timestamptz | |
| outreach_channel | text | whatsapp/email/pending |
| niche | text | Search niche used |
| country | text | BR/US — derived from lang |
| no_website | boolean | True if business has no website |
| evolution_instance | text | Assigned Evolution API instance for WhatsApp rotation |
| status | lead_status | Pipeline status enum |
| status_updated_at | timestamptz | |
| inbox_archived_at | timestamptz | Dashboard-only: when archived from inbox |

### Lead status enum (`lead_status`)

```sql
CREATE TYPE lead_status AS ENUM (
  'prospected',    -- Found by bot, not yet contacted
  'sent',          -- Message sent
  'replied',       -- Lead replied
  'negotiating',   -- Active conversation
  'scoped',        -- Project scoped
  'closed',        -- Deal won
  'finalizado',    -- Project delivered
  'pago',          -- Payment received
  'lost',          -- Deal lost
  'disqualified'   -- Filtered out by bot (low score, no phone, etc.)
);
```

### `conversations` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| place_id | text | FK → leads.place_id |
| direction | text | `in` \| `out` |
| channel | text | `whatsapp` \| `email` |
| message | text | |
| subject | text | Email subject line (nullable) |
| sent_at | timestamptz | |
| read_at | timestamptz | nullable |
| suggested_by_ai | boolean | |
| approved_by | text | nullable |

### `projects` table

| Column | Type |
|---|---|
| id | uuid (PK) |
| place_id | text (FK → leads.place_id) |
| scope | text |
| price | numeric |
| currency | text |
| status | text |
| created_at | timestamptz |
| updated_at | timestamptz |

### `bot_runs` table

```sql
CREATE TABLE bot_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche TEXT,
  city TEXT,
  limit_count INTEGER,
  min_score INTEGER,
  lang TEXT,
  export_target TEXT,
  dry_run BOOLEAN,
  send BOOLEAN,
  collected INTEGER,
  qualified INTEGER,
  sent INTEGER,
  status TEXT CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  log TEXT
);
```

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon key (safe for client)
SUPABASE_SERVICE_KEY=           # Service role key — server only
ANTHROPIC_API_KEY=              # Claude API key
EVOLUTION_API_URL=              # WhatsApp gateway URL (shared by all instances)
EVOLUTION_INSTANCE_1=           # WhatsApp instance 1 name
EVOLUTION_API_KEY_1=            # WhatsApp instance 1 key
EVOLUTION_INSTANCE_2=           # WhatsApp instance 2 name (optional)
EVOLUTION_API_KEY_2=            # WhatsApp instance 2 key (optional)
EVOLUTION_INSTANCE_3=           # WhatsApp instance 3 name (optional)
EVOLUTION_API_KEY_3=            # WhatsApp instance 3 key (optional)
BOT_SERVER_URL=                 # Railway bot server URL
BOT_SERVER_SECRET=              # Shared secret between dashboard ↔ bot server
```

## Code Rules

- **TypeScript strict** everywhere — no `any`, no type assertions without justification
- **async/await** — no `.then()` chains
- **Server Components by default** — add `'use client'` only when needed (hooks, event handlers)
- **params is a Promise** in Next.js 16 — always `await params` in page/layout components
- **Error boundaries** — wrap async data fetches in try/catch; surface errors to the user
- **No magic strings** — lead statuses must use the `lead_status` enum type
- **Tailwind only** — no inline `style` attributes, no CSS modules, no external UI libraries
- **Dark theme always** — every new component must use the color palette above
- **Niche names with accents** — BR niches must use proper Portuguese diacritics to match Supabase data
- **WhatsApp daily limit is 15 per instance** — 3 instances = 45 total, round-robin rotation via `evolution_instance` column on leads
