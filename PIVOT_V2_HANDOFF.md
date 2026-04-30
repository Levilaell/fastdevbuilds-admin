# PIVOT v2 — handoff

> Salvo em 2026-04-30. Pega o pulse aqui antes de retomar.

## TL;DR

Pivot do v1 ("vendo site genérico, R$800-1500 one-shot, 0 vendas") pra modelo BR de volume com lab de experimentos formal. Cortes em ~5500 linhas, lab novo entregue (UI + API + bot integration), produção no ar, smoke test rodou e taggeou leads corretamente.

## Em produção

- **URL prod:** https://fastdevbuilds-admin.vercel.app
- **Deploy ID atual:** `dpl_81n7SNyoLYQ9UNHQPu7rjq7wTp7x`
- **Vercel scope:** `levis-projects-b38ee43d`
- **Branches:**
  - admin: `pivot-v2` (não mergeado em `main` ainda — Vercel deploy direto via CLI, sem push)
  - bot: `main` (commits diretos)
- **Migrations rodadas:**
  - ✅ `20260430_experiments_lab.sql` — lab tables
  - ❌ `20260430_pivot_v2_drop_dead_columns.sql` — **PENDENTE**. Idempotente, segura. Cole no Supabase SQL Editor quando quiser limpar 19 colunas mortas em `leads` + tabela `webhook_inbound_quarantine` (que ainda tem 1 registro antigo).

## Commits da sessão

### admin (branch `pivot-v2`)

```
8c35dd4 lab: bot interpola variant template em vez de gerar via Claude
9807b92 lab: rota run-variant + botão dispara bot por variant
dcde56c lab: tabelas + API + UI de experimentos
b79dcef simplify webhook + whatsapp.ts + add cleanup migration
efacc04 drop scoring + quarantine + PageSpeed bloat
7e9eed6 purge US tracks + preview-first replicas
```

### bot (`prospect-bot`, branch `main`)

```
e9125bf lab: aceitar message_template do externalConfig
2d49ff9 lab: aceitar experiment_id + experiment_variant_id no externalConfig
7365588 drop US tracks (sms, instantly, research scripts)
```

> Atenção: o commit `2d49ff9` no bot incluiu mudanças teu próprio em `CLAUDE.md` por engano. `git reset HEAD~3 -- CLAUDE.md` se quiser desempacotar (não afeta o trabalho do lab — só descola tua mudança de doc).

## Como rodar o lab (uso real)

### Via UI (caminho normal)

1. `https://fastdevbuilds-admin.vercel.app/experiments` → **+ Novo**
2. Nome + hipótese (opcional)
3. Pelo menos 1 variant. Cada variant precisa:
   - Nome (ex: `doceira-sjrp`)
   - Nichos (vírgula): `doceira, confeiteira`
   - Cidades (vírgula): `São José do Rio Preto, SP`
   - Copy: usar `{nome}`, `{cidade}`, `{vertical}` pra interpolar
   - Target volume (default 30)
4. **Criar** → status `draft`
5. **Iniciar** → status `running` (botão no detail)
6. Em cada variant: **Rodar bot** → dispara `/api/experiments/[id]/run-variant` → bot-server Railway → puppeteer Google Maps → leads salvos com `experiment_variant_id`
7. Dashboard atualiza com métricas (collected, sent, replied, reply_rate, close_rate)

### Via CLI (escape hatch / debug)

```bash
# 1. cria experiment + variants via REST
curl -X POST "$URL/rest/v1/experiments" -H "apikey: $KEY" ... -d '{"name":"...","status":"draft"}'
curl -X POST "$URL/rest/v1/experiment_variants" ... -d '[{...}]'

# 2. monta config
cat > /tmp/exp-config.json <<EOF
{
  "niches": ["doceira"],
  "cities": ["São José do Rio Preto, SP"],
  "country": "BR",
  "lang": "pt",
  "channel": "whatsapp",
  "campaign_code": "exp_<id>_v_<id>",
  "bot_run_id": "<uuid>",
  "experiment_id": "<uuid>",
  "experiment_variant_id": "<uuid>",
  "message_template": "Olá {nome}, ..."
}
EOF

# 3. roda local (precisa GOOGLE_MAPS_API_KEY no prospect-bot/.env)
cd /home/levilaell/prospect-bot
node prospect.js --auto --config /tmp/exp-config.json --limit 5 --min-score 0
```

> **Bug shell escape:** se você inserir variant via `curl -d` com `R$497` no template, o `$` é consumido pelo bash. Use heredoc ou JSON file separado. O form do UI não tem esse problema.

## Estado do smoke test (decidir depois)

- **experiment_id:** `f8a11afb-d76f-47c6-a69d-8ae9b3913c5c`
- **Status:** `running`
- **Variants:** `doceira-sjrp` (rodou, 7 leads) + `marceneiro-sjrp` (não rodou)
- **Template:** tem bug do `R$` virando `R` (foi escape do shell quando inseri via curl) — só afeta as 4 mensagens dos leads `prospected` desse smoke

Opções:
- **Deletar:** `DELETE FROM experiments WHERE id = 'f8a11afb-...';` (cascata em variants; leads ficam com `experiment_id=NULL` por `ON DELETE SET NULL`)
- **Manter:** marcar como `aborted` ou completar o A/B rodando o variant marceneiro também
- **Reusar:** criar variant novo com template correto (`R$497`) e rodar como teste real

## TODOs (não bloqueiam o lab funcionando)

1. **Migration 1 (cleanup):** rodar `20260430_pivot_v2_drop_dead_columns.sql` no SQL Editor. Idempotente. Drop 19 colunas + 1 tabela.

2. **`bot_runs` não fecha no fim:** após `runAuto` terminar, bot não dá `PATCH /bot_runs/[id]` com `status=completed, finished_at=now, collected, qualified, sent`. Pré-existente. Fix em `prospect.js` ou `steps/auto.js`.

3. **`preview_sent` metric hardcoded em 0** no dashboard (`/api/experiments/[id]/route.ts` linha ~70). Derivar de join com `projects` table (`projects.preview_sent_at IS NOT NULL`).

4. **Dead code US no bot** — não roda em BR mas polui:
   - `steps/score.js`: branch `isUS = country === "US"`
   - `steps/message.js`: branches `channel === 'email' | 'sms'`
   - `lib/whatsapp.js` (do bot): branches `country === 'US'` em validação de phone
   - `lib/niche-templates.js`: entries só-`en` (hvac, roofing, electrician, insurance, daycare, wedding_venue, personal_trainer, law_firm)

5. **Mensagem fallback do modelo volume:** se algum dia o lab não tiver template (ex: rodar `--market BR` sem experimento), bot vai usar `generateMessages` com prompts antigos. Hardcoded em `prompts.js` do bot uma versão tipo "Olá {nome}, sou o Levi de Rio Preto. Faço sites profissionais pra {vertical} em 48h por R$ 497, com hosting + ajustes inclusos por R$ 97/mês. Posso te mandar uma prévia gratuita? Sem compromisso." resolve.

6. **`prospect-bot/CLAUDE.md` foi commitado por engano** no commit `2d49ff9`. `git reset HEAD~3 -- CLAUDE.md` no repo do bot pra restaurar tua versão local.

## Bugs conhecidos (pré-existentes, não introduzidos)

1. **City vem com formato "<bairro_id> - <bairro_name>"** em alguns leads (ex: `"3266 - Centro"`). O scraper sobrescreve `city` com data do Google Place Details em vez de manter `searchCity`. Olhar `prospect-bot/lib/scraper.js` se quiser fixar.

2. **`evolution_instance` aparece como `(unset)` em alguns logs** quando o webhook não consegue resolver instance — passa pelo bot direto, sem outbound prévio.

## Próximas fases (escopo já definido na conversa)

### Fase 3 — Delivery & cobrança

Tabelas: `briefings`, `subscriptions`, `change_requests`.

- **Briefing form pós-fechamento:** rota pública `/briefing/[place_id]/[token]` com formulário pra cliente preencher dados que faltam (logo, fotos, cores, serviços). Quando submete, `submitted_at` dispara regeneração do prompt no Claude Code.
- **Infinity Pay integração:** webhook `/api/webhook/infinity` recebe `paid` + `subscription_paid`. R$497 setup como charge único, R$97/mês como plano recorrente.
- **Self-service de manutenção:** rota pública `/cliente/[place_id]/[token]` formulário pra cliente pedir ajuste (foto, texto, item de cardápio). Tu processa em batch.

### Polimento

- Dashboard de métricas mais ricas (time-to-reply mediano, distribuição por hora, custo por lead/reply/venda)
- Comparação visual de variants lado a lado
- Estatística básica (delta entre variants, intervalo de confiança simples)

## Decisões pendentes pra próxima sessão

1. **Smoke experiment:** deletar ou aproveitar?
2. **Migration 1:** rodar agora ou esperar?
3. **Lista real de nichos/cidades** pro primeiro experimento de verdade — ainda não definiu publicamente. Chuto que vai querer começar com 2-3 nichos × 1-2 cidades em SJRP.
4. **Próxima fase:** delivery (Fase 3) ou polimento do lab?
5. **Bot run real:** quando rodar `--send=true` pra disparar mensagens, e contra que volume inicial?
