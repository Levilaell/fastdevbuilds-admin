# FastDevBuilds Admin — contexto do projeto

CRM. Next.js 15, App Router, TypeScript, Tailwind, Supabase.

## Arquitetura

- `lib/supabase/server.ts` — anon, aplica RLS. Usar em Server Components que autenticam user.
- `lib/supabase/service.ts` — service, bypass RLS. Usar em API routes que leem leads/conversations/projects.
- `app/api/webhook/whatsapp/route.ts` — handler de inbound. 5 estratégias de match em cascata (jid, phone, text-echo, instance-attribution, pushname-fuzzy). Última roda antes de `quarantineInbound`.
- `lib/whatsapp.ts` — `resolvePhoneFromLid` tenta resolver @lid via foto de perfil. Falha silenciosa se contato sem foto.
- `lib/prompts.ts` — `buildSuggestionSystemPrompt` tem branch US (inglês) vs BR (português). BR é estrito: sem saudação, sem assinatura, max 2 linhas, informal.

## Evolution API

3 instâncias (`fastdevbuilds`, `prospect-bot-2`, `prospect-bot-3`) em `https://evolution-api-production-80b1.up.railway.app`. Keys em `.env.local` como `EVOLUTION_API_KEY_1/2/3`.

## Tabelas chave

- `leads` — place_id PK, status (`prospected`/`sent`/`replied`/`negotiating`/`closed`/`lost`), evolution_instance, outreach_sent_at, last_inbound_at
- `conversations` — place_id, direction (`in`/`out`), message, approved_by, provider_message_id (sem UNIQUE constraint)
- `webhook_inbound_quarantine` — inbounds que não deu match

## Scripts de manutenção

No bot repo: `scripts/reconcile-quarantine.js` pra resgatar inbounds perdidos.

## Não fazer

- Nunca usar `createClient` anon em API route que lê conversations/leads.
- Nunca commitar sem `npx tsc --noEmit` limpo.
- Nunca assumir que provider_message_id é único (ON CONFLICT quebra).
