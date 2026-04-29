# Bot-server diff — Experiment tracking propagation

Aplicar no repo `prospect-bot/` (separado deste). Sem aplicar isso, leads
novos persistem com `campaign_code = NULL` mesmo após a migração admin.

Contexto: ver `GTM_LAB_ARCHITECTURE.md` §5.2 e migration
`supabase/migrations/20260428_experiment_tracking.sql`.

---

## 1. Aceitar `campaign_code` e `bot_run_id` no payload de `/run-auto`

O endpoint do bot-server que recebe `/run-auto` (provavelmente `server.js` ou
similar) já desserializa o body. Adicionar leitura dos novos campos:

```js
// onde já parsea params do body
const {
  market,
  niches,
  cities,
  lang,
  country,
  channel,
  previewFirst,
  qualificationFilters,
  evolutionInstances,
  evolutionApiUrl,
  // ── NOVOS ──
  campaign_code,   // string — código da campanha (ex: 'BR-WA-PREVIEW')
  bot_run_id,      // uuid — bot_runs.id criado pelo admin
  ...
} = req.body
```

E propagar adiante em todo o pipeline (collect → qualify → score → upsert),
seja via closure / context / parâmetro explícito. Padrão típico:

```js
const runContext = {
  campaign_code: campaign_code ?? null,
  bot_run_id: bot_run_id ?? null,
  // ... outros contextos que já existem
}

await runAuto({ ...inputs, runContext })
```

---

## 2. Stampar nos upserts de `leads`

Localizar TODOS os pontos onde o bot faz `supabase.from('leads').upsert(...)`
ou `.insert(...)`. Provavelmente em:

- `prospect-bot/steps/collect.js` (após Google Places Search)
- `prospect-bot/steps/qualify.js` (após qualification + scoring)
- Talvez `prospect-bot/steps/dispatch.js` ou similar

Em cada upsert, adicionar os campos:

```js
await supabase.from('leads').upsert(
  {
    place_id: lead.place_id,
    business_name: lead.name,
    niche: lead.niche,
    country: country,
    outreach_channel: channel,
    rating: lead.rating,
    review_count: lead.user_ratings_total,
    // ... campos atuais

    // ── NOVOS ──
    campaign_code: runContext.campaign_code,
    bot_run_id: runContext.bot_run_id,
    owner_probability: scoreOwner(lead, niche),  // ver §3
  },
  {
    onConflict: 'place_id',
    ignoreDuplicates: false,
  }
)
```

---

## 3. Cuidado com ON CONFLICT — não sobrescrever campaign_code histórico

Regra: **primeiro run que coletar o lead "ganha" a atribuição**. Runs
posteriores que recoletam o mesmo place_id NÃO devem sobrescrever
`campaign_code` nem `bot_run_id`.

Supabase JS não tem suporte direto a `COALESCE` no upsert. Duas opções:

### Opção A (preferida) — RPC custom

Criar função SQL no banco:

```sql
-- Aplicar uma vez via Supabase SQL Editor
CREATE OR REPLACE FUNCTION upsert_lead_preserving_campaign(payload jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO leads (
    place_id, business_name, niche, country, outreach_channel,
    rating, review_count, campaign_code, bot_run_id, owner_probability
    -- adicionar resto dos campos do payload conforme necessário
  )
  VALUES (
    payload->>'place_id',
    payload->>'business_name',
    payload->>'niche',
    payload->>'country',
    payload->>'outreach_channel',
    (payload->>'rating')::numeric,
    (payload->>'review_count')::int,
    payload->>'campaign_code',
    (payload->>'bot_run_id')::uuid,
    (payload->>'owner_probability')::smallint
  )
  ON CONFLICT (place_id) DO UPDATE SET
    -- campos atualizáveis (sobrescrevem)
    rating         = EXCLUDED.rating,
    review_count   = EXCLUDED.review_count,
    business_name  = EXCLUDED.business_name,
    -- campos sticky (preservam valor histórico)
    campaign_code  = COALESCE(leads.campaign_code, EXCLUDED.campaign_code),
    bot_run_id     = COALESCE(leads.bot_run_id, EXCLUDED.bot_run_id),
    -- owner_probability pode atualizar (heurística pode ter melhorado)
    owner_probability = EXCLUDED.owner_probability;
END;
$$;
```

E no bot-server:

```js
await supabase.rpc('upsert_lead_preserving_campaign', { payload: leadObj })
```

### Opção B (mais barata, race-y) — check-then-upsert

```js
// 1. Read
const { data: existing } = await supabase
  .from('leads')
  .select('campaign_code, bot_run_id')
  .eq('place_id', lead.place_id)
  .maybeSingle()

// 2. Decide
const upsertPayload = {
  ...leadFields,
  campaign_code: existing?.campaign_code ?? runContext.campaign_code,
  bot_run_id: existing?.bot_run_id ?? runContext.bot_run_id,
  owner_probability: scoreOwner(lead, niche),
}

// 3. Upsert
await supabase.from('leads').upsert(upsertPayload, { onConflict: 'place_id' })
```

Race window: se 2 runs coletam o mesmo place_id em < 100ms, ambos podem ler
NULL e sobrescrever. Aceitável dado o volume atual (1 run por vez).

**Recomendação:** Opção B no início (5min de mudança), migrar pra Opção A
quando volume justificar.

---

## 4. `scoreOwner` — heurística stub

Função simples baseada em regex, sem chamada externa. Plug-ar na qualify step:

```js
// prospect-bot/lib/owner-score.js
const RECEPTIONIST_NAME_RE = /^(dr\.?\s|dra\.?\s|cl[íi]nica\s)/i
const RECEPTIONIST_ADDR_RE = /(sala|andar|conjunto|cj)\s*\d/i

const PRIORITY_NICHES = new Set([
  'salões de beleza',
  'floriculturas',
  'fisioterapeutas',
  'nutricionistas',
  'lojas de roupas',
  'academias',
])

function scoreOwner(lead, niche) {
  let score = 50

  // business_name suggests receptionist business
  if (lead.name && RECEPTIONIST_NAME_RE.test(lead.name)) score -= 25

  // address suggests commercial/clinic with reception
  if (lead.formatted_address && RECEPTIONIST_ADDR_RE.test(lead.formatted_address)) {
    score -= 15
  }

  // priority niches tend to be owner-run
  if (niche && PRIORITY_NICHES.has(niche)) score += 20

  // sweet spot reviews (per TOP_OF_FUNNEL_AUDIT.md §2)
  const reviews = lead.user_ratings_total ?? 0
  if (reviews >= 30 && reviews <= 300) score += 20
  else if (reviews >= 300 && reviews <= 1000) score += 10
  else if (reviews < 10) score -= 15
  else if (reviews > 1000) score -= 25  // bot wall

  // cap
  return Math.max(0, Math.min(100, score))
}

module.exports = { scoreOwner }
```

Usar no qualify step antes do upsert. Score 0-100. Recomendação: começar
sem aplicar como filtro (só registrar no banco), medir distribuição de
`owner_probability` em leads que viram PRICE_REACHED vs BOT_ONLY ao longo
de 100+ envios, então calibrar threshold.

---

## 5. Validação após aplicar

1. Pequeno run com `dry_run=true` e `limit=5` no /bot UI.
2. Esperar terminar.
3. Query de validação:

```sql
SELECT
  place_id,
  business_name,
  niche,
  campaign_code,
  bot_run_id,
  owner_probability,
  outreach_sent_at
FROM leads
WHERE bot_run_id = '<uuid-do-run-recém-criado>'
ORDER BY business_name;
```

Esperado: 5 linhas (ou até 5), todas com `campaign_code` preenchido (igual
ao `params.market` do run), `bot_run_id` preenchido, `owner_probability`
entre 0 e 100.

Se vier null em `campaign_code` → bot-server não está propagando. Revisar
todos os pontos de upsert.

---

## 6. Rollback

Se algo quebrar:

1. Bot-server: reverter o commit. Bot continua funcionando — campos novos
   são opcionais no schema (todos com NULL default).
2. Admin: payload com `campaign_code` extra é ignorado pelo bot-server
   antigo. Não precisa rollback.
3. Migration: as colunas adicionadas são nullable e não substituem nada.
   Pode ficar no banco mesmo se reverter o código.

Risco real de quebra: **muito baixo.** A migração é puramente aditiva. O
único risco é o bot-server tropeçar em campos desconhecidos no payload.
Validar com dry_run pequeno antes de promover.
