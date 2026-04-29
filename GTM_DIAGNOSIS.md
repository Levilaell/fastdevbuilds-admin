# GTM Diagnosis — 2026-04-28

Auditoria a partir de query real do banco em 2026-04-28 às ~21h.
Tudo abaixo é fato medido, exceto onde marcado explicitamente
**não medido** ou **especulação**.

Reproduzir: `node --env-file=.env.local scripts/audit-data.mjs`

---

## TL;DR (4 linhas)

1. **Pré-Fase-1: 605 envios, 0 vendas, 7.8% reply rate.** O gargalo
   está em **reply → close**, não em send → reply. Reply rate
   é normal-pra-bom; conversão pós-resposta é o problema.
2. **Fase 1 (BR-WA-PREVIEW R$ 997 estética) lançou hoje** com 22
   envios e 0 vendas — Dia 0 do kill switch de 14 dias / 100 msgs.
   Sem dado suficiente pra concluir nada ainda. Mas:
3. **Bug crítico identificado por inspeção: Claude Code está
   dropando a instrução de tracker do prompt.** 3 de 3 preview
   sites amostrados não têm `track.js` no HTML. 92 previews
   enviados, 0 opens registrados — cego pra todo o critério de
   abertura no kill switch da Fase 1. Fix #1 antes de tudo.
4. **Niche da Fase 1 pode ter sido picked errado**: clínicas estética
   tinha 6.7% reply pré-Fase-1, enquanto floriculturas 20.5% e
   padarias 20%. Não é fix imediato — Fase 1 já lançou — mas é
   informação pra Fase 2.

---

## 1. Inventário de dados (o que tu já tem)

Schema atual da tabela `leads` cobre quase tudo do "30+ campos"
pedido na conversa. Detalhe em `lib/types.ts`:

**Campos de identidade/contato:** place_id, business_name, address,
city, country, phone, email, email_source, niche, evolution_instance,
whatsapp_jid, whatsapp_lid_jid.

**Sinais de qualificação Google Places:** rating, review_count, hours,
reviews (até 3 raw), photos_urls (até 5), website (com NULL = sem site).

**Sinais técnicos do site (via scraper):** perf_score, mobile_score,
fcp/lcp/cls, has_ssl, is_mobile_friendly, has_pixel, has_analytics,
has_whatsapp, has_form, has_booking, tech_stack, scrape_failed.

**Scoring (3 dimensões já existentes):** opportunity_score (0-5),
opportunity_reasons, pain_score, score_reasons (com 11 razões
catalogadas em `SCORE_REASON_LABELS`), visual_score, visual_notes.

**Estado operacional:** outreach_sent, outreach_sent_at,
outreach_channel, status (7 estados), status_updated_at,
last_outbound_at, last_inbound_at, last_human_reply_at,
last_auto_reply_at, outreach_error.

**Tabelas relacionadas:**
- `projects` — place_id, status (6 estados), price, paid_at,
  preview_sent_at, preview_url, claude_code_prompt, generated_images,
  notes, scope, pending_info.
- `conversations` — direction (in/out), channel (whatsapp/email/sms),
  message, sent_at, suggested_by_ai, approved_by, provider_message_id.
- `preview_views` — beacon hits do tracker embutido no site gerado
  (criada em 2026-04-27).
- `webhook_inbound_quarantine` — inbounds sem match.
- `evolution_instance_config` — daily_cap por chip.
- `bot_runs` — histórico de execuções do bot.

**Camada de métricas pronta:** `lib/metrics.ts` (520 linhas) já
calcula funnel cumulativo, taxas, segmentação por niche/city/instance/
channel, financial health (CAC IA + margem bruta) com assumptions
hardcoded. Página `/metrics` consome.

### O que NÃO existe ou nunca foi populado

- `outreach_variant` — não existe coluna. Sem isso, A/B test não
  é mensurável.
- `lead_temperature` (HOT/WARM/COLD) — não existe e **não vale criar
  como coluna**: pode ser derivado por SQL (predicado abaixo).
- `instagram_url`, `instagram_followers` — não coletados pelo bot.
- `whatsapp_business_detected` — não medido.
- `decision_maker_detected` / `contact_role` — todo lead é tratado
  como dono. Sem distinção entre dono/recepção/secretária.
- `lost_reason` — não há coluna; o botão "Marcar como lost" do CRM
  só seta status (per `docs/PLAYBOOK.md` §4 a UI tem motivos de lost
  mas eles NÃO estão indo pro banco — confirmar).
- `preview_first_view_at` derivado em código (`LeadCard`) mas não
  persistido — depende de `preview_views` estar funcionando, o que
  como veremos abaixo, **não está**.

---

## 2. Pré-Fase-1 — post-mortem do modelo velho

Qualquer lead com `outreach_sent_at < 2026-04-28` é da era anterior:
modelo de R$ 800–1500 + offer-first BR + preview-first US. Esse cohort
**não diagnostica a Fase 1**, mas mostra padrões que valem.

### Funil pré-Fase-1 (605 envios, 0 vendas)

| estágio                                  | #   | %    |
|------------------------------------------|-----|------|
| enviado                                  | 605 | 100% |
| respondeu (last_human_reply_at != null)  | 47  | 7.8% |
| aceitou preview (project ≥ approved)     | 87  |14.4% |
| preview enviado (project ≥ preview_sent) | 87  |14.4% |
| preview aberto (beacon hit)              | 0   | 0.0% |
| pago                                     | 0   | 0.0% |

> **Observação 1.** "Aceitou preview" = 87 > replied = 47. Diferença
> são leads preview-first (US e batches BR-PREVIEW antigos) cujo
> project foi criado antes do outreach. Nesses, "aceitou" é
> estrutural, não comportamental.

> **Observação 2.** 0 preview aberto é bug, não realidade — ver §4.

### Reply rate por country/channel (pré-Fase-1)

| country / channel | sent | replied | reply_rate |
|-------------------|------|---------|------------|
| BR / whatsapp     | 535  | 45      | 8.4%       |
| US / whatsapp     | 70   | 2       | 2.9%       |

**Conclusão dado-suportada:** US via WhatsApp tem ~3x menos resposta
que BR. Combinado com 0 fechamentos, o canal US-WA está morto. Se
voltar a tentar EUA, precisa testar email + LinkedIn — não WhatsApp.

### Reply rate por niche (pré-Fase-1, top 15 por volume)

| niche                   | sent | replied | reply_rate |
|-------------------------|------|---------|------------|
| floriculturas           | 39   | 8       | **20.5%**  |
| padarias e confeitarias | 20   | 4       | **20.0%**  |
| salões de beleza        | 44   | 5       | 11.4%      |
| fisioterapeutas         | 35   | 4       | 11.4%      |
| autoescolas             | 31   | 3       | 9.7%       |
| lojas de roupas         | 31   | 3       | 9.7%       |
| clínicas de estética    | 30   | 2       | 6.7%       |
| nutricionistas          | 47   | 3       | 6.4%       |
| clínicas odontológicas  | 19   | 1       | 5.3%       |
| estúdios de pilates     | 43   | 2       | 4.7%       |
| restaurantes            | 23   | 1       | 4.3%       |
| clínicas de psicologia  | 23   | 1       | 4.3%       |
| barbearias              | 48   | 2       | 4.2%       |
| pet shops               | 29   | 0       | 0.0%       |
| clinicas odontologicas  | 20   | 0       | 0.0%       |

> **Observação 3.** Floriculturas e padarias dominam reply rate.
> Pet shops e a versão sem-acento de odonto ("clinicas") estão em 0%.
>
> **Observação 4.** Há duplicação de niche por acentuação:
> "clínicas odontológicas" vs "clinicas odontologicas" — bug de
> normalização no bot. Não crítico, mas distorce agregações.

### Veredito pré-Fase-1

- 7.8% reply é normal-pra-bom em cold WhatsApp BR.
  **Não é o gargalo**.
- O gargalo são as **47 conversas que não viraram venda**. Isso
  precisa de auditoria qualitativa (ler conversas, classificar
  motivos de morte) — não é medível com schema atual sem campo
  `lost_reason`.
- Fase 1 escolheu estética (6.7%). Floriculturas (20.5%) e padarias
  (20.0%) tinham melhor pull. **Não é razão pra abortar Fase 1**
  (volume baixo, ticket de florista pode ser menor), mas é input
  pra Fase 2.

---

## 3. Fase 1 — estado de Dia 0

Fase 1 lançou em 2026-04-28 (hoje, conforme PLAYBOOK.md §2):

- Niche: clínicas estética
- GEO: Ribeirão Preto / Sorocaba / Londrina
- Canal: BR WhatsApp preview-first (R$ 997 fixo, 50/50 split,
  garantia R$ 500 refundable)
- Kill switch: **14 dias / 100+ mensagens. 0 vendas E reply <1% →
  revisar oferta. 1+ venda OU reply ≥3% → expandir pra veterinária.**

### Snapshot Dia 0

- Outreach enviado dentro da Fase 1: **22**
- Projects criados na Fase 1: **23**
- Previews gerados (claude_code_prompt populado): **23**
- Reply rate Fase 1: **9.1%** (2/22)
- Preview open rate: **0.0%** (todos com tracker quebrado — §4)
- Vendas: **0**
- Progresso vs kill switch (msgs): **22/100 = 22%**
- Progresso vs kill switch (dias): **0/14**

> **Status:** sem volume pra concluir nada. Reply rate 9.1% é noise
> (n=22). Esperar até pelo menos 50 msgs antes de qualquer leitura.

---

## 4. BUG CRÍTICO — Claude Code dropa o tracker (verificado)

92 projects com `preview_url` populado, 0 linhas em `preview_views`.

**Causa identificada via inspeção empírica:** baixei o HTML de 3
preview sites randomly amostrados (fence-repair.vercel.app,
muscle-m.vercel.app, ace-mobile.vercel.app) e procurei por
`track.js` ou `fastdevbuilds-admin` — **0 ocorrências em todos os 3**.

A instrução em `lib/prompts.ts:602-608` ("TRACKER OBRIGATÓRIO no
app/layout.tsx") é uma única linha dentro de um prompt de ~3000
linhas. Claude Code está dropando essa instrução com taxa alta
(provavelmente 100% nos 3 amostrados, possivelmente em todos os 92).

Não é bug de endpoint, não é bug de track.js, não é CORS, não é o
gating de `preview_sent_at`. **É instrução do LLM sendo ignorada.**

**Impacto:** o kill switch da Fase 1 (que depende de medir abertura
de preview) está cego. Mesmo se 100% dos leads abrirem o preview,
`funnel.preview_opened` vai ficar em 0.

### Por que isso acontece (padrão arquitetural já documentado)

Tu já passou por isso e documentou em `AUDIT.md` linhas 62-67:

> Condicionais interpretativas em system prompts falham independente
> do modelo (testado Haiku 4.5 e Sonnet 4.6 — ambos ignoraram).
> Solução: calcular a decisão fora do LLM (código), injetar resultado
> flat no contexto, modelo só executa lookup.

A instrução de tracker é exatamente esse anti-pattern. Está
embutida em meio ao prompt como mais uma regra de muitas.

### Fix possível (escolher 1, em ordem de robustez)

1. **Pós-processamento determinístico.** Após Claude Code gerar
   o site, um step adicional verifica se `app/layout.tsx` contém
   o `<Script src=".../track.js">` e injeta se faltar. Esse é o
   padrão de "calcular fora do LLM" que tu já adotou.
2. **Mover a instrução pra o início do prompt + repetir no final**
   com marcação visual extrema. Aumenta taxa de aderência mas não
   resolve permanentemente.
3. **Template base com tracker já embutido**, e Claude Code só
   preenche o conteúdo dentro de slots fixos. Essa é a refatoração
   maior, faz sentido depois de mais 5+ clientes.

Recomendado: **#1 imediatamente** (~30min de código), até
porque a Fase 1 já está rodando.

> **Caveat:** o fix vale só pra previews **gerados após o fix**.
> Os 92 históricos (incluindo os 22 da Fase 1 já enviados) ficam
> permanentemente sem dado de abertura. O `funnel.preview_opened`
> em `/metrics` vai começar a contar de 0 contra o cohort pós-fix.
> Não adianta esperar os números antigos voltarem.

### Verificação que tu mesmo pode fazer agora

```bash
# Pega 5 URLs e busca o tracker
node --env-file=.env.local -e "
import('@supabase/supabase-js').then(async ({createClient}) => {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const {data} = await s.from('projects').select('preview_url').not('preview_url','is',null).limit(5);
  for (const p of data) {
    const html = await fetch(p.preview_url).then(r => r.text());
    console.log(p.preview_url, html.includes('track.js') ? 'OK' : 'MISSING');
  }
});
"
```

---

## 5. Hipóteses — suportadas por dado vs especulação

### Suportadas por dado

- **US WhatsApp é canal errado.** 2.9% vs 8.4% BR. Confirmado n=70.
- **Reply rate cold WhatsApp BR é ~7-9%.** N=535, estável.
  Conversão pós-reply = 0% no modelo velho.
- **O vazamento principal pré-Fase-1 era `replied → paid`,
  não `sent → replied`.** 47 conversas, 0 vendas.

### Especulação (não medida)

- **Por que as 47 conversas pré-Fase-1 morreram.** Possíveis: preço
  mole/ambíguo (R$ 800–1500 era faixa, não número), oferta não
  ancorada em resultado, falta de urgência, lead não-decisor. **Não
  dá pra concluir sem ler as conversas e classificar.** Sem
  `lost_reason` populado, a única forma é leitura manual.
- **Estética é mau ICP pra Fase 1.** Pré-Fase-1 mostra 6.7% reply,
  abaixo da média. Pode virar irrelevante se Fase 1 (preview-first +
  R$ 997 + GEO específica) tiver dinâmica diferente. Esperar 100
  msgs.
- **Preview-first é mais ou menos eficiente que offer-first.** Não
  dá pra responder ainda; Fase 1 (preview-first) tem 22 msgs vs
  pré-Fase-1 majoritariamente offer-first.

### Não medível com schema atual

- Quantos leads que responderam eram donos vs recepção.
- Tempo médio entre "manda" do lead e "preview na mão".
- Engajamento real do preview (sem tracker).
- Se a oferta foi vista como cara/justa/barata.
- Se o lead leu o preview até o fim ou bouncing rápido.

---

## 6. Recomendações em ordem (todas pequenas)

### P0 — fixar agora

1. **Injetor pós-Claude-Code de tracker.** §4. Adicionar passo
   determinístico após geração: ler `app/layout.tsx` (ou page.tsx
   se layout não existir), checar se contém `<Script src=".../track.js"`,
   injetar antes de `</body>` se faltar. ~30 min. Sem isso, Fase 1
   roda às cegas até os 100 msgs e o kill switch é inconcluível.

### P1 — ações operacionais (1-2h cada)

2. **Auditar manualmente as 47 conversas pré-Fase-1 que tiveram
   reply.** Ler cada uma, classificar motivo de morte (preço,
   ghosting, prazo, "vou pensar", outro). Anotar em planilha
   simples ou em campo `notes` por place_id. Isso responde a
   pergunta que dashboard não responde.
3. **Adicionar coluna `lost_reason TEXT NULL` em leads** + dropdown
   no botão "Marcar como lost" do CRM (PLAYBOOK §4 já lista os
   motivos). Custo: 1 migração, 30min de UI. Impacto: a partir de
   amanhã todo lost gera dado estruturado.

### P2 — só executar se a Fase 1 ativar uma decisão

4. **`outreach_variant TEXT NULL` em leads** — só se tu confirmar
   que vai rodar 2+ variantes nos próximos 100 leads da Fase 1.
   Senão é dead infra.
5. **Predicado SQL pra HOT lead** (não migration, view ou WHERE
   inline em filtro de prospecção):
   ```sql
   -- HOT
   opportunity_score >= 4
     AND review_count >= 30
     AND rating >= 4.3
     AND website IS NULL
     AND country = 'BR'
     AND niche IN ('clínicas de estética') -- ou niche da fase em curso
   ```
   Documentar no PLAYBOOK e na UI do bot. Materializar como coluna
   apenas se a fórmula estabilizar após 100+ msgs.

### Não fazer

6. **NÃO migrar status enum pra 16 estados.** A máquina de estados
   atual (7 lead × 6 project) já é mais granular que o teu volume
   permite distinguir. 16 estados pra 0 cliente = procrastinação.
7. **NÃO adicionar 30 colunas novas.** Maioria (Instagram followers,
   decision_maker, owner_name) requer enrichment manual ou API
   externa que não justifica o custo até teres 5+ clientes pagantes.
8. **NÃO criar tabela/coluna `lead_temperature`.** Derivar via SQL
   (P2 acima). Materializar quando tiver score estabilizado.
9. **NÃO construir CSV export.** `/metrics` já entrega dashboard.
   Se precisar de slice ad hoc, consulta SQL direto via Supabase.

---

## 7. Plano dos próximos 50 leads (Fase 1)

PLAYBOOK §2 já define os parâmetros — esse plano só amarra com
instrumentação.

### Pre-flight (antes de mandar mais nenhuma)

- [ ] **Fixar preview tracker (§4).** Após fix, abrir 1-2 dos 92
  preview_urls existentes com `?v=PLACE_ID` pra confirmar que
  insert chega.
- [ ] Confirmar critério HOT do predicado SQL e listar os candidatos
  da Fase 1 que ainda não receberam outreach. Cap: 50.

### Durante (Dia 1-14)

- [ ] **Após cada 10 msgs:** abrir `/metrics`, anotar (a) reply
  rate, (b) preview open rate, (c) inboundCount delta. Tweet
  privado pra ti em planilha de 1 coluna.
- [ ] **Após cada reply:** ler a conversa, marcar mentalmente em
  qual dos 8 cenários do PLAYBOOK §3 caiu. Se cair em algo NOVO,
  anotar e adicionar ao playbook.
- [ ] **Após cada lost:** preencher `lost_reason` (após P1 #3
  estar feito). Antes disso, anotar em `notes`.

### Decisão Day-14

| Critério                | Reply rate | Vendas    | Decisão                                                    |
|-------------------------|------------|-----------|------------------------------------------------------------|
| 100+ msgs enviadas      | < 1%       | 0         | **Revisar oferta antes de expandir.** Auditar conversas.   |
| 100+ msgs enviadas      | ≥ 3%       | qualquer  | **Expandir pra veterinária** (Fase 2).                     |
| 100+ msgs enviadas      | 1-3%       | 0         | Decisão híbrida: ler 5 conversas mortas antes de decidir.  |
| < 100 msgs em 14 dias   | —          | —         | **Volume insuficiente.** Estender 7 dias e revisar.        |
| Qualquer cenário        | —          | 1+        | **Continuar.** Primeira venda é a maior alavanca.          |

### O que vale instrumentar pós-Fase-1 (não antes)

- `lost_reason` populado no botão de lost.
- Se Fase 2 ativar A/B de copy → adicionar `outreach_variant`.
- Se Fase 2 expandir geo → considerar coluna `geo_tier`
  (premium/comum) baseada em CEP ou bairro.

---

## 8. O que está respondido vs ainda em aberto

### Já respondido por dado (não precisa ser perguntado de novo)

- ICP, GEO, canal, ticket — definidos no PLAYBOOK.md §2 (Fase 1).
- US WhatsApp — confirmado morto.
- Reply rate cold BR WhatsApp — ~8% baseline.
- Cost per preview (R$ 4.32 IA) e margem (~70% no ticket de
  R$ 997) — calculados em `lib/metrics.ts`.

### Em aberto, precisa de leitura manual de conversas

- Por que as 47 conversas pré-Fase-1 morreram.
- Quais objeções dominam.
- Se preço foi mencionado em quantas (e qual a faixa de
  push-back).
- Se o pitch do preview foi vendendo "site" ou "mais clientes".

### Em aberto, precisa de Fase 1 rodar até 100 msgs

- Se preview-first BR converte melhor que offer-first BR.
- Se R$ 997 fixo + 50/50 fecha onde R$ 800-1500 não fechou.
- Se estética entrega o reply rate ≥ 3% que o kill switch exige.

---

## 9. Reconciliação com a claim do user

User afirmou: 500 BR offer-first + 20 BR preview-first + 50 US
preview-first = 570 envios.

Banco mostra: 627 envios totais (todas as eras), sendo 605
pré-Fase-1 e 22 Fase-1.

Diferença: 627 vs 570 = 57. Possíveis causas:
- Memória aproximada (claim era "~500", não exato).
- Inclusão de envios falhos retentados.
- Inclusão de leads marcados como `outreach_sent` mas em fluxo
  de teste/dummy.

Sem ação. Apenas registrar pra honestidade.

---

## Arquivos relacionados

- `scripts/audit-data.mjs` — script read-only que gera as seções
  numéricas deste documento. Reproduzir com
  `node --env-file=.env.local scripts/audit-data.mjs`.
- `lib/metrics.ts` — camada de métricas que alimenta `/metrics`.
- `docs/PLAYBOOK.md` — fonte da verdade pra Fase 1 (preço, kill
  switch, fluxo de venda).
- `AUDIT.md` — auditoria anterior (19/04) com regra dura "fechar
  primeiro cliente antes de qualquer refactor". Continua válida.
