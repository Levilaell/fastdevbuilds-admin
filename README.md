# FastDevBuilds Admin

Private admin panel for managing the FastDevBuilds sales pipeline.

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd fastdevbuilds-admin
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` with your values:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon public |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Settings → API → service_role |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `EVOLUTION_API_URL` | Your Evolution API host |
| `EVOLUTION_API_KEY` | Your Evolution API key |
| `EVOLUTION_INSTANCE` | Your WhatsApp instance name |
| `BOT_SERVER_URL` | Your prospect bot server URL |

### 3. Create the admin user in Supabase

The app uses Supabase Auth with email + password. To create the admin user:

**Option A — Supabase Dashboard (recommended)**

1. Go to your Supabase project → Authentication → Users
2. Click **Add user** → **Create new user**
3. Enter the admin email and a strong password
4. Click **Create user**

**Option B — SQL Editor**

```sql
-- Run in Supabase SQL Editor
SELECT auth.create_user(
  '{"email": "admin@fastdevbuilds.com", "password": "your-strong-password", "email_confirm": true}'::jsonb
);
```

**Option C — Supabase CLI**

```bash
supabase functions invoke --no-verify-jwt admin/create-user \
  --body '{"email":"admin@example.com","password":"your-password"}'
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

### 5. Build

```bash
npm run build
```

## Database Schema

The app expects these tables in your Supabase project. See `CLAUDE.md` for full column definitions.

- `leads` — all prospected businesses (PK: `place_id`)
- `conversations` — message history per lead
- `projects` — closed deals

The `lead_status` enum must exist:

```sql
CREATE TYPE lead_status AS ENUM (
  'prospected', 'sent', 'replied', 'negotiating', 'scoped', 'closed', 'lost'
);
```

## Deploy to Vercel

1. Push to GitHub
2. Import into Vercel
3. Add all environment variables from `.env.local` to the Vercel project settings
4. Deploy
# fastdevbuilds-admin
