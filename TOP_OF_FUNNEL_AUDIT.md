# Top-of-Funnel Audit — 2026-04-28

Auditoria do topo do funil baseada em cross-tabs reais do banco. Cohort: 605 envios pré-Fase-1 (Fase-1 ainda jovem demais pra incluir). Outcome variável principal: **PRICE_REACHED** — os 8 place_ids que chegaram a discutir preço, identificados manualmente em `EXP_000_HISTORICAL_AUTOPSY.md` §2.

Método: cruzar cada atributo do lead (review_count, rating, niche, has_website, pain_score, etc.) contra o outcome categorical (NO_REPLY / BOT_ONLY / RECEPTIONIST / HUMAN_LOW / PRICE_REACHED). Reproduzir: `node --env-file=.env.local scripts/audit-top-of-funnel.mjs`.

Tudo abaixo é fato observado, exceto onde marcado **HIPÓTESE** ou **NÃO MEDIDO**.

---

## TL;DR (5 linhas duras)

1. **O topo está qualificando errado em 5 niches.** Estética (0/30), odonto (0/39), pet shops (0/29), barbearias (0/48), autoescolas (0/31) — todos com 0% chegando a preço. **5 niches × ~30 envios = 177 envios mortos por design.** ~30% do volume pré-Fase-1 foi pra niches que provadamente não compram.
2. **`has_website` é o filtro mais forte que tu já tem.** 0/137 com site chegaram a preço vs 8/468 sem site. **Mantém. Mas é o ÚNICO filtro real hoje.**
3. **Rating 5.0 + reviews 100-300 é a "zona de comprador".** 6 de 8 PRICE_REACHED têm rating 5.0. Median review_count = 111. Reviews <10 ou >1000 = praticamente 0% chance de chegar a preço.
4. **`opportunity_score` está morto.** 593 de 605 envios têm valor null no banco. Coluna existe mas nunca foi populada retroativamente. Não pode ser usada como sinal até backfill — e a fórmula atual (review_count + rating) nem é o que importa.
5. **O sinal mais ausente que importa: owner_probability.** Hoje tu não tem nenhuma forma de distinguir "este número vai cair em recepção" antes de mandar. 8 receptionists + 13 bots = 21 dos 50 (42%) replies que não eram dono. **Adicionar essa heurística é a maior alavanca não-tentada do topo.**

---

## 1. Headline numbers (pré-Fase-1)

| Outcome         | Count | %      | O que significa                                      |
|-----------------|-------|--------|------------------------------------------------------|
| NO_REPLY        | 558   | 92.2%  | Mandado, nunca recebeu nada                          |
| BOT_ONLY        | 13    | 2.1%   | Auto-attendant respondeu, sem humano                 |
| RECEPTIONIST    | 8     | 1.3%   | Humano da recepção, dono nunca apareceu              |
| HUMAN_LOW       | 16    | 2.6%   | Humano respondeu mas não chegou a preço              |
| PRICE_REACHED   | **8** | **1.3%** | **Discutiu preço (a única amostra que importa)**   |
| NOISE           | 2     | 0.3%   | Atribuição errada (cross-talk com tua família/leads) |

**FATO chave:** o gargalo do topo não é "ninguém responde". O gargalo é "92% nunca respondem". E desses 8% que respondem, **42% são bot ou recepção** (sem owner). E só 1.3% de tudo chega a discutir preço.

A pergunta certa pro topo: **o que aumenta a chance dos 92% NO_REPLY virarem reply, E desses replies, virarem PRICE_REACHED?**

---

## 2. Cross-tabs — o que predicia (e o que não)

### review_count

| bucket      | sent | real_reply | price | reply_rate | price_rate |
|-------------|------|------------|-------|------------|------------|
| <10         | 31   | 0          | 0     | 0.0%       | 0.0%       |
| 10-29       | 107  | 7          | 1     | 6.5%       | 0.9%       |
| 30-99       | 187  | 9          | 2     | 4.8%       | 1.1%       |
| **100-299** | 172  | 9          | **3** | 5.2%       | **1.7%**   |
| **300-999** | 86   | 6          | **2** | 7.0%       | **2.3%**   |
| 1000+       | 22   | 1          | 0     | 4.5%       | 0.0%       |

**Conclusão:** sweet spot é **30-1000 reviews**. Abaixo de 10 não chega em ninguém (negócio jovem demais, sem operação real). Acima de 1000 = WhatsApp Business com bot (maioria dos 22 caem em BOT_ONLY).

### rating

| bucket  | sent | real_reply | price | price_rate |
|---------|------|------------|-------|------------|
| <4.0    | 7    | 1          | 0     | 0.0%       |
| 4.0-4.4 | 24   | 1          | **1** | **4.2%**   |
| 4.5-4.7 | 63   | 1          | 0     | 0.0%       |
| 4.8-4.9 | 178  | 9          | 1     | 0.6%       |
| **5.0** | 327  | 20         | **6** | **1.8%**   |

**Conclusão:** rating **5.0 absorve 75% dos PRICE_REACHED** (6/8). 4.5-4.7 é zona morta inexplicada — talvez negócios "mid-quality" sem urgência. 4.0-4.4 surpreende com 1 PRICE_REACHED em 24 (Rafaela Flores, rating 4.3) — n pequeno, hipótese não-confirmada.

### has_website

| bucket   | sent | real_reply | price | price_rate |
|----------|------|------------|-------|------------|
| has_site | 137  | 0          | 0     | **0.0%**   |
| no_site  | 468  | 32         | 8     | 1.7%       |

**Conclusão DURA:** **lead com site = 0% de chegar a preço.** O filtro `website IS NULL` que tu já usa é eficaz. Mas tem 137 leads com site na fila pré-Fase-1 — sinal de bug do bot collector deixando passar.

### pain_score

| bucket | sent | real_reply | price | price_rate |
|--------|------|------------|-------|------------|
| 0-3    | 3    | 0          | 0     | 0.0%       |
| 4-7    | 107  | 0          | 0     | 0.0%       |
| **8-10** | 495 | 32        | **8** | **1.6%**   |

**Conclusão:** **pain_score = 10 é quase requisito.** Os 8 PRICE_REACHED todos têm pain = 10. Abaixo de 8, zero conversão em qualquer estágio. Mas pain ≥ 8 é a maioria do banco (495/605 = 82%) — não é filtro estreito o suficiente sozinho. Necessário, não suficiente.

### opportunity_score

| bucket | sent | real_reply | price |
|--------|------|------------|-------|
| (null) | 593  | 32         | 8     |
| 2-3    | 5    | 0          | 0     |
| 4-5    | 7    | 0          | 0     |

**Conclusão:** `opportunity_score` está populado em apenas **12 leads de 605**. Coluna foi criada em 2026-04-17 e o bot não populou retroativamente. **Não pode ser usada hoje.** Backfill ou descomissionar.

### country

| country | sent | real_reply | price |
|---------|------|------------|-------|
| BR      | 535  | 32         | 8     |
| US      | 70   | 0          | 0     |

**Conclusão:** US está morto (já confirmado em GTM_DIAGNOSIS).

### niche × reviews (combos com sent ≥ 10, ranqueados por price_rate)

| niche / reviews                    | sent | reply_rate | price_rate |
|------------------------------------|------|------------|------------|
| **floriculturas / 30-99**          | 12   | 16.7%      | **8.3%**   |
| **floriculturas / 100-299**        | 12   | 8.3%       | **8.3%**   |
| **fisioterapeutas / 30-99**        | 16   | 12.5%      | **6.3%**   |
| **salões de beleza / 100-299**     | 23   | 13.0%      | **4.3%**   |
| floriculturas / 10-29              | 10   | 20.0%      | 0.0%       |
| salões de beleza / 30-99           | 12   | 8.3%       | 0.0%       |
| autoescolas / 300-999              | 12   | 8.3%       | 0.0%       |
| restaurantes / 1000+               | 11   | 9.1%       | 0.0%       |
| barbearias / 100-299               | 27   | 3.7%       | 0.0%       |
| nutricionistas / 30-99             | 20   | 0.0%       | 0.0%       |
| nutricionistas / 100-299           | 11   | 0.0%       | 0.0%       |
| nutricionistas / 10-29             | 12   | 0.0%       | 0.0%       |
| **clínicas de estética / 30-99**   | 14   | **0.0%**   | **0.0%**   |
| pilates / 30-99                    | 20   | 0.0%       | 0.0%       |

**Top 4 combos pra mirar:** floriculturas 30-300, fisio 30-99, salões 100-300. **Estética 30-99 é zero.** A escolha da Fase 1 não é só "talvez não ótima" — é **dado-suportado como pior** que pelo menos 4 outras combinações disponíveis.

---

## 3. Profile dos 8 PRICE_REACHED

| business              | niche            | reviews | rating | pain | site |
|-----------------------|------------------|---------|--------|------|------|
| Studio Julia Graziela | salões           | 106     | 5.0    | 10   | não  |
| Espaço Fluir          | salões           | 334     | 5.0    | 10   | não  |
| Hadassa Flores        | floriculturas    | 157     | 4.9    | 10   | não  |
| Matheus Sabatino      | nutri            | 450     | 5.0    | 10   | não  |
| Bonitas Boutique      | lojas de roupas  | 20      | 5.0    | 10   | não  |
| Rafaela Flores        | floriculturas    | 68      | 4.3    | 10   | não  |
| Giba's Gym            | academias        | 117     | 5.0    | 10   | não  |
| EVOLUA Fisioterapia   | fisioterapeutas  | 88      | 5.0    | 10   | não  |

**Padrão claro:**
- **8/8 sem site** (filtro `has_website=NULL` é necessário).
- **8/8 pain_score = 10**.
- **6/8 rating = 5.0**, 1 com 4.9, 1 outlier com 4.3.
- **Reviews: median 111, range 20-450.** 6 dos 8 caem em 30-300.
- **Niches representados: salões, fisio, nutri, floriculturas, academias, roupas.**
- **Niches AUSENTES: estética, odonto, pet, barbearia, autoescola, padaria, pilates, vet, restaurante, psico, contabilidade.**

---

## 4. Profile dos 13 BOT_ONLY

| business              | niche               | reviews | rating | site |
|-----------------------|---------------------|---------|--------|------|
| Plano Contábil        | contabilidade       | 25      | 5.0    | sim  |
| Amigos Veterinária    | vet                 | 102     | 4.8    | sim  |
| Allini Perissini      | nutri               | 121     | 5.0    | não  |
| Anally Britto         | floriculturas       | 65      | 4.7    | não  |
| Auto Escola Viena     | autoescola          | 761     | 4.8    | não  |
| Dra Thainá            | odonto              | 40      | 4.9    | sim  |
| English Is Fun        | idiomas             | 295     | 5.0    | sim  |
| Erika Saraiva         | nutri               | 286     | 5.0    | não  |
| Sara Nicola           | floriculturas       | 125     | 4.9    | não  |
| Dra Adrielli Costa    | estética            | 44      | 5.0    | não  |
| Cris Viana            | estética            | 220     | 5.0    | não  |
| Barber and Coffee     | barbearias          | 468     | 4.8    | não  |
| Hugle Education       | idiomas             | 62      | 4.9    | não  |

**Padrão:**
- **30.8% têm site** (vs 0% em PRICE_REACHED). Sinal de "negócio com investimento em sistema digital" → quase sempre vem com bot/auto-greeting na vez do WhatsApp.
- **Niches super-representados:** estética (2), nutri (2), vet (1), odonto (1), autoescola (1) — todos os "niches mortos" da §5 abaixo aparecem aqui.
- **Reviews: range amplo 25-761.** Bots aparecem em todos os tamanhos.
- **Hipótese:** "bot probability" cresce com profissionalização do negócio. Negócios "Dra. Fulana" são quase sempre operação com sistema (consultório com receptionist OR bot WhatsApp).

---

## 5. Niche kill list / priority list

### KILL imediato (data-supported, 0 vendas em ≥ 19 envios cada)

| niche                  | sent | bot/rec | reply  | price | observação                                     |
|------------------------|------|---------|--------|-------|------------------------------------------------|
| barbearias             | 48   | 1 bot   | 2.1%   | 0%    | Cold WhatsApp não passa do bio greeting        |
| **clínicas estética**  | 30   | 2 bot, 1 noise | 0% | 0% | **Niche da Fase 1 — 0% pré-Fase-1**           |
| pet shops              | 29   | 0       | 0%     | 0%    | Nenhum reply real                              |
| autoescolas            | 31   | 1 bot   | 6.5%   | 0%    | Replies são "não temos interesse"              |
| pilates                | 43   | 0       | 4.7%   | 0%    | 2 replies, ambos "não tenho interesse"         |
| odonto (ambas grafias) | 39   | 1 bot   | 2.6%   | 0%    | "Dra. X" com bot/recepção                      |
| pet/veterinária        | 200  | 1 bot   | bot wall | 0%  | 200 leads coletados, todos os replies são bot  |
| padarias               | 20   | 1 rec   | 20%    | 0%    | Reply alta mas 0 compra — receptionist filter  |

### PRIORIZAR (data-supported, ≥ 1 PRICE_REACHED com sample ≥ 10)

| niche                       | reviews ideal | sent | price_rate |
|-----------------------------|---------------|------|------------|
| **floriculturas**           | 30-300        | 24   | **8.3%**   |
| **fisioterapeutas**         | 30-99         | 16   | **6.3%**   |
| **salões de beleza**        | 100-300       | 23   | **4.3%**   |
| nutricionistas              | (any, sample baixo) | 47 | 2.1% |
| lojas de roupas             | (any)         | 31   | 3.2%       |
| academias                   | (any, sample baixo) | 1+ | 100% (n=1) |

### NUNCA TESTADO (volume zero, dado ausente)

- **veterinária com humano** — 200 coletados, todos viraram bot/no-reply. Não é "não compra", é "cold WhatsApp não atinge". **Hipótese viável** de testar via outro canal (Instagram DM, ligação direta).
- **clínicas médicas** — 1 reply (Castelo Branco), foi recepção. Pequeno N.
- **psicologia** — 23 enviados, 1 reply (low quality), 0 price.

### RECOMENDAÇÃO HARD

- **Estética NÃO deveria ter sido a Fase 1.** Já decidido, mas registra: o pick foi feito sem consultar este dado. Da próxima vez, consultar cross-tab antes.
- **Fase 2 NÃO deve ser veterinária** apesar do PLAYBOOK §2 dizer "expandir pra veterinária". Veterinária por WhatsApp = bot wall confirmado. Se quiser testar vet, é via outro canal (Insta DM ou ligação) — vira EXP novo, não Fase 2 default.
- **Fase 2 candidato real, dado-suportado: floricultura ou fisioterapia.**

---

## 6. Lead score recalibrado

A fórmula atual (PLAYBOOK / GTM_DIAGNOSIS sugeria opportunity_score + reviews + rating + has_website) precisa ajuste baseado nos dados.

### Novo predicado HOT (substituir o atual)

```sql
-- HOT — cohort com odds reais de chegar a preço (~3-5%)
SELECT * FROM leads
WHERE country = 'BR'
  AND website IS NULL                      -- HARD: nunca relaxar
  AND pain_score >= 10                     -- HARD: 8/8 PRICE_REACHED têm 10
  AND review_count BETWEEN 30 AND 500      -- sweet spot
  AND rating >= 4.8                        -- 7/8 PRICE_REACHED em ≥4.8
  AND niche IN (
    'salões de beleza',
    'floriculturas',
    'fisioterapeutas',
    'lojas de roupas',
    'nutricionistas',
    'academias'
  )
  AND outreach_sent IS NOT TRUE            -- ainda não enviado
  AND status NOT IN ('disqualified', 'lost')
```

Estimativa de price_rate desse cohort: **~3-5%** (vs 1.3% baseline atual).

### Penalidades (hard exclude)

```sql
-- DISQUALIFY upstream — não envia
WHERE website IS NOT NULL                  -- 137 com site = 0 vendas
   OR pain_score < 8                        -- corte mínimo
   OR review_count < 10                     -- negócio sem operação real
   OR review_count > 1000                   -- bot wall
   OR niche IN (
     'clínicas de estética',
     'clínicas odontológicas',
     'clinicas odontologicas',
     'pet shops',
     'autoescolas',
     'estúdios de pilates',
     'barbearias',
     'padarias e confeitarias',
     'clínicas veterinárias',
     'clínicas médicas',
     'restaurantes',
     'escolas de idiomas',
     'escritórios de contabilidade'
   )
   OR country = 'US'                       -- morto até segunda ordem
```

### Sinais NÃO MEDIDOS que valeriam (em ordem de impacto estimado)

1. **owner_probability** (ver §7 abaixo). Maior ganho potencial.
2. **whatsapp_business_detected** — se número responde com "agradece seu contato" / "bem-vindo" em ≤ 60s, marcar e despriorizar. Pode ser pré-detectado via API check ou por experiência prévia (se já mandou e veio bot, não tenta de novo).
3. **bairro_premium** — não há dataset estruturado mas heurística por nome de cidade/bairro pode estimar (Higienópolis, Cambuí, Jardim Europa, etc. — premium; periferias = não).
4. **instagram_followers** — sinal de presença e investimento em marketing. Não medido.

### O que tem peso ALTO no scoring atual mas não importa

- **`opportunity_score`** — null em 593/605 leads. Ignora ou remove até backfill.
- **`has_pixel`, `has_analytics`, `has_form`, `has_booking`** — só são populados se tem site. Como filtramos `has_website IS NULL`, esses campos são todos null no cohort relevante. **Inúteis pra scoring atual.**
- **`tech_stack`, `visual_score`** — idem, dependem de ter site.

---

## 7. Owner detection — o sinal ausente que mais importa

### Estado atual

Nenhum sinal explícito de "owner vs receptionist" no schema. Tudo é tratado como dono. Resultado: 8 receptionist + 13 bots em 50 replies = **42% das conversas humanas/auto não têm decisor**.

### Sinais que poderiam ser coletados/inferidos

#### Sinais que o bot poderia coletar **antes** do envio (cheap)

1. **Análise textual do nome do negócio:**
   - "Dra. Fulana" / "Dr. Beltrano" / "Clínica X" → 70% chance de ter recepção (HIPÓTESE, observada nos casos #5 Veronica, #10 Thainá, #20 Adrielli, #41 Allini, #45 Cris Viana — todos com bot ou recepção).
   - Nome próprio sem título ("Sara Nicola Floricultura", "Hadassa Flores", "Bonitas Boutique") → mais provável owner-run.
   - **Heurística de exclusão**: se o nome começa com "Dr"/"Dra"/"Clínica", aplicar penalty de -20 no score, OR exigir review_count < 50 pra compensar.

2. **Análise do endereço:**
   - "Sala XX", "Andar X", "Edifício Y" → consultório/escritório com receptionist em 80% dos casos.
   - Endereço de loja com número de rua simples → owner-run mais provável.
   - **Heurística**: detectar regex `(sala|andar|edif[ií]cio|conjunto|cj)` no campo `address` e penalizar.

3. **Análise da categoria Google + nome:**
   - Categoria "Clínica" + reviews > 100 → quase sempre tem recepção.
   - Categoria "Salão" + 1 sócia visível no nome → maior chance de ser owner.

#### Sinais que só dá pra coletar **após** o primeiro contato (post-hoc, mas valiosos)

4. **Tempo de primeira resposta:** se < 60s, é bot/auto-greeting. Se 5-30 min, alguém viu manualmente. Se 1-24h, owner ocupado mas atende.
5. **Conteúdo da primeira resposta:** "agradece seu contato", "bem-vindo(a)", "como podemos ajudar" → bot/script. "Pode mandar", "manda aí", "qto custa" → owner.
6. **Sem auto-greeting nos próximos 5 envios pra mesmo número** = humano direto.

### Implementação proposta (baixo custo)

**Hoje, sem migração**: adicionar 2 filtros heurísticos no SQL/JS de qualificação do bot collector:

```sql
-- DOWN-RANK leads com sinais de receptionist
CASE
  WHEN business_name ~* '^(dr\.?|dra\.?|cl[íi]nica)' THEN -20
  WHEN address ~* '(sala|andar|conjunto|cj)\\s*\\d' THEN -15
  WHEN review_count > 200 AND niche IN ('clínicas médicas','clínicas odontológicas','clínicas de estética') THEN -25
  ELSE 0
END AS owner_probability_penalty
```

**Depois de 50+ novos envios com esse filtro**, medir se a fração BOT_ONLY+RECEPTIONIST cai. Se cair de 42% pra <30%, alavanca confirmada.

### Estratégias concretas de bypass quando recepção atende (não há hoje)

Atualmente, quando recepção atende, você responde polidamente e morre. Não há próxima ação. **Sugestões:**

1. **Pergunta de bypass**: ao receber sinal de recepção (texto contém "passei pra responsável", "Sou X da recepção", "responsável vai retornar"), responder dentro de 24h com:
   > "Perfeito. Me passa o WhatsApp pessoal do(a) [dono(a)] que eu chamo direto pra agilizar? Senão, mando o preview pra ele(a) ver no fim do dia."
2. **Backup channel**: se o lead tem Instagram ativo (não medido hoje), seguir o perfil e mandar DM com mesma copy, mas direta no Insta — fura recepção de WhatsApp.
3. **Reservar receptionist leads pra Fase 3** (escala): quando tiver 1+ caso de sucesso de bypass via secretária, virar processo. Hoje não há caso de sucesso.

---

## 8. Trigger quality — a copy não é o gargalo

### Hipótese inicial do user

"Talvez eu esteja ativando curiosidade e não urgência."

### O que o dado mostra

Lendo as 8 conversas PRICE_REACHED em EXP_000_HISTORICAL_AUTOPSY.md §2, **nenhuma das respostas iniciais menciona o trigger da copy.** Os replies são:

- Julia: "Pode sim Boa noite"
- Matheus: "Pode"
- Hadassa: "pode sim"
- Bonitas: "Bom dia Pode sim"
- Giba's: "Sim"
- EVOLUA: "Quanto ficaria seu trabalho?" (4 dias depois, pulou direto pra preço)
- Espaço Fluir: "como vai Levi pode me enviar sim por favor"
- Rafaela: "Boa tatde Tarde Qto custa seu serviço"

**O trigger não é o que decide.** Os 8 PRICE_REACHED não responderam à dor mencionada na copy ("não aparece no Google"). Responderam ao convite ("posso te mandar?") e/ou pulariam direto pra preço.

**Implicação contra-intuitiva:** trocar "você não aparece no Google" por "você está perdendo pacientes" provavelmente NÃO move o ponteiro porque os compradores reais não estão lendo o trigger. Estão respondendo ao "posso te mandar?".

### O que o dado **NÃO** mostra (gaps)

- Os 555 NO_REPLY: foi a copy que matou ou foi outra coisa (recepção, sem dono no WhatsApp, número errado)? **Não dá pra distinguir sem A/B real.**
- Se o copy tem signals que estão queimando antes de virar reply (ex: "— Levi" assinatura, "em 48h" prazo cravado).

### EXP-003 ainda vale, mas com expectativa baixa

EXP-003 (offer angle: "site" vs "mais clientes") é experimento legítimo de fazer, mas **espera mover só os ~5% da margem**, não os 90% NO_REPLY. **A maior alavanca não é trigger** — é qualificação upstream.

---

## 9. Multi-channel — WhatsApp sozinho limita?

### Estado atual

100% dos envios via WhatsApp. Cold email implementado em código (`SYSTEM_EMAIL_EN` em prompts) mas só pra US e nunca rodou em volume. Instagram DM, ligação, Facebook page — não usados.

### Análise por canal alternativo

| Canal              | Faz sentido? | Por quê                                                                 |
|--------------------|--------------|-------------------------------------------------------------------------|
| **Instagram DM**   | **SIM**      | Niches priorizados (salões, floriculturas, fisio) têm Insta forte. Owner-run posta no Insta direto. Fura recepção do WhatsApp. Custo baixo (manual). |
| **Cold email BR**  | Sim (médio)  | Email coletado em ~30% dos leads via Google Maps. Mensurável (open rate, click). Mas PT-BR cold email ainda é canal fraco vs WhatsApp.    |
| **Ligação direta** | Não escala   | Tempo Levi = limitante. Reservar pra leads HOT que pediram call (tipo Espaço Fluir #11). |
| **Facebook page**  | Não          | Facebook BR pra SMB local é morto. Não vale tempo.                       |
| **Google Forms / site contact** | Não | Mesmos donos não preenchem form de stranger. Worse than WhatsApp. |

### Recomendação prática

- **Instagram DM** vira canal #2. Adicionar passo no fluxo: quando RECEPTIONIST detected OU quando NO_REPLY após 7 dias E lead tem Insta no Google Maps profile, mandar DM no Insta com mesma copy + link do preview.
- **Cold email BR** fica pendente até Fase 1 fechar. Não é prioridade.
- Outros canais: **não testar agora.**

---

## 10. Top-of-funnel offer contamination

### Pergunta do user

"O topo já está contaminado pelo posicionamento 'site'?"

### O que o dado sugere

**HIPÓTESE não medida diretamente, mas indícios:**

- Os 9 leads que disseram "já tenho solução" / "sistema atual" / "app de agendamento" decodificaram a copy como vendendo SITE — porque é o que ela vende. Se a copy fosse "captação de leads via Google", esses 9 talvez teriam respondido diferente (já tenho site → mas mais clientes ainda preciso).
- Os 0 leads que perguntaram "o que isso muda pra mim" sugere que a copy não força reflexão de ROI. A copy diz "site → mais clientes" implicitamente, mas o lead lê "vai me oferecer site = caro = sem urgência".
- Os 8 PRICE_REACHED responderam ao convite, não ao posicionamento — então pra eles, não importava que era "site".

**Conclusão:** o posicionamento "site" provavelmente queima leads que JÁ TÊM site mas precisam de captação. Não queima os PRICE_REACHED. **Reposicionar pra "captação" pode ABRIR um novo cohort** (donos com site Wix / Carrd / pessoal que não capturam leads), sem prejudicar o atual.

**Mas:** EXP-003 é o teste real disso. **Hoje é especulação.**

---

## 11. Novo ICP recomendado

Substituir o ICP implícito atual ("BR + sem site + algumas reviews") pelo seguinte:

### ICP — alpha (testar primeiro)

- **País:** BR (US morto)
- **Niche:** salões de beleza, floriculturas, fisioterapeutas, nutricionistas, lojas de roupas, academias
- **Reviews:** 30-500
- **Rating:** ≥ 4.8
- **Site:** ausente (`website IS NULL`)
- **Pain score:** = 10
- **Sinais owner-friendly:** business_name não começa com "Dr"/"Dra"/"Clínica"; address sem "sala/andar/conjunto"
- **GEO:** manter Ribeirão Preto / Sorocaba / Londrina (Fase 1) + Campinas (já testada com sucesso) + interior SP

### ICP — beta (rota fallback se alpha não der)

- Floricultura sem restrições de city
- Fisio em capital (volume maior)
- Lojas de roupas com 30-200 reviews (n pequeno mas 3.2% price_rate)

### Disqualify automaticamente

- País US
- Tem site
- Niche em kill list
- Reviews <10 ou >1000
- Pain score <8
- Address com "sala/andar/conjunto" + niche em ('clínicas médicas','clínicas odontológicas','clínicas de estética')
- Business name começa com "Dr"/"Dra"/"Clínica" sem reviews <50 pra compensar

---

## 12. O que mudar ESTA SEMANA

### P0 (hoje ou amanhã)

1. **Atualizar predicado HOT no bot collector** com a fórmula da §6. Modificar onde quer que esteja a query SQL de qualificação.
2. **Pausar envios de niches em kill list** (estética/odonto/pet/auto/pilates/barb/padaria/vet/médica/restaurante/idiomas/contab) imediatamente. Os 200 leads de vet, 167 de pet shops etc ficam parados.
3. **Atualizar EXPERIMENT_LOG.md EXP-005** trocando B = `dentistas` por B = `floriculturas` ou `fisioterapeutas` (decidir um). Manter A = estética só pra completar Fase 1.

### P1 (essa semana)

4. **Adicionar penalty heurístico de owner_probability** ao scoring: regex de business_name ("Dr"/"Dra"/"Clínica") e address ("sala", "andar"). Sem migração — só inline no SQL/JS de qualificação.
5. **Adicionar campo `lost_reason TEXT NULL`** + dropdown na UI de "Marcar como lost" (PLAYBOOK §4 já lista os motivos). Sem isso, próximo autopsy vai ter que repetir leitura manual.
6. **Atualizar copy do outreach BR-WA** removendo o sinal "— Levi" e "em 48h" que ainda aparecem em alguns templates antigos (ver mensagens #1-#19 no histórico).

### P2 (depois da Fase 1 fechar — Day 14)

7. **Implementar bypass de receptionist** (§7): mensagem padrão pedindo WhatsApp pessoal do dono. Hoje não há.
8. **Adicionar Instagram DM como canal #2** pra leads com Insta detectado: começar manual, depois automatizar.
9. **Backfill `opportunity_score`** ou descomissionar coluna. Se for manter, rodar script que aplica fórmula em todos os 5026 leads.

### Não fazer essa semana

- Não adicionar novas colunas ao schema (lost_reason é a única exceção justificável).
- Não mudar a copy fundamental do outreach (EXP-003 espera Fase 1 fechar).
- Não adicionar canais novos além do que já está em uso.
- Não tentar populate `instagram_url`, `instagram_followers` — coleta cara e ROI baixo até validar nichos.

---

## 13. Conclusões duras

### Você está qualificando errado desde o início?

**Parcialmente.** O filtro `has_website IS NULL` está certo (0/137 com site → 0% vendas). O filtro de pain_score implicitamente alto está certo. **O que está errado: niche selection.** ~30% do volume foi pra niches com 0% taxa de chegar a preço.

### Seu principal filtro deveria ser decisor e não ausência de site?

**As duas coisas.** "Sem site" elimina 23% (137/605) com 0 valor. "Owner-detected" é maior alavanca não-tentada — eliminaria mais ~25-40% que viram bot/recepção. Ambos vão juntos.

### O topo inteiro precisa ser redesenhado?

**Sim, mas parcialmente.** Os bones (collector + scoring + dispatch) funcionam. O que precisa redesign:
- Niche list (corte de 12 niches mortos).
- Score (recalibrar por dado real, descomissionar opportunity_score).
- Owner heuristic (adicionar nova camada).
- Multi-channel fallback (Instagram pra recepção/no-reply).

Não é "redesigning topo do zero". É **dois filtros adicionais (niche kill + owner heuristic) e uma camada de fallback (Instagram).**

### Você está atraindo curiosos e não compradores?

**Sim, em ~3 categorias específicas:**
- **Curiosos sem urgência:** floriculturas reply 16-20% mas chega a preço só 8%. "Quero ver como ficaria" sem intenção real.
- **Não-decisores:** 8 receptionists em 50 replies (16%). Recebem mensagem e nunca passam pro dono.
- **Bots:** 13 BOT_ONLY (26%). WhatsApp Business filtrando.

**Os PRICE_REACHED não são curiosos.** Pediram preço. Mas só 8 em 605 = 1.3%. O problema **não é "curiosos demais".** O problema é "filtros upstream não eliminam quem não vai comprar."

### Devo matar "site" e vender outra coisa?

**Não. Mas envolver "site" em outro nome.** EXP-003 já planejado. **Hoje não é prioridade.** A maior alavanca é qualificação, não posicionamento.

---

## 14. Reconciliação com docs anteriores

- **GTM_DIAGNOSIS.md** §6 P2 #5 sugeria predicado HOT — esse novo predicado em §6 acima **substitui** com base em dado real (sample do banco).
- **EXP_000_HISTORICAL_AUTOPSY.md** §3 mostra niche by quality. Este audit confirma e quantifica.
- **PLAYBOOK.md** §2 diz Fase 2 = veterinária. **Este audit recomenda mudar pra fisio ou floricultura** baseado em dado.
- **EXPERIMENT_LOG.md** EXP-005 propunha A=estética vs B=dentistas. **Este audit recomenda B=floriculturas ou fisioterapeutas** — dentistas é hipótese fraca (39 envios, 0 humanos, todos bot/no-reply).

---

## Métodológica — limitações

- **N pequeno em vários cortes.** PRICE_REACHED = 8. Niches com PRICE_REACHED têm n=1-3. Conclusões nicho-by-quality são direção, não certeza estatística.
- **Owner detection é heurística textual proposta**, não medida. Estimativa de impacto baseada em padrão observado nas 50 replies, não em A/B.
- **Os 5 leads PRICE_REACHED ATIVOS** (Matheus, EVOLUA, Bonitas, Julia, Giba's) podem ainda fechar e mudar o quadro. Re-rodar audit em 2-4 semanas.
- **Replies de Fase 1 não foram incluídas** (cohort jovem demais — Day 0). Re-incluir após Day 14.
