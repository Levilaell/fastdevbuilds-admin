# AUDIT-REPORT-CLEANUP-V2.md — Segunda rodada de enxugamento

**Data:** 2026-04-18
**Escopo:** 8 novas áreas candidatas a overengineering (A, B, D, E, F, G, H, I — a letra C foi pulada intencionalmente). Read-only.
**Contexto:** V1 já foi aplicado — `approve-proposal`+`pix`, follow-up automation inteira, auto-reply Tier 2 e status `finalizado`/`pago` saíram. Colunas `next_follow_up_at`/`follow_up_count`/`follow_up_paused`/`pix_key` dropadas. Operator single-person, zero vendas, canal BR=WhatsApp (dashboard→bot-server), canal US=Email (Instantly, aquecendo). Bot no Railway, CRM no Vercel, Supabase compartilhado.

---

## Área A — Duplicação de config: `auto-config.js` (bot) vs `bot-config.ts` (CRM)

### Estado atual

Dois arquivos, 95%+ de conteúdo idêntico, em repositórios diferentes:

| Dimensão | `prospect-bot/lib/auto-config.js` | `admin/lib/bot-config.ts` |
|---|---|---|
| Niches BR | 20 | 20 (idênticos) |
| Niches US | 29 | 28 (`"pizza shops"` só no bot) |
| Cidades BR | ~100 | ~100 (idênticas) |
| Cidades US | 160 (com regions aninhadas) | 155 (lista plana) |
| Formato | JS module exportando `AUTO_CONFIG` | TS com tipos estáticos |

**Fluxo via dashboard** (99% dos runs em produção):
1. Dashboard lê `lib/bot-config.ts` para renderizar picker de niche/city.
2. `POST /api/bot/run-auto` (admin) envia `{ niches[], cities[], lang, country, evolutionInstances[], evolutionApiUrl }` no body JSON.
3. Bot-server recebe, escreve temp `/tmp/bot-config-*/config.json`, passa `--config <path>` pro `node prospect.js --auto`.
4. `prospect.js` lê o arquivo, popula `externalConfig`, chama `runAuto()`. **`externalConfig` tem prioridade sobre `AUTO_CONFIG` local.**

**Fluxo via CLI direto** (operator: "uso pra teste"):
- `node prospect.js --auto --market BR` (sem `--config`) → cai no fallback `AUTO_CONFIG` (auto-config.js). **Nunca consulta o CRM.**

### Achados importantes

**Dois source-of-truth sem sync.** `bot-config.ts` é a UI do dashboard; `auto-config.js` é o fallback standalone. Ambos têm listas canônicas de niches+cidades e podem divergir. Hoje divergem em 1 niche US e 5 cidades US.

**Direção do drift.** O bot tem 1 niche e 5 cidades a mais. Isso significa que o drift não é "dashboard propaga pra bot": é "alguém editou um lado e não o outro". Sem um sync mecânico, vai continuar divergindo.

**Risco operacional real.** Baixo-médio, com caveats:
- Runs via dashboard: `externalConfig` do CRM sobrescreve o local. Drift de `auto-config.js` não afeta produção.
- Runs via CLI: usam `auto-config.js`. Se operator adicionar niche no dashboard e rodar CLI depois, CLI não tem. Mas operator raramente usa CLI, e em produção dirige tudo pelo dashboard.
- Portanto: **o drift é cosmético em 99% dos fluxos, real em 1%**.

**Custo de unificar via HTTP (bot puxa do CRM em cada run).** Latência +100–300ms, nova dependência síncrona (CRM offline → bot não roda), failure mode novo. Não vale o troco para single-operator.

### Recomendação: **SIMPLIFICAR — reduzir `auto-config.js` a config mínima de teste**

Razão: `bot-config.ts` já é source-of-truth de facto (dashboard usa, produção usa via body JSON). `auto-config.js` só existe como fallback do `prospect.js --auto` sem `--config`. Esse fallback é usado apenas em debugging manual. Mantê-lo como "mirror parcial da lista de produção" é o pior dos mundos — parece canônico mas está errado.

Reduzir `auto-config.js` para:
- 2 niches BR + 3 cidades BR (para teste rápido)
- 2 niches US + 3 cidades US (para teste rápido)
- Comentário no topo: `// Test config only — produção usa body JSON enviado pelo dashboard`

Isso elimina ~300 linhas de config redundante e remove o risco de drift (não há mais mirror a divergir — o CLI passa a rodar explicitamente com escopo reduzido para debug).

**Alternativa considerada e rejeitada:** deletar `auto-config.js` inteiro e exigir `--config`. Quebra o CLI standalone que operator usa pra teste. Perde mais do que ganha.

**Alternativa considerada e rejeitada:** CRM puxa `auto-config.js` do bot via HTTP. Inverte a direção de autoridade (bot vira source), quebra o picker do dashboard, introduz dependência cruzada.

### Se simplificar: o que precisa ser tocado

**Arquivos (bot repo):**
- `prospect-bot/lib/auto-config.js` — reduzir a ~40 linhas (2+3 BR, 2+3 US, header comentário).

**Arquivos (admin repo):**
- Nenhum. `bot-config.ts` é o canônico e já serve o dashboard.

**SQL:** nenhum.

### Risco de mexer

**MUITO BAIXO.**
- Produção (runs via dashboard) passa `externalConfig` completo; nunca toca `AUTO_CONFIG`.
- CLI standalone continua funcional, só com menos escopo default — e operator pode passar `--config` se quiser rodar grande via CLI.
- Drift elimina-se por construção.

Risco residual único: se houver alguma script/cron externo rodando `prospect.js --auto` sem `--config` em produção. Verificar antes:
```bash
# No Railway: conferir se há cron/worker que invoca prospect.js sem --config
grep -r "prospect.js.*--auto" prospect-bot/ | grep -v "\-\-config"
```

---

## Área B — Duplicação `prospect.js` (CLI) vs `steps/auto.js`

### Estado atual

| | `prospect-bot/prospect.js` | `prospect-bot/steps/auto.js` |
|---|---|---|
| Linhas | 546 | 356 |
| Propósito | CLI entrypoint (manual + auto) | Módulo interno consumido por `prospect.js` |
| Callable standalone | Sim (`node prospect.js ...`) | Não — só via `runAuto()` |

**Flags CLI aceitas por `prospect.js`:**
```
--niche <str>, --city <str>, --limit <num>, --export csv|supabase|both,
--lang en|pt, --min-score <num>, --dry, --send, --auto,
--market BR|US|all, --config <path>, --max-send <num>
```

`steps/auto.js` `runAuto({ minScore, dry, send, limit, market, externalConfig, maxSend })` — sem CLI próprio.

**Lógica compartilhada (importada de `steps/*`):** `collect`, `analyze`, `score`, `generateMessages`. Ambos caminhos passam pelos mesmos steps.

**Lógica duplicada inline (~150 linhas):**
- **Dedup Supabase (`place_id` filter):** `prospect.js` L.343–372 vs `auto.js` L.44–71. Estruturalmente idênticas.
- **Pipeline collect→analyze→score:** `prospect.js` main() L.378–450 vs `auto.js` processItem() L.24–185. Mesmo padrão, auto.js adiciona phone filter BR.

**Features exclusivas:**
- `prospect.js` tem CSV export, `printSummary()`, visual analysis invocado standalone.
- `auto.js` tem phone filter BR, queue loop, `maxSend` stop logic.

### Achados importantes

**Duplicação custosa em risco, barata em manutenção atual.** Um bug no dedup de `prospect.js` não aparece em `auto.js` e vice-versa. Na prática, 0 bugs desse tipo reportados — operator raramente toca esses paths.

**`prospect.js` CLI é legitimamente útil para debug.** Rodar um niche/city específico com `--dry` pra ver o que sai do collect/score sem mandar nada. Deletar o manual mode inteiro remove isso. O `--auto` mode do `prospect.js` é thin wrapper sobre `runAuto()` — não tem duplicação.

**Consolidação real seria refactor pesado.** Extrair um `sharedPipeline.js` exige reestruturar both paths, riscando behavior em produção (auto.js roda a cada hora no Railway). Para zero vendas, não é óbvio que vale.

**O debito técnico é real mas pequeno.** As 150 linhas duplicadas são estáveis — mexer em uma é raro, mexer nas duas junto é ainda mais raro. Risk profile baixo.

### Recomendação: **MANTER (débito sinalizado)**

Razões:
1. Refactor consolidador é custo significativo (4–8h) e risco médio (mexe em hot path de produção).
2. Drift de bugs nunca foi observado em prática.
3. CLI manual mode tem valor genuíno (debug de niche específico).
4. Deferir até o primeiro cliente — se volume de runs crescer e manutenção dobrar, aí sim consolidar.

**Ação única recomendada agora:** adicionar comentário no topo de `auto.js` e `prospect.js`:
```js
// NOTA: dedup (L.44–71 auto.js / L.343–372 prospect.js) e pipeline (L.24–185 / L.378–450)
// são intencionalmente duplicados. Se mexer, mexer nos dois. Consolidar quando tocar.
```

### Se consolidar (não recomendado agora): o que precisa ser tocado

**Refactor esboço:**
- Criar `prospect-bot/steps/pipeline.js` exportando `dedup(placeIds)`, `runPipeline(item, opts)`.
- `prospect.js` main() e `auto.js` processItem() passam a chamar o módulo.
- Manter features exclusivas (CSV, phone filter) nos callers.

**Risco:** médio. `runPipeline` tem que acomodar o phone filter BR de `auto.js` sem forçar `prospect.js` a passar por ele. Tempo estimado: 4–6h + teste end-to-end.

### Risco de mexer

- **Deixar como está:** risco BAIXO. Mesma taxa de bug observada até hoje.
- **Consolidar agora:** risco MÉDIO. Refactor num path que operator depende diariamente, sem testes automatizados. Pode introduzir regressão silenciosa (ex: dedup quebrado = bot manda mensagem repetida).

---

## Área D — AI suggestions: custo + qualidade + uso

### Estado atual

`lib/ai-workflow.ts:classifyAndSuggest` chama Claude Haiku 4.5 em **toda mensagem humana inbound** via:
- `app/api/webhook/whatsapp/route.ts:913-918` (após passar pelo filtro de auto-reply em L.837-887)
- `app/api/webhook/instantly/route.ts` (email inbound)

**Guard único:** `if (fullLead.data)` — só checa se lead existe. Sem filtro por `status`, `channel`, ou `last_ai_suggestion_at`.

**Saída:** insere row em `ai_suggestions` com `status='pending'`. Schema:
- `id` UUID, `place_id`, `conversation_id`, `intent` (interested|asked_price|asked_scope|objection|not_interested|scheduling|other), `confidence` 0–1, `suggested_reply` TEXT, `status` (pending|approved|rejected|sent), `created_at`, `approved_at`, `sent_at`.

**UI (`components/inbox/ai-suggestion-card.tsx`):** mostra intent+confidence, textarea editável com `suggested_reply`. Três ações:
- Approve → POST `/api/ai-suggestions/{id}/approve` → `dispatchMessage` envia (com edição se operator alterou) → `status='sent'`.
- Reject → `status='rejected'` sem envio.
- Dismiss → só remove da UI local (não toca banco).

**Dismiss automático:** `dismissPendingSuggestions()` é chamado quando operator envia resposta humana manual ou quando auto-reply é detectada — marca `status='rejected'` em pending.

**Throttle/dedup:** nenhum. 5 mensagens em 1 minuto do mesmo lead → 5 rows `pending` em `ai_suggestions`.

**Falha silenciosa:** se Haiku erra, `.catch(console.error)` engole. Lead inbound não recebe suggestion nova. Operator só vê pela ausência do card.

### Achados importantes

**Custo é trivial.** Haiku 4.5 (input $0.80/MT, output $4/MT):
- Input ~800 tokens (system prompt ~500 + user ~300) → $0.00064.
- Output ~200 tokens → $0.0008.
- **~$0.0014 por suggestion.** Em 10/dia: $0.014/dia = $0.43/mês. Em 100/dia: $4.30/mês. Nunca é o gargalo econômico.

**Desperdício escondido: gera pra lead em `disqualified`/`lost`.** Sem guard de status, se um lead disqualified manda msg (acontece quando bot manda e lead responde depois de dias), Haiku é chamado — output nunca será usado porque pipeline já descartou.

**Dedup barato faltando.** Lead humano que manda 5 msgs rápidas (pergunta fragmentada) gera 5 suggestions distintas. UI mostra 5 cards empilhados — ruído. Solução: antes de criar nova, se já existe `pending` pro mesmo lead (na mesma janela de 60s), **atualizar** a existente em vez de inserir.

**Qualidade do valor depende de métrica desconhecida.** Operator não falou se usa. Hipóteses:
- Se 70%+ das suggestions são approved (com ou sem edição): vale cada centavo.
- Se 70%+ são rejected/dismissed: custo é real mas benefício é ~zero.
- Sem medir, estamos no escuro.

**Falha silenciosa em produção.** Se Anthropic API cai ou o prompt começa a retornar JSON inválido, operator nunca sabe. Nem sequer um contador. Quebra observability.

### Recomendação: **INVESTIGAR (SQL) → SIMPLIFICAR**

**Passo 1 — medir (5 min de SQL):**

```sql
-- 1. Distribuição de status
SELECT status, COUNT(*) AS count,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM ai_suggestions
GROUP BY status
ORDER BY count DESC;

-- 2. Sugestões por lead-status (ver quantas são geradas pra leads terminais)
SELECT l.status AS lead_status, COUNT(ai.id) AS suggestions
FROM ai_suggestions ai
JOIN leads l ON l.place_id = ai.place_id
GROUP BY l.status
ORDER BY suggestions DESC;

-- 3. Quantas suggestions aprovadas foram editadas vs enviadas direto
-- (só dá pra saber se a conversation.message == ai_suggestion.suggested_reply —
-- aproximação)
SELECT
  COUNT(*) AS approved_or_sent,
  COUNT(*) FILTER (WHERE c.message = ai.suggested_reply) AS sent_unedited,
  COUNT(*) FILTER (WHERE c.message <> ai.suggested_reply) AS sent_edited
FROM ai_suggestions ai
JOIN conversations c ON c.id = ai.conversation_id
WHERE ai.status IN ('approved', 'sent') AND c.direction = 'out';

-- 4. Dedup check: múltiplas pending pro mesmo lead em < 2min
SELECT place_id, COUNT(*) AS pending_count, MIN(created_at), MAX(created_at)
FROM ai_suggestions
WHERE status = 'pending'
GROUP BY place_id
HAVING COUNT(*) > 1
ORDER BY pending_count DESC
LIMIT 20;
```

**Passo 2 — decisão:**

- **Se rejected+dismissed > 70% do total:** `DESATIVAR temporariamente`. Comentar chamada de `classifyAndSuggest` nos webhooks, manter tabela+UI pra reativar. Revisitar quando tiver mais volume de reply humano pra testar prompt diferente.
- **Se approved > 40% (com ou sem edição):** `SIMPLIFICAR`:
  1. Adicionar guard: pular classify se `lead.status IN ('disqualified', 'lost', 'closed')`.
  2. Adicionar dedup: se já existe `pending` pro lead criado < 60s atrás, `UPDATE` em vez de `INSERT`.
  3. Adicionar log observável: row em `ai_suggestions` com `status='failed'` quando Haiku erra (em vez de swallow). Ou no mínimo, incrementar um counter Prometheus/console.

### Se simplificar: o que precisa ser tocado

**Arquivos:**
- `lib/ai-workflow.ts` — em `classifyAndSuggest` (antes do insert), adicionar:
  ```ts
  if (['disqualified', 'lost', 'closed'].includes(fullLead.data.status)) return;
  // Dedup: se pending recente existe pro lead, update em vez de insert
  const { data: recent } = await svc.from('ai_suggestions')
    .select('id').eq('place_id', lead.place_id).eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - 60_000).toISOString())
    .maybeSingle();
  // depois: se recent, use update. Senão, insert atual.
  ```
- `lib/ai-workflow.ts` — no `.catch`, em vez de só console.error, fazer `insert` com `status='failed'` ou gravar métrica.

**SQL:** nenhum para migrar. Opcional: `ALTER TABLE ai_suggestions ADD COLUMN IF NOT EXISTS ... ` só se adicionar status='failed' ao CHECK.

### Risco de mexer

- **Medir (SQL):** zero.
- **Adicionar guards:** BAIXO. Reduz volume de chamadas Haiku mas não quebra existing suggestions.
- **Dedup:** BAIXO-MÉDIO. Tem edge case: se operator responde entre duas msgs rápidas do lead, o dismissed+updated pode race. Vale proteger com `last_updated_at` check.
- **Desativar:** BAIXO. UI degrada graciosamente — card simplesmente não aparece.

---

## Área E — Visual analysis via LLM

### Estado atual

`prospect-bot/steps/visual.js`:
- Puppeteer tira screenshot iPhone viewport (390x844, 2x scale, user-agent iOS Safari).
- Envia pro Claude Haiku 4.5 com `VISUAL_SYSTEM` prompt ("crítico severo, compara contra Apple/Stripe/Linear, score 7+ raro").
- Retorna JSON `{ visual_score: 0-10, visual_notes: [str, ...] }`.
- `max_tokens: 500`. Fallback em erro: `{ visual_score: null, visual_notes: [] }`.

**Gated por:** `!dry && process.env.ANTHROPIC_API_KEY` em `auto.js` L.135. Leads sem website pulam visual (direto `pain_score=10`).

**Uso downstream:**

1. **`score.js` (hard signal):**
   - `visual_score < 4` → `outdated_design` (+2 pts pain)
   - `visual_score <= 5` → `poor_visual_quality` (+1.5 pts)
   - `visual_score <= 6` → `mediocre_design` (+0.5 pts)
   - Impacto: soma no `pain_score` total (max 12). Qualify requer `pain_score >= minScore` (default 3).

2. **`message.js` (prompt input):**
   - `pickMainReason()` busca keywords ("broken", "placeholder", "error") em `visual_notes` → força `mainReason = 'visual_broken'` (highest priority).
   - Caso `poor_visual` → injeta primeira nota no user prompt: `Visual note to base the message on:\n- ${visual_notes[0]}`.
   - Sem visual_notes → fallback a generic reason (speed, outdated_tech, etc).

3. **CRM UI (`components/lead-detail/tech-analysis.tsx`):**
   - `visual_score` → ScoreCircle colorido (danger/warning/success).
   - `visual_notes` → bullet list (split por `,`).
   - Lead type inclui `visual_score: number | null` e `visual_notes: string | null`.

### Achados importantes

**Custo real: pequeno-médio.** Cálculo corrigido (agente anterior estimou 10–15¢ — errado em ~30x):
- Imagem ~1500–2000 tokens input + prompt system/user ~500 → ~2000 input tokens × $0.80/MT = $0.0016.
- Output ~500 tokens × $4/MT = $0.002.
- **~$0.0036 por lead com site.** Em 100 leads/dia (assumindo 80% com site): ~$0.29/dia = **~$9/mês**. Material mas não dramático.

**Valor é claro em dois lugares:** scoring (decide se qualifica) e message personalization (nota específica vira o gancho da primeira mensagem).

**Substituir por heurística pura seria grande recuo.**
- Scoring: dá pra aproximar com heurística (idade do domínio, meta viewport, fonts, CSS frameworks) mas a precisão cai. Hoje Haiku lê o layout como humano vê.
- Message: sem `visual_notes` específicas ("o botão 'Contato' redireciona pra erro 404", "as fotos estão pixeladas"), a mensagem vira genérica. Curva de response rate cai junto.

**Failure mode é gracioso.** Screenshot falha → null score → lead ainda pode qualificar por outros sinais (speed, pain). Zero dead ends.

**CRM expõe o output** — operator consegue validar "esse site tem score 3 e eu concordo, o design é datado mesmo". Não é caixa-preta.

### Recomendação: **MANTER**

Razões:
1. Custo é ~$9/mês em volume alvo. Baixo absoluto, baixo relativo (visual score afeta qualificação de leads — a própria escolha de quem receber mensagem depende disso).
2. Substituir por heurística é redução de qualidade com ganho marginal.
3. Failure mode já é graceful.
4. UI já expõe — operator tem visibilidade.

**Ações opcionais (não obrigatórias):**

- **Se volume subir além de 500 leads/dia:** considerar batchar screenshots (não roda uma por vez) ou pular visual para leads com `opportunity_score < 2` (não vale analisar sites de negócios com 0 avaliações).
- **Adicionar log de falha.** Hoje screenshot/LLM silencia. Em `visual.js`, se catch, incrementar contador ou gravar `visual_failed_at` no lead pra observability.

### Se simplificar (não recomendado): o que tocar

**Cenário hipotético "heurística pura":**
- Deletar `steps/visual.js` e `VISUAL_SYSTEM` em `lib/prompts.js`.
- Substituir em `score.js`: calcular `visual_score` a partir de sinais de `analyze.js` (fonts count, Bootstrap detected, CSS framework age, viewport meta).
- Em `message.js`: remover branch `poor_visual` com nota específica; usar `outdated_tech` como fallback.
- Em CRM: remover `visual_score` e `visual_notes` de `lib/types.ts` Lead interface e `tech-analysis.tsx`.

Perda estimada: 3–8 pontos de response rate em cold outbound (baseado em o quão específica a mensagem fica). Economia: $9/mês + 20–40 linhas de código. **Troca ruim.**

### Risco de mexer

- **Manter como está:** zero.
- **Heurística pura:** ALTO. Perde personalização na mensagem, qualificação menos precisa. Reverter depois custa ~mesma complexidade.
- **Gate por opportunity_score (micro-otimização):** BAIXO. Se mal calibrado, pula visual em leads valiosos.

---

## Área F — `bot_runs` table

### Estado atual

**Schema (17 colunas):**
- `id` UUID PK, `niche` TEXT, `city` TEXT, `limit_count` INT, `min_score` INT, `dry_run` BOOL, `send` BOOL, `lang` TEXT, `export_target` TEXT, `status` TEXT (running|completed|failed), `collected` INT, `qualified` INT, `sent` INT, `started_at` TIMESTAMPTZ, `finished_at` TIMESTAMPTZ, `duration_seconds` INT, `log` TEXT, `server_run_id` TEXT.

**Writers:**
- `app/api/bot/run/route.ts` — INSERT ao iniciar (manual), UPDATE status ao finalizar.
- `app/api/bot/run-auto/route.ts` — INSERT ao iniciar (auto), UPDATE status em erro.
- `app/api/bot/run-status/route.ts` — UPDATE stats finais após polling no bot-server.

**Readers:**
- `app/api/bot/runs/route.ts` (GET) — retorna últimas 20 runs.
- `components/bot/bot-client.tsx` — consome `/api/bot/runs` pra exibir histórico na UI do dashboard `/bot`.

**Não há overlap** com outras tabelas. `evolution_instance` é campo em `leads`/`conversations`, sem FK explícita pra `bot_runs`.

### Achados importantes

**Utilidade operacional depende do operator.** Se ele abre `/bot` depois de cada run e olha: útil. Se dispara e ignora: write-only.

**Coluna `log` TEXT é potencialmente grande.** Bot-server envia log completo (histórico de linhas) via `/api/bot/run-status`. Em runs longas com debug verbose, pode ser KBs–MBs por row. Dependendo do retention, cresce linear.

**Redundante com `leads` em certas métricas.**
- `SUM(sent) FROM bot_runs` vs `COUNT(*) FROM leads WHERE outreach_sent = true` — deveriam bater. Se não batem, um dos dois está errado (geralmente bot_runs, porque bot pode crashar entre enviar e reportar).
- `SUM(qualified)` é específico do bot — não tem correspondente em `leads` direto.

**`server_run_id` é volátil.** Só serve enquanto o bot-server está processando (pra polling). Após `completed`, é inútil — pode ser NULL.

### Recomendação: **MANTER, SIMPLIFICAR (drop columns pouco usadas)**

**Passo 1 — medir uso:**

```sql
-- 1. Quantas runs no total, distribuição de status
SELECT status, COUNT(*) AS count, MIN(started_at), MAX(started_at)
FROM bot_runs
GROUP BY status;

-- 2. Totais agregados
SELECT COUNT(*) AS total_runs,
       SUM(COALESCE(collected, 0)) AS total_collected,
       SUM(COALESCE(qualified, 0)) AS total_qualified,
       SUM(COALESCE(sent, 0)) AS total_sent
FROM bot_runs;

-- 3. Tamanho da coluna log (se for grande, simplificar ajuda)
SELECT
  ROUND(AVG(LENGTH(log))/1024.0, 2) AS avg_log_kb,
  ROUND(MAX(LENGTH(log))/1024.0, 2) AS max_log_kb,
  COUNT(*) FILTER (WHERE LENGTH(log) > 100000) AS runs_with_big_log
FROM bot_runs
WHERE log IS NOT NULL;

-- 4. Runs falhadas recentes (util operacional)
SELECT id, started_at, niche, city, SUBSTRING(log, 1, 300) AS log_preview
FROM bot_runs
WHERE status = 'failed' AND started_at >= NOW() - INTERVAL '30 days'
ORDER BY started_at DESC;
```

**Passo 2 — decisão baseada nos dados:**

- Se `/bot` UI é consultado semi-frequentemente: MANTER. Considerar:
  - Truncar `log` em insert (primeiras 10KB) — se operator precisa de mais, vai no Railway log direto.
  - Dropar `server_run_id` após `status='completed'` (via trigger ou UPDATE batch).
  - Dropar colunas nunca mostradas na UI: verificar `bot-client.tsx` — se `export_target`, `dry_run`, `send` não são renderizados, são write-only (mas são ~3 bytes cada, baixo custo de manter).
- Se `/bot` nunca é aberto: `SIMPLIFICAR drasticamente`:
  - Reduzir a `id, started_at, finished_at, status, collected, qualified, sent, log (truncado)`.
  - Dropar `niche`, `city`, `limit_count`, `min_score`, `dry_run`, `send`, `lang`, `export_target`, `duration_seconds`, `server_run_id` — reconstruíveis se necessário.

### Se simplificar: o que precisa ser tocado

**Arquivos (se drop de colunas):**
- `app/api/bot/run/route.ts` — ajustar INSERT pra não referenciar colunas dropadas.
- `app/api/bot/run-auto/route.ts` — idem.
- `app/api/bot/run-status/route.ts` — idem.
- `components/bot/bot-client.tsx` — remover campos que não renderizam mais.
- `lib/types.ts` (se tiver interface `BotRun`) — remover fields.

**SQL:**
```sql
-- Drop colunas pouco usadas (exemplo agressivo):
ALTER TABLE bot_runs DROP COLUMN IF EXISTS dry_run;
ALTER TABLE bot_runs DROP COLUMN IF EXISTS export_target;
ALTER TABLE bot_runs DROP COLUMN IF EXISTS server_run_id;

-- Truncar logs antigos:
UPDATE bot_runs SET log = SUBSTRING(log, 1, 10000) WHERE LENGTH(log) > 10000;
```

### Risco de mexer

- **Medir:** zero.
- **Truncar log:** BAIXO. Operator perde debug detalhado em failed runs — mas 10KB é o suficiente pro stack trace inicial.
- **Drop columns write-only:** BAIXO-MÉDIO. TypeScript pega usos em compile. Risco único: se alguma dashboard feature futura quiser, reintroduzir é 1 migration.

---

## Área G — Email pipeline: `enrich.js` + Instantly

### Estado atual

**`prospect-bot/steps/enrich.js`** — scraping de email + Hunter.io fallback.
- **Chamado em `auto.js` L.232** — condicional: `if (send === true)`.
- Executa ANTES de qualquer envio (WhatsApp ou email).
- Rate limit: 200ms entre requests Hunter.
- `HUNTER_MIN_CONF = 70`.

**Gating por country (MAJOR finding):**
> Agente reportou: `if (!isUS)` — BR usa, US pula.

Isso é o **oposto** do esperado. Operator: US é email via Instantly; BR é WhatsApp. Hunter deveria servir US, não BR. **Verificar esse trecho antes de agir** — pode ser confusão do agente ou bug real de gating invertido.

**`sendToInstantly` (bot):**
- Filtra por `lead.email` presente (L.113).
- Não filtra por country explicitamente.
- Flow real é determinístico por `lang`: `lang='pt'` → WhatsApp apenas; `lang='en'` → Email apenas.
- Em prática, BR nunca entra no sendToInstantly (channel=WhatsApp por lang).

**`message.js`:**
- `resolvedChannel = channel ?? (lang === 'pt' ? 'whatsapp' : 'email')`.
- Country derivado de lang (`lang==='pt' ? 'BR' : 'US'`).

### Achados importantes

**Finding 1 — Hunter pode estar rodando pra BR (desperdício).** Se o agente leu certo (`if (!isUS)`), todo lead BR passa por enrichLead que usa Hunter API paga. Mas BR não usa email — canal é WhatsApp. Cada call a Hunter pra um lead BR é dinheiro queimado.

**Finding 2 — BR com email coletado fica em limbo.** Se Hunter acha email pra um lead BR:
- Grava `email` + `email_source` no lead.
- Lead vai pra WhatsApp pipeline (channel=whatsapp).
- Email nunca é usado. Só consome linha no banco.

**Finding 3 — US sem Hunter pode ter cobertura pior.** Se o gating realmente é `!isUS`, US pula Hunter e depende só do scraping direto. Pode perder leads com email atrás de obfuscation ou em subpáginas.

**Duplicação de envio: NÃO acontece.** `lang` gateia channel — BR nunca entra em Instantly, US nunca entra em WhatsApp send path. Zero double-send observável.

### Recomendação: **INVESTIGAR (confirmar gating) → SIMPLIFICAR**

**Passo 1 — verificar código pessoalmente (5 min):**

```bash
# Conferir o gating em enrich.js
grep -n "isUS\|country" /home/levilaell/prospect-bot/steps/enrich.js
grep -n "enrichLead\|enrichLeads" /home/levilaell/prospect-bot/steps/auto.js
```

Possíveis cenários:
- **Cenário A:** `if (!isUS)` está certo — Hunter pra BR. Bug claro. Inverter gating.
- **Cenário B:** Agente leu errado; Hunter é pra US. Investigar se gating atual cobre os casos.
- **Cenário C:** Gating é correto mas lógica invertida em outra etapa. Traçar.

**Passo 2 — SIMPLIFICAR:**

Independente do cenário, a regra operacional deve ser:
- `enrichLead` só roda se lead vai enviar por email (country=US, channel=email).
- BR com channel=WhatsApp não precisa de Hunter nem de email coletado.

Implementação:
```js
// Em auto.js, antes de enrichLeads:
const needsEmail = (lead) => lead.country === 'US' || lead.outreachChannel === 'email';
const leadsForEnrich = qualifiedLeads.filter(needsEmail);
await enrichLeads(leadsForEnrich);
```

Ou simplesmente passar `skipEnrich` flag quando `market === 'BR'`.

**Passo 3 — confirmar volume de waste:**

```sql
-- No admin Supabase:
SELECT
  country,
  COUNT(*) FILTER (WHERE email IS NOT NULL) AS with_email,
  COUNT(*) FILTER (WHERE email_source = 'hunter') AS via_hunter,
  COUNT(*) FILTER (WHERE email IS NOT NULL AND outreach_channel = 'whatsapp') AS email_unused
FROM leads
GROUP BY country;
```

Linha BR com `via_hunter > 0` e `email_unused > 0` confirma desperdício.

### Se simplificar: o que precisa ser tocado

**Arquivos (bot repo):**
- `prospect-bot/steps/enrich.js` — adicionar guard no topo de `enrichLead`: `if (lead.country !== 'US' && lead.outreachChannel !== 'email') return lead;`
- OU `prospect-bot/steps/auto.js` L.232 — filtrar qualifiedLeads antes de passar pra enrichLeads.

**Arquivos (admin repo):** nenhum (o pipeline de envio em `dispatchMessage` já é gated por channel).

**SQL:** opcional, só cleanup — não há campo a remover.

### Risco de mexer

- **Investigar (ler código):** zero.
- **Gate correto:** BAIXO. US já tem scraping próprio; cortar Hunter pra BR só economiza dinheiro, não quebra nada.
- **Risco residual:** se algum dia operator decidir testar email BR (cold outbound misto), vai precisar reativar enrich. Trivial — remove o filtro.

---

## Área H — Project status enum (7 estados)

### Estado atual

```typescript
PROJECT_STATUSES = [
  'scoped', 'approved', 'in_progress', 'delivered',
  'client_approved', 'paid', 'cancelled'
] as const
```

**Transições (100% manuais via UI `components/lead-detail/project-status.tsx`):**
- `scoped → approved` — "Cliente autorizou →" (+ dispara `generateClaudeCodePrompt()` fire-and-forget).
- `approved → in_progress` — "Marcar em progresso →"
- `in_progress → delivered` — operator cola preview URL → "Enviar link de preview →"
- `delivered → client_approved` — "Cliente aprovou →" (seta `client_approved_at` timestamp).
- `client_approved → paid` — "Marcar como pago →"
- `cancelled` — terminal, sem transição forward.

**Acoplamento com `lead.status` (somente terminal, em `app/api/projects/[place_id]/status/route.ts`):**
- `project.status = 'paid'` → `lead.status = 'closed'`.
- `project.status = 'cancelled'` → `lead.status = 'lost'`.

**Nenhuma transição automática via webhook/AI.** 100% operator-driven.

### Achados importantes

**Zero exercício em produção.** Operator tem zero vendas fechadas. Nunca passou pelo fluxo inteiro com um cliente real. Toda decisão de "isso precisa de estado dedicado ou não" é especulação.

**Dois pares com semântica sobreposta:**

- **`approved` vs `client_approved`:**
  - `approved` = cliente autorizou a proposta (escopo + preço), gera Claude Code prompt.
  - `client_approved` = cliente aprovou o site entregue, seta timestamp.
  - Diferença é real mas documentada só no código. Operator pode confundir ("qual botão eu aperto?").

- **`delivered` vs `client_approved`:**
  - `delivered` = operator mandou URL de preview.
  - `client_approved` = cliente respondeu "ok".
  - Entre os dois, o trabalho está "entregue mas não aprovado". Útil se operator quer trackar "quantos projetos estão esperando sign-off do cliente". Caso contrário, redundante.

**4 estados cobririam o operador único:**
```
scoped → in_progress → paid → cancelled
(proposal feita → trabalho rolando → dinheiro entrou → morreu)
```
- `approved` vira sinal via timestamp (`authorized_at`) + mesmo side-effect (`generateClaudeCodePrompt`).
- `delivered` vira timestamp `preview_sent_at`.
- `client_approved` vira timestamp `client_approved_at`.

Perde: capacidade de filtrar kanban por "projetos aguardando cliente aprovar".
Ganha: menos clicks no UI, menos decisões de estado.

**Simplificar AGORA é especulação.** Operator não sabe quais filtros vai precisar. Pode se arrepender em 2 meses (o primeiro cliente mostra que filtrar por `delivered` economiza tempo real).

### Recomendação: **DEIXAR PRA DEPOIS DO PRIMEIRO CLIENTE**

Razões:
1. Enum nunca rodou em prod. Simplificar sem dados = chute.
2. Custo de manter 7 estados hoje é ~zero (100% manual, sem automação que se confunda).
3. Após primeiro cliente, operator saberá quais estados são úteis pra dashboard e quais são cliques extras.
4. Simplificar depois é trivial: merge de estados com UPDATE SQL, compile errors guiam.

**Ações a NÃO fazer agora:**
- Não consolidar `approved` + `in_progress`.
- Não remover `delivered`.
- Não mexer em `approved_at`/`client_approved_at`/etc.

**Ação única opcional:** melhorar labels UI pra reduzir confusão operator:
- `approved` → "Proposta aceita"
- `client_approved` → "Cliente aprovou site"

Custo: 2 strings. Ganho: zero risco de apertar botão errado.

### Se simplificar (não recomendado): o que precisa ser tocado

**Arquivos:**
- `lib/types.ts` — remover `approved`, `delivered`, `client_approved` de `PROJECT_STATUSES`.
- `components/lead-detail/project-status.tsx` — remover 3 steps da UI, remover botões correspondentes, simplificar `advanceStatus` switch.
- `app/api/projects/[place_id]/status/route.ts` — ajustar transições válidas e triggers (`generateClaudeCodePrompt` ainda dispara, mas em `scoped→in_progress` agora).

**SQL:**
```sql
-- Migrar estados existentes pra 4 estados:
UPDATE projects SET status = 'in_progress'
  WHERE status IN ('approved', 'delivered', 'client_approved');

-- Se houver CHECK constraint, recriar com enum novo.
```

### Risco de mexer

- **Manter como está:** ZERO.
- **Simplificar agora:** BAIXO-MÉDIO. Build quebra em exhaustive checks (TypeScript pega). Risco real é de se arrepender — ter que reintroduzir um estado depois.

---

## Área I — Write-only fields (meta-audit)

### Estado atual

Audit do `lib/types.ts` Lead interface + grep por readers em `admin/app/**`, `admin/lib/**`, `admin/components/**`:

| Campo | Classificação | Onde é LIDO (CRM) | Custo de coletar (bot) |
|---|---|---|---|
| `has_pixel` | READ + WRITE | `components/lead-detail/tech-analysis.tsx` | Scrape DOM (barato) |
| `has_analytics` | READ + WRITE | `tech-analysis.tsx` | Scrape DOM (barato) |
| `email_source` | **WRITE-ONLY** | — (nenhum reader no CRM) | Hunter API + scrape |
| `country` | READ + WRITE | `bot-config.ts`, filtros kanban, prompts | Enum no bot (zero) |
| `inbox_archived_at` | READ + WRITE | sidebar, inbox filters, archive API | Timestamp manual |
| `fcp`, `lcp`, `cls` | READ + WRITE | `tech-analysis.tsx` (PageSpeed) | PageSpeed API (lento, 2–10s) |
| `outreach_channel` | READ + WRITE | inbox, kanban cards, filtros | Enum no bot (zero) |
| `visual_score` | READ + WRITE | `tech-analysis.tsx` ScoreCircle | Haiku + Puppeteer (~$0.003) |
| `visual_notes` | READ + WRITE | `tech-analysis.tsx` bullets | Haiku (junto com score) |
| `opportunity_score` | **WRITE-ONLY** | — (nenhum reader no CRM) | Cálculo local (review_count + rating) — zero |
| `has_google_ads` | NOT IN TYPES | — | — |
| `message_variant` | NOT IN TYPES | — | — |
| `contact_found` | NOT IN TYPES | — | — |
| `whatsapp_lid` | NOT IN TYPES (usa `whatsapp_jid`) | — | — |
| `bot_run_id` | NOT IN TYPES | — | — |

### Achados importantes

**Write-only efetivo: 2 campos.**
- `email_source` ('scrape'|'hunter'|null) — gravado pelo bot, zero uso no CRM.
- `opportunity_score` (0–5) — gravado pelo bot, zero uso no CRM.

**Não-existentes no schema do CRM (5 campos):** `has_google_ads`, `message_variant`, `contact_found`, `whatsapp_lid`, `bot_run_id`. Agente reportou que não aparecem em `lib/types.ts`. Isso NÃO significa que não existem no banco — pode haver colunas no Postgres sem type TS. Verificar:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name IN ('has_google_ads', 'message_variant', 'contact_found',
                      'whatsapp_lid', 'bot_run_id');
```

Se alguma existe no DB mas não em types.ts: ou é coluna fantasma (bot grava, nada lê) ou type está desatualizado.

**Análise write-by-write:**

- **`email_source`** — valor real pra debug se operator se pergunta "de onde veio esse email?". Baixo custo de armazenar (TEXT curto). **Manter.**
- **`opportunity_score`** — calculado localmente pelo bot (review_count + rating). Se o bot usa internamente (em `score.js` ou `message.js`) pra gating/priorização, o CRM não precisa ler — é dado interno do bot que por acaso é persistido junto. Verificar:
  ```bash
  grep -n "opportunity_score" /home/levilaell/prospect-bot/steps/*.js
  grep -n "opportunity_score" /home/levilaell/prospect-bot/lib/*.js
  ```
  - Se usado no bot: manter (útil internamente).
  - Se bot só grava e não usa: dropar da coluna.

**PageSpeed (fcp/lcp/cls)** é READ no CRM, mas custo de coleta é alto (2–10s/lead chamada API). **Valor alto:** tech-analysis UI mostra Core Web Vitals, que é o argumento técnico mais concreto pra outbound. **Manter.**

**`has_pixel`/`has_analytics`** — coleta barata, usada na UI, sem dilema. Manter.

### Recomendação: **INVESTIGAR (5 min) → DROP campos fantasma / write-only sem uso interno**

**Passo 1 — verificar campos possivelmente fantasma:**

```sql
-- No Supabase:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name IN ('has_google_ads', 'message_variant', 'contact_found',
                      'whatsapp_lid', 'bot_run_id')
ORDER BY column_name;

-- Se existem, confirmar se têm dados:
SELECT
  COUNT(*) FILTER (WHERE has_google_ads IS NOT NULL) AS has_google_ads_set,
  COUNT(*) FILTER (WHERE message_variant IS NOT NULL) AS message_variant_set,
  COUNT(*) FILTER (WHERE contact_found IS NOT NULL) AS contact_found_set,
  COUNT(*) FILTER (WHERE whatsapp_lid IS NOT NULL) AS whatsapp_lid_set,
  COUNT(*) FILTER (WHERE bot_run_id IS NOT NULL) AS bot_run_id_set
FROM leads;
```

**Passo 2 — verificar uso interno no bot:**

```bash
grep -rn "opportunity_score" /home/levilaell/prospect-bot/
grep -rn "email_source" /home/levilaell/prospect-bot/
```

**Passo 3 — decisão:**

- Colunas em DB sem dados E sem readers (CRM + bot): **DROP** (`ALTER TABLE leads DROP COLUMN ...`).
- Colunas com dados mas sem readers: manter por agora (histórico), dropar em próxima onda de cleanup.
- Colunas com dados e usadas no bot internamente: manter.

### Se simplificar: o que precisa ser tocado

**Arquivos (se confirmar fantasma):**
- `lib/types.ts` — adicionar/remover interface fields coerentes com o que fica.

**SQL (exemplo agressivo, só se confirmado):**
```sql
-- Colunas confirmadas fantasma:
ALTER TABLE leads DROP COLUMN IF EXISTS has_google_ads;
ALTER TABLE leads DROP COLUMN IF EXISTS message_variant;
ALTER TABLE leads DROP COLUMN IF EXISTS contact_found;
ALTER TABLE leads DROP COLUMN IF EXISTS whatsapp_lid;
ALTER TABLE leads DROP COLUMN IF EXISTS bot_run_id;

-- opportunity_score (se confirmado não-usado no bot):
ALTER TABLE leads DROP COLUMN IF EXISTS opportunity_score;
```

**Arquivos (bot repo) se dropar opportunity_score:**
- Buscar e remover writes em `prospect-bot/steps/enrich.js` ou equivalente.

### Risco de mexer

- **Investigar:** zero.
- **Dropar colunas confirmadas fantasma (zero dados):** MUITO BAIXO.
- **Dropar colunas com dados:** MÉDIO. Irreversível. Fazer backup antes ou deixar sem drop (só remover do type).

---

## Tabela Sumário

| Área | Ação | Impacto | Risco | Tempo |
|---|---|---|---|---|
| A. Config duplication | **SIMPLIFICAR** (reduzir `auto-config.js` a teste mínimo) | -300 linhas de config redundante; elimina drift futuro | MUITO BAIXO | 20 min |
| B. `prospect.js` vs `auto.js` | **MANTER** (sinalizar débito) | Nenhum; evita refactor custoso | BAIXO (deixar); MÉDIO (mexer agora) | 5 min (comentários) |
| D. AI suggestions | **INVESTIGAR → SIMPLIFICAR** (guards + dedup) | Remove ruído UI + ~10% chamadas Haiku; adiciona observability | BAIXO | 30 min (SQLs) + 45 min (fix) |
| E. Visual analysis | **MANTER** (~$9/mês em volume alvo é pequeno pra valor) | Zero mudança | ZERO (manter); ALTO (remover) | 0 |
| F. `bot_runs` | **MEDIR → SIMPLIFICAR** (truncar log, drop colunas pouco usadas) | Reduz footprint tabela; mantém observability | BAIXO | 15 min (SQLs) + 30 min (fix) |
| G. Email pipeline | **INVESTIGAR → CORRIGIR gating** Hunter | Economiza Hunter API calls pra BR (se gating realmente invertido) | BAIXO | 10 min (verificar) + 15 min (fix) |
| H. Project status 7 estados | **DEIXAR PRA DEPOIS 1º CLIENTE** | Zero agora; decisão informada depois | ZERO (manter); MÉDIO (mexer) | 0 agora |
| I. Write-only fields | **INVESTIGAR → DROP fantasmas** | Remove colunas fantasma do schema; `opportunity_score` talvez | MUITO BAIXO (fantasmas); MÉDIO (com dados) | 10 min (SQLs) + 15 min (drops) |

**Total acionável agora: ~2.5–3h.**
**Total "deixar quieto": áreas B, E, H.**

---

## Ordem de execução sugerida

1. **Área I — investigação (10 min SQL).** É o mais rápido e pode revelar colunas fantasma a dropar. Zero risco.

2. **Área G — confirmar gating Hunter (10 min).** Se o gating for realmente invertido, é economia mensurável imediata.

3. **Área A — reduzir `auto-config.js` (20 min).** Mexe em bot repo, isolado, reversível. Elimina drift futuro.

4. **Área D — SQLs de métrica (30 min).** Decidir se vale simplificar ou desativar AI suggestions. Decisão informada.

5. **Área F — SQLs + truncamento log (45 min).** Pequena melhoria de footprint, já que foi medido.

6. **Área D — aplicar guards + dedup (45 min).** Se passou no passo 4.

7. **Áreas B, E, H — não mexer.**

---

## O que deixar pra DEPOIS do primeiro cliente real

- **Área B — consolidação `prospect.js`/`auto.js`.** Hoje custa 4–6h de refactor, risco médio, benefício marginal. Quando operator estiver mexendo no bot semanalmente, aí vale.

- **Área H — simplificar project status enum.** Decisão depende de quais filtros operator realmente usa no kanban de projetos. Sem primeiro cliente, é adivinhação.

- **Área E — desativar/heurizar visual analysis.** Só se volume escalar pra 500+ leads/dia E o custo virar problema relativo. Agora é baixo demais pra justificar.

- **Área F — drops agressivos em `bot_runs`.** Se operator confirmar após 3 meses que nunca abriu `/bot`, aí consolidar pra 7–8 colunas.

- **Área D — revisitar prompt/modelo AI suggestions.** Upgrade pra Sonnet só se volume justificar e se approve rate for alto.

---

## Observações finais

- **Este relatório é leitura, não ação.** Nenhum código foi tocado, nenhum SQL rodado.

- **Custo total observado é trivial.** As três suspeitas de "overengineering caro" (visual analysis $9/mês, AI suggestions <$5/mês, Hunter pra BR de valor desconhecido) somam talvez $15–25/mês em volume alvo. Não é problema de budget — é problema de _clareza do sistema_.

- **Áreas A, D, G, I são quick wins.** Entre 2–3 horas removem drift silencioso de config, guards faltando em AI suggestions, possível gating invertido de Hunter, e colunas fantasma. Zero pain.

- **Áreas B e H são "não mexer".** Custo de mexer > valor informado. Revisitar depois.

- **Área E é "não mexer".** Custo pequeno, valor grande. Exemplo de algo que parece candidato a cortar mas vale manter.

- **Observabilidade é o buraco recorrente.** AI suggestions falha silencioso, visual analysis falha silencioso, bot_runs tem log mas ninguém confirma que é consultado. Próximo audit (V3?) deveria cobrir "o que está quebrando sem operator saber".

- **Precursor pro 1º cliente.** Depois dele, dois audits naturais: (1) revisitar project status enum (H) com dados reais; (2) revisitar AI suggestions (D) com métrica de approval rate estabilizada.
