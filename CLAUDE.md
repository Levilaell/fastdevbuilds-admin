@AGENTS.md

# FastDevBuilds Admin — Project Guide

## Objective

Private admin panel for the FastDevBuilds sales team to manage the full prospect-to-close pipeline. A bot automatically prospects clients via WhatsApp and email; this dashboard gives visibility and control over every lead's journey.

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
│   │   │   ├── run/route.ts             # POST — start bot, stream SSE output
│   │   │   └── runs/route.ts            # GET — last 5 bot run history
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
│   │   └── bot-client.tsx               # Bot runner form + terminal + run history
│   └── lead-detail/
│       ├── tech-analysis.tsx            # Boolean audit + PageSpeed scores
│       ├── pain-score-card.tsx          # Score display + translated reasons
│       ├── outreach-card.tsx            # Bot message + send status
│       ├── status-select.tsx            # Pipeline status dropdown (client)
│       ├── conversation-panel.tsx       # Wraps history + reply box (client)
│       ├── conversation-history.tsx     # Message bubbles (client)
│       └── reply-box.tsx               # Textarea + AI suggest + send (client)
├── lib/
│   ├── types.ts                         # Lead, LeadCard, LeadStatus, status labels/colors
│   ├── time-ago.ts                      # Relative time formatter (pt-BR)
│   └── supabase/
│       ├── client.ts                    # Browser client
│       └── server.ts                    # Server client
├── proxy.ts                             # Auth route protection
├── bot-server/
│   └── server.js                        # Railway bot server (SSE streaming runner)
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
| `/bot` | Trigger the prospect-bot via button; show run logs |
| `/metrics` | Conversion funnel chart + revenue totals |

## Supabase Schema

### `leads` table (PK: `place_id`)

| Column | Type | Notes |
|---|---|---|
| place_id | text | PK |
| business_name | text | |
| address | text | |
| city | text | |
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
| pain_score | smallint | 0–10 |
| score_reasons | text | Comma-separated reasons |
| message | text | Generated outreach message |
| email | text | Found via scraping or Hunter.io |
| email_source | text | scrape/hunter/null |
| outreach_sent | boolean | |
| outreach_sent_at | timestamptz | |
| outreach_channel | text | whatsapp/email/pending |
| niche | text | Search niche used |
| status | lead_status | Pipeline status enum |
| status_updated_at | timestamptz | |

### Lead status enum (`lead_status`)

```sql
CREATE TYPE lead_status AS ENUM (
  'prospected',   -- Found by bot, not yet contacted
  'sent',         -- Message sent
  'replied',      -- Lead replied
  'negotiating',  -- Active conversation
  'scoped',       -- Project scoped
  'closed',       -- Deal won
  'lost'          -- Deal lost
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
  duration_seconds INTEGER
);
```

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon key (safe for client)
SUPABASE_SERVICE_KEY=           # Service role key — server only
ANTHROPIC_API_KEY=              # Claude API key
EVOLUTION_API_URL=              # WhatsApp gateway URL
EVOLUTION_API_KEY=              # WhatsApp gateway key
EVOLUTION_INSTANCE=             # WhatsApp instance name
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
