# GTM Lab — Audit Técnica e Recomendação Arquitetural

Data: 2026-04-28.
Pergunta: vale criar uma rota `/gtm-lab` separada pra rodar experimentos sem contaminar produção?

**Resposta curta: não.** O `/bot` atual já é a rota de experimentos — o mecanismo de isolamento existe (`code` em `lib/bot-config.ts`). O que falta é tagueio explícito de 3 campos. Custo total: 1 migração + 1 toggle de UI + 3 linhas no bot-server. Sem nova rota, sem nova UI, sem refactor.

---

## TL;DR (3 linhas)

1. **Cada `code` em `lib/bot-config.ts` (BR, BR-WA-PREVIEW, US-WA, US-EM, US-SMS) já é um experimento isolado** — niches, cities, qualificationFilters, channel, previewFirst são todos parametrizados por campaign. O motor de experimentos existe.
2. **A diferença entre "experimento" e "produção" não é UI — é definição de campanha.** BR-WA-PREVIEW (R$ 997 fixo, estética, 3 cidades, preview-first) é um experimento ATIVO rodando hoje pela mesma rota /bot que dispara BR legacy.
3. **O gap real é traceability**: leads não carregam `campaign_code` nem `bot_run_id` no schema, então não dá pra filtrar/comparar resultados por experimento depois. Adicionar 3 colunas resolve.

---

## 1. Como o `/bot` funciona hoje — fluxo real

```
┌──────────────────────────────────────────────────────────────────┐
│ /bot (UI Next.js — admin)                                        │
│   components/bot/bot-client.tsx                                  │
│   - dropdown country = code da campanha (BR, BR-WA-PREVIEW, ...) │
│   - read-only: COUNTRIES de lib/bot-config.ts                    │
│   - input: limit, min_score, max_projects, per_instance_send,    │
│            qualification_filters (override)                       │
│   - botão Run                                                    │
└────────────────────┬─────────────────────────────────────────────┘
                     │ POST
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ /api/bot/run-auto/route.ts (admin server route)                  │
│   1. INSERT bot_runs row (status=running)                        │
│   2. POST {BOT_SERVER_URL}/run-auto com:                         │
│      - market params (niches, cities, lang, country, channel,    │
│        previewFirst, qualificationFilters)                       │
│      - evolutionInstances (apiKey + maxThisRun por chip)         │
│   3. Receba runId do bot-server, atualiza bot_runs.server_run_id │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ BOT-SERVER (REPO SEPARADO — black box deste repo)                │
│   prospect-bot/server.js                                         │
│   Pipeline:                                                      │
│     collect (Google Places Search por niche×city)                │
│     → qualify (filters: minRating, recent reviews, op status,    │
│                franchise blacklist, no_website, etc)             │
│     → score (pain_score, opportunity_score)                      │
│     → for each lead: INSERT INTO leads (place_id, niche, city,   │
│         country, evolution_instance, outreach_channel,           │
│         pain_score, score_reasons, ...)                          │
│     → IF previewFirst:                                           │
│           generate Claude Code prompt + Getimg images,           │
│           INSERT INTO projects (place_id, claude_code_prompt,    │
│           generated_images, status='approved')                   │
│       ELSE (BR legacy):                                          │
│           compose mensagem via Anthropic, dispatch via Evolution │
│           UPDATE leads (outreach_sent=true, outreach_sent_at,    │
│           evolution_instance), INSERT INTO conversations         │
└────────────────────┬─────────────────────────────────────────────┘
                     │ when previewFirst, leads sit in
                     │ "Prompt pronto" kanban
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ Levi roda Claude Code local na pasta ~/previews/{slug}           │
│ Cola URL Vercel no admin → projects.preview_url                  │
└────────────────────┬─────────────────────────────────────────────┘
                     │ admin clica "Disparar preview"
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ /api/projects/[place_id]/dispatch-preview/route.ts (admin)       │
│   1. compose mensagem (Sonnet) com URL embedded + ?v={place_id}  │
│   2. dispatchMessage (lib/messages/dispatch.ts) via Evolution    │
│   3. UPDATE projects (preview_sent_at, status='preview_sent')    │
│   4. INSERT INTO conversations (direction='out')                 │
│   5. recordOutboundMessage transitions lead.status               │
└──────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ Lead recebe WhatsApp → opens preview → public/track.js beacon    │
│   POST /api/preview-view → INSERT INTO preview_views             │
│   (BUG ATIVO: track.js não está sendo embutido — ver             │
│    GTM_DIAGNOSIS.md §4)                                          │
│                                                                  │
│ Lead responde WhatsApp → Evolution webhook                       │
│   POST /api/webhook/whatsapp → 5 estratégias de match            │
│   INSERT INTO conversations (direction='in')                     │
│   UPDATE leads.last_human_reply_at                               │
└──────────────────────────────────────────────────────────────────┘
```

**O bot-server é black box deste repo.** Toda lógica de coleta, qualificação, scoring, dispatch (legacy BR) e geração de Project (preview-first) roda em outro repo. Admin é orquestrador + interface.

**Dispatch-preview, em contraste, roda 100% no admin** porque depende de input manual do Levi (preview_url) e usa Anthropic + Evolution diretamente.

---

## 2. Como o schema atual suporta isso

Tabelas envolvidas no fluxo do bot e o que cada uma faz:

| Tabela                        | Função no fluxo                                      | Linkagem ao "experimento"     |
|-------------------------------|-----------------------------------------------------|-------------------------------|
| `leads`                       | Persistência de cada negócio coletado/qualificado   | **niche / country / outreach_channel / evolution_instance** stampados — sem `campaign_code` direto |
| `projects`                    | Estado do entregável (preview, ajustes, paid)       | Sem link explícito a experimento |
| `conversations`               | Inbox unificado (in/out, multi-channel)             | Por place_id → herda de leads |
| `bot_runs`                    | Histórico de execuções do bot                       | Sem niche/city/lang (dropados em 2026-04-18) — **sem campaign_code** |
| `evolution_instance_config`   | Daily cap por chip                                  | N/A                           |
| `preview_views`               | Beacons de abertura do preview                      | Por place_id                  |
| `webhook_inbound_quarantine`  | Inbounds não-attribuídos                             | N/A                           |

**Campos do `leads` relevantes pra experimentação:** place_id, business_name, niche, country, city, address, phone, email, outreach_sent, outreach_sent_at, **outreach_channel** (whatsapp/email/sms), **evolution_instance** (qual chip enviou), pain_score, score_reasons, opportunity_score, status, status_updated_at.

**Gap explícito no schema:**
- Sem `campaign_code` em `leads` — não dá pra filtrar leads de um experimento específico sem inferir por niche+country+outreach_channel.
- Sem `bot_run_id` em `leads` — não dá pra atribuir um lead ao run que coletou.
- Sem `outreach_variant` em `leads` — A/B de copy é impossível medir.
- `bot_runs` perdeu `niche`, `city`, `lang` em 2026-04-18 (drop intencional). Sem reverter, não dá pra saber retroativamente qual market um run específico atacou.

---

## 3. O que JÁ É um experimento na arquitetura existente

```ts
// lib/bot-config.ts (já existe)
COUNTRIES = [
  { code: 'BR',             niches: [...], cities: [...], previewFirst: false, ... },
  { code: 'BR-WA-PREVIEW',  niches: ['estética'], cities: [3 cidades], previewFirst: true, qualificationFilters: { minRating: 3.5, ... }, ... },
  { code: 'US-EM',          niches: [...], cities: [...], channel: 'email', ... },
  { code: 'US-WA',          niches: ['handyman', ...], cities: [hispanic-dense], previewFirst: true, ... },
  { code: 'US-SMS',         niches: [...], channel: 'sms', ... },
]
```

Cada `code` carrega:
- niche set isolado
- city set isolado
- qualification filters próprios (minRating, recentReviewMonths, requireOperational, franchiseBlacklist)
- channel próprio (whatsapp / email / sms)
- previewFirst flag (motion: dispatch direto vs gerar Project)

**Tudo que tu listou como "experiment_id, niche_cluster, preview_timing" já é parametrizado por campaign.** Adicionar um novo experimento = adicionar um novo objeto em `COUNTRIES`. Sem migração. Sem nova rota.

Exemplo: pra testar "BR-WA-PREVIEW com floricultura em vez de estética", a entrada já existe pronta — copiar BR-WA-PREVIEW, mudar niches/cities, novo code:

```ts
{
  code: 'BR-WA-PREVIEW-FLORI',
  name: 'BR Preview-First (Floricultura)',
  country: 'BR', lang: 'pt', channel: 'whatsapp', previewFirst: true,
  qualificationFilters: { minRating: 4.8, recentReviewMonths: 12, requireOperational: true },
  niches: [{ category: 'Test', items: ['floriculturas'] }],
  cities: ['Campinas, SP', 'Sorocaba, SP', 'Ribeirão Preto, SP', ...],
}
```

Deploy admin → dropdown na /bot ganha "BR Preview-First (Floricultura)" → Levi roda → dados separados naturalmente porque niche+city são distintos.

---

## 4. Onde inserir experiment isolation — menor ponto de intervenção

### Atributos que tu listou e onde já estão / faltam

| Atributo                  | Estado                          | Onde adicionar                 |
|---------------------------|---------------------------------|--------------------------------|
| `experiment_id`           | **Faltando** (campaign code não persiste em leads) | `leads.campaign_code TEXT` + bot-server stamp |
| `copy_version`            | **Faltando**                    | `leads.outreach_variant TEXT`  |
| `offer_variant`           | Implícito em campaign code      | reusar `campaign_code` (BR-WA-PREVIEW-V1 vs BR-WA-PREVIEW-V2) OU `leads.offer_variant TEXT` se quiser desacoplar |
| `pricing_variant`         | Implícito em campaign + PLAYBOOK | reusar `campaign_code`         |
| `preview_timing`          | Existe — `cc.previewFirst`      | nada a fazer                   |
| `niche_cluster`           | Existe — `cc.niches`            | nada a fazer                   |
| `owner_probability_score` | **Faltando**                    | `leads.owner_probability INT` (0-100) — derivado em qualify step |
| `dispatch_batch_id`       | Existe parcial — `bot_runs.id`  | adicionar `leads.bot_run_id UUID REFERENCES bot_runs(id)` |

### Migração mínima recomendada (tudo idempotente, IF NOT EXISTS)

```sql
-- supabase/migrations/2026XXXX_experiment_tracking.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS campaign_code TEXT,
  ADD COLUMN IF NOT EXISTS outreach_variant TEXT,
  ADD COLUMN IF NOT EXISTS bot_run_id UUID REFERENCES bot_runs(id),
  ADD COLUMN IF NOT EXISTS owner_probability SMALLINT;

CREATE INDEX IF NOT EXISTS idx_leads_campaign
  ON leads (campaign_code) WHERE campaign_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_bot_run
  ON leads (bot_run_id) WHERE bot_run_id IS NOT NULL;

ALTER TABLE bot_runs
  ADD COLUMN IF NOT EXISTS campaign_code TEXT;

CREATE INDEX IF NOT EXISTS idx_bot_runs_campaign
  ON bot_runs (campaign_code, started_at DESC) WHERE campaign_code IS NOT NULL;

COMMENT ON COLUMN leads.campaign_code IS
  'Campaign code from lib/bot-config.ts (e.g., BR, BR-WA-PREVIEW). Stamped by bot-server on insert. Drives experiment segmentation in metrics.';
COMMENT ON COLUMN leads.outreach_variant IS
  'Optional A/B copy version stamp (e.g., V1, V2-roi-framing). Stamped at dispatch time. NULL = default variant.';
COMMENT ON COLUMN leads.bot_run_id IS
  'Which bot_runs row created this lead. NULL = pre-instrumentation or manual insert.';
COMMENT ON COLUMN leads.owner_probability IS
  'Heuristic 0-100 score for "this WhatsApp number reaches the decision-maker". Computed in qualify step from business_name regex + address regex + niche+reviews intersection. See TOP_OF_FUNNEL_AUDIT.md §7.';
```

**4 colunas, 3 índices, 1 FK. Idempotente. Não muda nada do que existe — só adiciona.**

---

## 5. Mudanças mínimas em código

### 5.1 admin (`fastdevbuilds-admin`)

#### `app/api/bot/run-auto/route.ts` — ~3 linhas adicionadas

Passa `campaign_code` no payload pro bot-server e stampa em `bot_runs`:

```ts
// Onde já cria bot_runs:
const { data: run } = await supabase
  .from('bot_runs')
  .insert({
    status: 'running',
    campaign_code: params.market,  // <-- ADD
  })
  .select('id')
  .single()

// Onde já chama bot-server:
body: JSON.stringify({
  ...params,
  campaign_code: params.market,  // <-- ADD
  bot_run_id: run?.id,           // <-- ADD
  ...(cc ? { ... } : {}),
  evolutionInstances,
  evolutionApiUrl: process.env.EVOLUTION_API_URL,
})
```

#### `app/api/projects/[place_id]/dispatch-preview/route.ts` — opcional, ~2 linhas

Aceita `outreach_variant` no body e stampa no lead antes do dispatch:

```ts
const variant = typeof body?.outreach_variant === 'string' ? body.outreach_variant : null
if (variant) {
  await supabase.from('leads').update({ outreach_variant: variant }).eq('place_id', place_id)
}
```

(Stub — só implementar quando começar A/B real.)

#### `lib/metrics.ts` — adicionar filtro/segmento

Já tem `byNiche`, `byCity`, `byChannel`, `byInstance`. Adicionar `byCampaign`:

```ts
const byCampaign = topSegments(
  groupByKey(pairs, (l) => l.campaign_code?.trim() || null),
)
```

E aceitar query param `?campaign=BR-WA-PREVIEW` no `/api/metrics` pra ver dashboard de 1 experimento isolado.

#### `components/bot/bot-client.tsx` — opcional, sem mudança hoje

A UI já oferece dropdown de campanha (`country`). Nada a adicionar imediatamente. Quando começar A/B de copy, adicionar campo `outreach_variant` (text livre) com default null.

### 5.2 bot-server (repo separado) — 2 lugares

Esse é o único trabalho fora do admin. Dois pontos no bot-server precisam mudar:

1. **Aceitar `campaign_code` e `bot_run_id` do payload** (parsing + propagação interna).
2. **Stampar em cada `leads.upsert`**:

```js
// prospect-bot/steps/qualify.js (ou equivalente)
await supabase.from('leads').upsert({
  place_id: lead.place_id,
  business_name: lead.name,
  niche: lead.niche,
  country: payload.country,
  outreach_channel: payload.channel,
  // ... campos atuais
  campaign_code: payload.campaign_code,    // <-- ADD
  bot_run_id: payload.bot_run_id,          // <-- ADD
  owner_probability: scoreOwner(lead),     // <-- ADD se quiser P1
})
```

`scoreOwner(lead)` é uma heurística simples (regex em business_name + address — ver `TOP_OF_FUNNEL_AUDIT.md` §7). Pode ser stub null no início e populado depois.

**Total de mudança no bot-server: ~10 linhas + 1 função heurística.**

---

## 6. Por que NÃO criar `/gtm-lab`

### O que tu pediu pra ter em /gtm-lab e onde já existe ou não compensa

| Funcionalidade pedida              | Onde existe / pode existir                                                              |
|------------------------------------|------------------------------------------------------------------------------------------|
| seleção obrigatória de experiment_id | ✅ /bot já força escolha de campanha (dropdown country). Adicionar default `enabled` lock. |
| dry run forte                      | ✅ /bot já tem `autoDryRun` e `autoSend=false` no bot-client.tsx                          |
| preview dos leads antes de disparar | ⚠ Parcial — /bot mostra `queue` (próximos niche/city). Adicionar lista de leads concretos exigiria mudança no bot-server (retornar candidates antes de qualificar fully). Não vale o custo agora. |
| snapshot congelado do experimento   | ❌ **Overkill.** O snapshot é o conjunto de leads com `campaign_code = X` mais `bot_run_id` específico. SQL faz isso. |
| auto-tagging dos leads             | ✅ Resolvido com a migração de campaign_code.                                            |
| kill switch                        | ⚠ Hoje "kill switch" = parar de chamar /run-auto. Não precisa botão. Se quiser explicitar: adicionar `bot_runs.status='cancelled'` (já existe). |
| pause experiment                   | Idem kill switch — não há "experimento rodando em loop". Cada run é one-shot. |
| métricas por experimento           | ✅ Resolvido com `byCampaign` em `lib/metrics.ts` + filtro `?campaign=X` em /metrics.    |
| resultado separado da produção     | ✅ Resolvido com filtro por campaign_code.                                              |
| sem misturar testes com operação   | ✅ Já não mistura — cada lead vem com niche/city/channel da sua campanha. Adicionar campaign_code só formaliza o que já é estruturalmente verdade. |

**Custo de criar `/gtm-lab` separado:**
- Nova rota Next.js + componente cliente (~300 linhas).
- Duplicação de lógica de bot-config consumption.
- Outra UI pra manter sincronizada com mudanças no /bot.
- Risco de ficar com `/bot` desatualizado e `/gtm-lab` virar a "verdade" — ou vice-versa.
- Tempo Levi ≥ 4-8h.

**Custo de adicionar 4 colunas + propagar campaign_code:**
- 1 migration (10 min).
- 3 linhas em /api/bot/run-auto (5 min).
- 10 linhas no bot-server (15 min, em outro repo).
- ~20 linhas em lib/metrics.ts pra `byCampaign` (15 min).
- Total: 1h.

**Não vale criar /gtm-lab.** Custo 6-8x maior pra entregar o mesmo valor (isolamento + métricas separadas).

---

## 7. Plano de implementação em fases

### Fase A — Tagueio mínimo (P0, ~1h)

1. Migration `2026XXXX_experiment_tracking.sql` — adicionar 4 colunas + 3 índices + 1 FK.
2. `app/api/bot/run-auto/route.ts` — passar `campaign_code` e `bot_run_id` no payload, stampar em bot_runs.
3. **Bot-server (repo separado)** — aceitar campos novos, stampar em leads.upsert.
4. Verificar: rodar 1 run pequeno (limit=5) com `dry_run=true`, ver se leads vêm com `campaign_code` e `bot_run_id` preenchidos.

### Fase B — Métricas filtradas (P1, ~30min)

5. `lib/metrics.ts` — adicionar `byCampaign` em SegmentRow agregação.
6. `/api/metrics?campaign=X` — aceitar query param.
7. UI `/metrics` — adicionar dropdown "campanha" pra filtrar dashboard.

### Fase C — Owner heuristic (P1, ~30min)

8. **Bot-server** — `scoreOwner(lead)` em qualify step:
   - +30 se business_name não match `/^(dr|dra|cl[ií]nica)/i`
   - +20 se address não contém `(sala|andar|conjunto|cj)\s*\d`
   - +20 se niche em ['salões', 'floriculturas', 'fisio', 'nutri', 'roupas']
   - +30 se review_count entre 30 e 300
   - cap 100, min 0
9. Stampar em `leads.owner_probability`.
10. Atualizar predicado HOT no collector pra exigir `owner_probability >= 60`.

### Fase D — A/B copy variant (só se tu confirmar EXP-003 vai rodar) (~30min)

11. `app/api/projects/[place_id]/dispatch-preview/route.ts` — aceitar `outreach_variant` no body.
12. UI — botão "Disparar preview" ganha sub-dropdown "variante" (text livre, default null).
13. `lib/metrics.ts byCampaign` ganha sub-corte por `outreach_variant`.

### Fase E — Reservada (não fazer hoje)

- Materialized view `experiments_summary` pra dashboard performance.
- UI dedicada `/experiments` listando campanhas ativas + métricas top-line.
- Snapshot/freeze de experimento como entidade.
- Kill switch UI button.

---

## 8. Decisões importantes (com justificativa)

### Decisão 1: campaign_code como TEXT, não FK pra tabela `campaigns`

**Justificativa:** campanhas são definidas em `lib/bot-config.ts` (typescript const), versionadas via git. Migrar pra tabela DB exige sync entre código e DB e ganho zero. Manter como TEXT free-form, validar no admin contra `COUNTRIES` array.

**Trade-off:** se criar campanha X em código mas typo no DB, vira lixo silencioso. Mitigar com validation no /api/bot/run-auto (recusar se `params.market not in COUNTRIES.codes`).

### Decisão 2: `outreach_variant` opcional, NULL = default

**Justificativa:** 90% dos sends serão "default variant". Forçar variante exigiria backfill + lógica null-handling em todo lugar.

### Decisão 3: bot_run_id como FK opcional

**Justificativa:** leads pre-existentes (~5000) não têm bot_run_id e nunca terão. NULL é estado válido. FK garante que bot_run_id, quando preenchido, aponta pra run real.

### Decisão 4: owner_probability SMALLINT 0-100

**Justificativa:** mesma escala que opportunity_score (já no banco como smallint). Permite predicado SQL simples (`owner_probability >= 60`). Não confundir com opportunity_score atual (0-5) que está praticamente null em todo o banco e provavelmente vai ser descomissionado.

### Decisão 5: stampar campaign_code no bot-server, não no admin

**Justificativa:** o bot-server é quem sabe quando o lead está sendo "criado pela primeira vez". Admin sabe somente quando o lead já existe. Stampar no admin exigiria UPDATE pós-bot, race condition possível. Bot-server tem a info nativa, é só passar adiante.

**Implicação:** o bot-server precisa ser tocado. Se Levi não tem capacidade de mexer no bot-server agora, a alternativa B é stampar no admin via webhook ou pós-run job. **Mas isso é frágil.**

---

## 9. Riscos e o que pode quebrar

### Risco 1: bot-server não preserva campos novos

Se bot-server fizer `INSERT INTO leads` com lista explícita de colunas e não incluir `campaign_code`, o stamp não persiste. **Mitigação:** revisar todos os pontos de upsert no bot-server (provavelmente 1-2). Adicionar teste de 1 run pequeno com dry_run + validar SELECT depois.

### Risco 2: `bot_run_id` race condition

Bot-server cria leads em paralelo. Se 2 runs paralelos coletarem o mesmo place_id, o primeiro vence (ON CONFLICT) e o segundo perde a atribuição. **Mitigação:** ON CONFLICT (place_id) DO UPDATE SET bot_run_id = COALESCE(bot_run_id, EXCLUDED.bot_run_id) — ou seja, primeiro run que tocou ganha, ninguém sobrescreve.

### Risco 3: campaign_code stale em leads que mudam de campanha

Se rodar campanha X que coleta lead Y, depois rodar campanha Y que recoleta lead Y, o campaign_code original some via UPDATE. **Mitigação:** mesma regra de COALESCE. Lead pertence à primeira campanha que encontrou. Se quiser tracking de re-tentativa, usa `bot_run_id` (que pode ser sobrescrito) vs `campaign_code` (sticky).

Alternativa mais robusta mas mais cara: tabela `lead_campaign_history` (place_id, campaign_code, run_id, attempted_at). **Não fazer hoje** — overengineering pra problema que não temos volume pra observar.

### Risco 4: filtro de métricas por campaign_code mostra 0 em leads pre-instrumentação

Os 605 leads pré-Fase-1 + 22 da Fase 1 atual NÃO têm campaign_code populado. **Mitigação:** rodar backfill 1x por inferência:

```sql
-- Backfill heurístico (rodar 1x após migration)
UPDATE leads SET campaign_code = 'BR-WA-PREVIEW'
  WHERE country = 'BR' AND outreach_channel = 'whatsapp'
    AND niche = 'clínicas de estética'
    AND outreach_sent_at >= '2026-04-28';

UPDATE leads SET campaign_code = 'US-WA'
  WHERE country = 'US' AND outreach_channel = 'whatsapp';

UPDATE leads SET campaign_code = 'BR'
  WHERE campaign_code IS NULL AND country = 'BR' AND outreach_channel = 'whatsapp';
```

Não é perfeito (algumas semelhanças entre BR e BR-WA-PREVIEW) mas é "good enough" pra retroactivamente segmentar.

### Risco 5: Levi não consegue tocar no bot-server

Se o bot-server estiver em estado frágil ou não acessível pra mudança, **a Fase A trava no passo 3**. Alternativa B (mais frágil): UPDATE post-run via admin que pega leads com `outreach_sent_at >= run.started_at` e stampa `campaign_code`. Funciona mas race-y.

---

## 10. O que NÃO fazer (overengineering identificado)

1. **Não criar `/gtm-lab` como rota separada.** /bot já é a rota.
2. **Não criar tabela `experiments`.** Campanhas são código, não dados.
3. **Não criar tabela `lead_campaign_history`.** Volume não justifica.
4. **Não criar UI de "kill switch experiment".** Stop chamando /run-auto.
5. **Não criar UI de "snapshot frozen experiment".** SELECT WHERE campaign_code = X já é o snapshot.
6. **Não criar dashboards comparativos novos.** /metrics + filtro de campaign já dá A/B.
7. **Não bloquear /bot pra "modo produção only".** /bot já é a rota de tudo.
8. **Não materializar campaign_code antes de adicionar a 4ª campanha.** Hoje há 5 campanhas (BR, BR-WA-PREVIEW, US-WA, US-EM, US-SMS) — mas só 2 ativas (BR e BR-WA-PREVIEW). Se daqui a 6 meses tiver 1 só ativa de novo, valor de filtragem é menor.
9. **Não construir owner_probability como serviço separado.** É 1 função com 3 regex no qualify step.
10. **Não construir API de "rerun experiment X com tweak Y".** O experimento é o code config — duplicar e mudar é o pattern. Versionar via git, não via API.

---

## 11. Conclusão dura

### "Devo construir /gtm-lab agora?"

**Não.** Construir uma rota separada pra experimentação é resolver o problema errado. O /bot atual JÁ separa experimentos — só não rotula explicitamente.

### "Só preciso adicionar experiment_id?"

**Quase exatamente isso.** Adicionar:
- `leads.campaign_code TEXT` (= "experiment_id")
- `leads.bot_run_id UUID` (= "dispatch_batch_id")
- `leads.outreach_variant TEXT` (= "copy_version")
- `leads.owner_probability SMALLINT` (= "owner_probability_score")
- `bot_runs.campaign_code TEXT` (pra historiar runs por experimento)

E propagar nos 2 pontos de write (admin /api/bot/run-auto + bot-server qualify step).

### "O topo inteiro precisa redesign?"

**Não.** O motor (collector + qualifier + scoring + dispatch) está funcionando. O que falta é instrumentação de tracking, não refactor.

### Custo total da implementação

- Migration: 10min
- /api/bot/run-auto: 5min
- bot-server: 15min (repo separado)
- lib/metrics.ts byCampaign: 15min
- Backfill heurístico: 5min
- Validação 1 run dry: 10min

**~1h trabalho.** Resultado: cada lead novo carrega o experimento que o gerou, /metrics filtra por campanha, A/B fica habilitado.

### Quando reconsiderar /gtm-lab

Quando tiver 5+ campanhas ATIVAS simultaneamente E precisar de UI de gestão por experimento (ex: pausar campanha X via UI sem mexer em código, ou criar campanha via formulário sem PR). **Hoje tem 2 ativas (BR legacy + BR-WA-PREVIEW). Não justifica.**

---

## 12. O que mudar ESTA SEMANA

### P0 (essa semana, ~1h)

1. Criar migration `2026XXXX_experiment_tracking.sql` com as 4 colunas + 3 índices + 1 FK.
2. Atualizar `/api/bot/run-auto/route.ts` pra passar `campaign_code` + `bot_run_id` no payload.
3. **Tocar no bot-server (repo separado):** propagar `campaign_code` e `bot_run_id` em todos os pontos onde lead é upserted.
4. Backfill SQL pra leads pré-existentes (script acima, §9 risco 4).
5. Validar com 1 dry run pequeno antes de promover.

### P1 (essa semana ou próxima, ~30min)

6. Adicionar `byCampaign` em `lib/metrics.ts` + query param `?campaign=X` em `/api/metrics`.
7. UI `/metrics` ganha dropdown "campanha" (default = "Todos").

### P2 (depois da Fase 1 fechar)

8. Implementar `scoreOwner` no bot-server e popular `owner_probability` em novos leads.
9. Aplicar filtro `owner_probability >= 60` no predicado HOT do collector — esperar 50+ envios e medir se BOT_ONLY+RECEPTIONIST cai abaixo de 30%.
10. Adicionar suporte a `outreach_variant` no dispatch só quando EXP-003 for rodar.

### Não fazer

- Não construir /gtm-lab.
- Não criar tabela `experiments`.
- Não criar dashboards novos.
- Não duplicar UI do /bot.
- Não tocar em UX existente além do dropdown novo no /metrics.

---

## Reconciliação com docs anteriores

- **GTM_DIAGNOSIS.md** §6 P2 sugeriu adicionar `outreach_variant`. Aqui está plano concreto.
- **EXPERIMENT_LOG.md** EXP-002 fala da Fase 1 ativa — adicionar `campaign_code='BR-WA-PREVIEW'` no backfill cobre os 22 leads atuais.
- **TOP_OF_FUNNEL_AUDIT.md** §7 propôs heurística owner_probability. Aqui está onde plug-ar (`bot-server qualify step` + `leads.owner_probability`).
- **EXP_000_HISTORICAL_AUTOPSY.md** §7 mostrou que 23% das replies são receptionist — `owner_probability` é a alavanca pra reduzir.

Tudo conecta no mesmo grafo: 4 colunas + 1 heurística destravam segmentação por experimento, A/B de copy, e owner-aware qualification — sem rota nova.
