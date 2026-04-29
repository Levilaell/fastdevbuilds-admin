# EXP-000 — Historical Funnel Autopsy

Data: 2026-04-28 ~22h.
Método: análise manual das 50 conversas com `last_human_reply_at != null` no banco. Cada uma lida end-to-end, classificada em 6 dimensões (qualidade, dono vs recepção, perguntou preço, perguntou prazo, motivo de morte, sinal de comprador real). Agregado em tabelas. Reproduzir: `node --env-file=.env.local scripts/pull-replied-conversations.mjs > /tmp/replied.md`.

Tudo abaixo é fato observado nas conversas, exceto onde marcado **HIPÓTESE** ou **NÃO MEDIDO**.

---

## TL;DR (5 linhas duras)

1. **A reply rate de 7.8% é mentira contábil.** ~30% dos "replies" são bots/auto-attendants. Real human reply rate ≈ **5-6%**. O sistema está classificando "Olá, Confeitaria agradece seu contato" como reply humano.
2. **Recepção/secretária intercepta ~25% das conversas.** Você está vendendo pra quem nem sabe se o negócio precisa de site. Sem mecanismo de bypass do filtro humano-secretária, a venda morre antes do dono ver.
3. **Só 8 de 605 (1.3%) chegaram a discutir preço.** Desses 8, 0 fecharam — mas 5 estão ATIVOS essa semana ainda. O "0 vendas" é parte funil jovem, parte produto travado.
4. **Reflexo de desconto está matando a venda.** Em 2 conversas (Studio Julia, Hadassa) você ofereceu R$ 1200 → lead silenciou ou recusou → você dropou R$ 900 dias depois. Isso destrói percepção de valor e ensina o lead a esperar contra-oferta.
5. **Estética foi pick errado pra Fase 1.** 0/4 estéticas pré-Fase-1 chegaram a preço. Quem chegou foram nutricionista (Matheus), salão (Julia), floricultura (Hadassa), fisio (EVOLUA). **Veterinária nunca foi testada.**

---

## 1. Headline numbers (corrigidos pelo manual)

| Métrica                                      | Antes (cru do banco) | Depois (manual)       |
|----------------------------------------------|----------------------|-----------------------|
| Sends pré-Fase-1                             | 605                  | 605                   |
| "Replies" segundo `last_human_reply_at`      | 47                   | 47                    |
| Reply rate "oficial"                         | 7.8%                 | 7.8%                  |
| Replies que são auto-replies/bots            | —                    | **15 dos 50 lidos** (~30%) |
| Replies humanos reais                        | —                    | **~35 dos 50**        |
| **Reply rate humano real (estimado)**        | —                    | **5.8%** (35/605)     |
| Conversas que chegaram a preço               | —                    | **8** (1.3% sent)     |
| Conversas chegando a preço **ATIVAS hoje**   | —                    | **5** (pending close) |
| Vendas fechadas                              | 0                    | 0                     |

**FATO:** dos 8 que chegaram a preço, 5 são desta semana (24-27/abr). O "0 vendas" pré-Fase-1 não é tese fechada — é funil ainda em movimento. Mas é fato que nenhum chegou a PIX.

---

## 2. Classificação manual das 50 conversas

Notação: O = dono, R = recepção/secretária, B = bot, X = noise (atribuição errada).

| # | Negócio | Niche | Status | Quem | Qualidade | Preço? | Prazo? | Call? | Motivo de morte / estado |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Studio Giselle | salões | negotiating, preview_sent | O | LOW | — | — | — | Ghost — preview enviado D+8, sem resposta |
| 2 | Confeitaria Ponto Nick | padarias | negotiating, preview_sent | R | MED | — | — | — | "proprietária viajando", recepção atendeu, owner nunca voltou |
| 3 | Studio Julia Graziela | salões | negotiating, preview_sent | O | **HIGH** | **R$ 1200** | — | — | "p/ ver se consigo fazer agora" → silêncio → você dropou R$ 900 hoje |
| 4 | Hugle Education | idiomas | lost | B | NOISE | — | — | — | AI assistant respondendo |
| 5 | Veronica Fisio | fisio | lost, preview_sent | O | LOW | — | — | — | "Sou apenas uma amadora" → você perguntou WhatsApp/form → ghost |
| 6 | Matheus Sabatino | nutri | negotiating, adjusting | O | **HIGH** | **R$ 1200** | — | — | ATIVO — "Estes 1200 reais você flexibiliza no cartão?" 22/abr, sem follow-up tua |
| 7 | Opera Boulangerie | padarias | lost | O | HIGH | — | — | — | Premise errado — corrigiu polidamente que aparecem no Google |
| 8 | Plano Contábil | contab | lost | B | NOISE | — | — | — | IVR menu |
| 9 | Amigos Vet | vet | lost | B | NOISE | — | — | — | AI assistant |
| 10 | Dra Thainá | odonto | lost | B | NOISE | — | — | — | Greeting bot |
| 11 | Espaço Fluir | salões | lost, preview_sent | O→R | **HIGH** | — | — | **YES** | Cristina (dona) pediu call no celular pessoal → você não conseguiu adicionar → Ana da recepção intermediou → morreu |
| 12 | Salão Unike | salões | negotiating, preview_sent | R | MED | — | — | — | "Mandei para o Fabio" — recepção delegou, Fabio não voltou |
| 13 | George Cabeleireiros | salões | lost | R | LOW | — | — | — | "Pode entrar em contato com esse numero" — recepção redirecionou, você não foi atrás |
| 14 | Barber and Coffee | barbearia | lost | B | NOISE | — | — | — | Greeting bot |
| 15 | Erika Saraiva | nutri | sent | B | NOISE | — | — | — | Intake bot pra agendamento |
| 16 | Blusinha & Cia | roupas | negotiating | R | LOW | — | — | — | "Em que posso ajudar?" — recepção, você desistiu rápido |
| 17 | Super Linda | roupas | sent | R | LOW | — | — | — | "Passarei sua mensagem para o setor responsável" — recepção, sem retorno |
| 18 | Floricultura Bela Flor | flori | sent | O | LOW | — | — | — | "Como posso ajudar você hoje?" — você nunca respondeu |
| 19 | Sara Nicola Floricultura | flori | sent | B | NOISE | — | — | — | Catalog bot detalhado |
| 20 | Dra Adrielli Costa | estética | sent | B | NOISE | — | — | — | 2 auto-replies em sequência |
| 21 | Espaço Contextual | psico | negotiating, preview_sent | O | LOW | — | — | — | "Ok" → "Presencial" → preview enviado D+6 → ghost |
| 22 | Giba's Gym | academias | negotiating, preview_sent | O | **HIGH** | **R$ 997** | — | — | ATIVO — "davi, até que gostei mas me explica como funcionaria" 27/abr → você cotou R$ 997 + ofereceu Google Ads — aguardando |
| 23 | LEV Pilates | pilates | lost | O | LOW | — | — | — | "Não obrigada" — sem interesse |
| 24 | Clínica Victor Santos | pilates | lost | O | LOW | — | — | — | "no momento não tenho interesse" |
| 25 | Espaço Vintage Barbearia | barbearias | lost | O | LOW | — | — | — | "já trabalhamos com app de agendamento" |
| 26 | Auto Escola Viena | autoescola | negotiating | B | NOISE | — | — | — | Greeting bot, você respondeu como se fosse humano |
| 27 | Auto Moto Escola Flora | autoescola | lost | O | LOW | — | — | — | "não temos interesse" (Elaine) |
| 28 | Auto Escola Rainha | autoescola | lost | O | LOW | — | — | — | "Não temos interesse, obrigada" |
| 29 | English Is Fun | idiomas | lost | O | LOW | — | — | — | "site fora do ar passando por atualizações" |
| 30 | Clínica Castelo Branco | médicas | negotiating | R | LOW | — | — | — | "o que seria?" — recepção, sem progresso |
| 31 | MOVTRAT Fisio | fisio | negotiating, preview_sent | O | LOW | — | — | — | "Pode enviar sim" → preview → ghost |
| 32 | Croma Burguers | restaurantes | lost | R | LOW | — | — | — | Encaminhou pra "responsável de compras Thais" |
| 33 | Binha Doces | padarias | lost | O | LOW | — | — | — | "Já temos site para pedidos" |
| 34 | Bonitas Boutique | roupas | negotiating, preview_sent | O | MED | **YES** | — | — | ATIVO — "muito legal, e como seria? qual seria o valor" 23/abr — você não respondeu o preço ainda |
| 35 | Tekka Floricultura | flori | negotiating, preview_sent | R | LOW | — | — | — | "Sou Lavínia da equipe Leve Slim" — outra equipe assumiu, dispersou |
| 36 | Hadassa Flores | flori | negotiating, preview_sent | O | **HIGH** | **R$ 1200 → R$ 900** | — | — | Pediu preço → R$ 1200 → "No momento não" → você dropou R$ 900 mesmo dia |
| 37 | Floricultura Florescer | flori | negotiating, preview_sent | O | MED | — | — | — | Aceitou preview → "Vcs são de Osasco?" → ghost após preview |
| 38 | Floricultura M.B.Portuguesa | flori | negotiating | O | LOW | — | — | — | "Não entendi" → você reexplicou → ghost |
| 39 | Meu Fisio | fisio | lost | O | LOW | — | — | — | "estamos focados em nosso sistema atual" |
| 40 | EVOLUA Fisioterapia | fisio | negotiating, preview_sent | O | **HIGH** | **R$ 997** | — | — | ATIVO — perguntou preço + Google ads 27/abr → você cotou R$ 997 → "vou pensar e te retorno" |
| 41 | Allini Perissini | nutri | sent | B | NOISE | — | — | — | Intake bot |
| 42 | Iris Confeitaria | padarias | negotiating, preview_sent | R | MED | — | — | — | "Sou Adriana, trabalho no atendimento. Não sou a responsável" — vai encaminhar |
| 43 | Rafaela Flores | flori | negotiating, preview_sent | O | MED | **YES** | — | — | Perguntou preço → você desviou pra Google Ads sem cotar site → confusão de oferta |
| 44 | Anally Britto Floricultura | flori | lost | B | NOISE | — | — | — | Catalog bot |
| 45 | Cris Viana Estética | estética | replied | R | LOW | — | — | — | Só repetiu o nome, sem engajamento |
| 46 | Esparza's Appliances | appliance | negotiating, preview_sent | X | NOISE | — | — | — | **CROSS-TALK COM TUA FAMÍLIA** — webhook atribuiu mensagens pessoais ao lead |
| 47 | London's Pinpoint | mobile detail | negotiating, preview_sent | X | NOISE | — | — | — | Mensagens vazaram entre dois leads US (atribuição errada) |
| 48 | Dra. Elisangela Marin | estética | replied, preview_sent | B | NOISE (Fase 1) | — | — | — | "estou em atendimento, te retorno" — auto-reply |
| 49 | Beauté Clinic Dra Suzan | estética | negotiating, preview_sent | O | MED | — | — | — | "atualmente temos uma equipe capacitada quem cuida dessa área" — declinou |
| 50 | Felps | inbound | replied | X | NOISE | — | — | — | Mensagens pessoais tuas (cinema) atribuídas como lead |

---

## 3. Niche por qualidade (não por volume)

Volume engana. O que importa é quem chegou perto de comprar. Filtrei o ranking por "chegou a preço discutido" e "qualidade da conversa".

| Niche                | Replies humanos reais | Chegou a preço | % chegou a preço | Estado dos que chegaram |
|----------------------|-----------------------|----------------|------------------|-------------------------|
| nutri                | 2 (Matheus, Allini)   | 1              | 50%              | ATIVO (Matheus pendente) |
| fisio                | 3 (Veronica, MOVTRAT, EVOLUA, Meu Fisio) | 1 | 25% | ATIVO (EVOLUA "vou pensar") |
| salões               | 5 (Giselle, Julia, Espaço Fluir, Unike, George) | 1 | 20% | Julia ghost após desconto |
| flori                | 6 (Bela Flor, Tekka, Hadassa, Florescer, M.B., Rafaela) | 2 | 33% | Hadassa declinou + Rafaela offer drift |
| academias            | 1 (Giba's)            | 1              | 100%             | ATIVO (Giba's recém cotado) |
| roupas               | 3 (Blusinha, Super Linda, Bonitas) | 1 | 33% | Bonitas ATIVO (você não respondeu) |
| padarias             | 4 (Confeitaria, Opera, Binha, Iris) | 0 | 0% | Todos morreram antes de preço |
| **estética**         | 3 (Cris Viana, Beauté, +1 Phase 1 não-bot) | 0 | 0% | **Todos declinaram ou silenciaram** |
| pilates              | 2 (LEV, Victor)       | 0              | 0%               | Ambos declinaram |
| autoescolas          | 2 (Flora, Rainha)     | 0              | 0%               | Ambos declinaram |
| odonto               | 0 (todos bot)         | 0              | —                | — |
| vet                  | 0 (todos bot)         | 0              | —                | — |
| restaurantes         | 1 (Croma — recepção)  | 0              | 0%               | Recepção redirecionou |
| psico                | 1 (Espaço Contextual) | 0              | 0%               | Ghost após preview |
| idiomas              | 1 (English Is Fun)    | 0              | 0%               | Site sendo atualizado |

### Conclusões dado-suportadas sobre niches

- **Estética é mau ICP** pelo dado pré-Fase-1. 0/3 chegaram a preço. Os 3 reais foram: 1 só repetiu nome, 1 declinou ("temos equipe"), 1 estava em atendimento.
- **Fisio, nutri, salões e academias são os que chegam mais perto de preço.** Pequenas amostras, mas consistente.
- **Floricultura tem volume mas qualidade média-baixa.** 6 reais, 2 chegaram a preço, ambas com problemas: Hadassa declinou R$ 1200 e você contra-ofertou; Rafaela teve oferta confusa.
- **Padarias respondem mas não compram.** 4 reais, 0 a preço. 1 corrigiu teu premise (#7 Opera).
- **Odonto e vet só têm bot.** Seu cold WhatsApp NÃO consegue passar do filtro automatizado nesses nichos.
- **Veterinária nunca foi testada com humano.** Os 200 leads coletados de vet ficam mortos. A escolha do PLAYBOOK §2 ("Fase 2 = veterinária") **não tem dado por trás**.

---

## 4. País × canal

| País / Canal      | Sends | Replies | Reply rate | Replies reais | Reply rate real |
|-------------------|-------|---------|------------|---------------|-----------------|
| BR / WhatsApp     | 535   | 45      | 8.4%       | ~33           | **6.2%**        |
| US / WhatsApp     | 70    | 2       | 2.9%       | **0**         | **0%**          |

**FATO:** as duas "replies" US (#46, #47) são **NOISE**. Atribuição errada — uma é cross-talk com tua família, outra é mensagens entre 2 leads US confundidas pelo webhook. **EUA WhatsApp = 0 replies reais em 70 envios.**

**DECISÃO RECOMENDADA:** **MATAR EUA WhatsApp imediatamente.** Não é "talvez canal errado" — é zero retorno verificável em 70 testes. Se voltar EUA, é cold email + LinkedIn DM, não WhatsApp.

---

## 5. Lost reasons — ranking real

Classifiquei manualmente cada um dos 35 humanos reais (excluí os 15 bots/noise).

| Motivo                                     | Count | %    | O que isso revela                                              |
|---------------------------------------------|-------|------|----------------------------------------------------------------|
| **Ghost pós-preview**                       | 8     | 23%  | Preview entregue, lead sumiu sem dizer não                    |
| **Receptionist intercepted (DM_block)**     | 8     | 23%  | Recepção pegou e dono nunca viu                                |
| **No interest (genérico)**                  | 5     | 14%  | "Não temos interesse" — oferta não ressoou                     |
| **Already have solution**                   | 5     | 14%  | "Já temos site/app/sistema"                                    |
| **Premise errada / mensagem confusa**       | 3     | 9%   | Levi disse algo factualmente errado ou pivotou no meio         |
| **ATIVO esta semana** (incluí em "outros")  | 5     | 14%  | Pendente — Matheus, EVOLUA, Giba's, Bonitas, Julia (desconto) |
| **Outro**                                   | 1     | 3%   | English Is Fun (atualizando site) — caso isolado               |

### O que esses números mudam na próxima ação

- **Ghost pós-preview = 23%** → o preview não está fechando a deal. Ele só compra atenção, não compromisso. Sem call ou pedido de PIX rápido após preview, lead esfria.
- **Receptionist = 23%** → quase 1 em 4 conversas morre no filtro humano. Precisa de uma das duas: (a) outreach que pula recepção (mensagem direta pro dono via Insta DM ou número pessoal) ou (b) script pra escalar via recepção ("posso falar com o(a) dono(a)?"). Hoje não há nem um nem outro.
- **Already have solution = 14%** → pré-qualificação não tá filtrando isso. PLAYBOOK menciona "sem site" como filtro mas leads como Binha Doces ("já temos site para pedidos") passam. Adicionar verificação de Insta com link bio antes de mandar.
- **Premise errada (9%)** → a copy "não aparece no Google" é factualmente errada para alguns leads. Opera Boulangerie corrigiu polidamente. Esse erro queima brand permanentemente com o lead que percebe.

---

## 6. Quem responde — dono ou recepção?

Das 35 conversas humanas reais:

| Quem responde   | Count | %    |
|-----------------|-------|------|
| Dono(a)         | ~18   | 51%  |
| Recepção/secretária | ~8 | 23%  |
| Ambíguo         | ~9   | 26%  |

**Padrão na recepção (sinais textuais):**
- "Sou [nome], trabalho na recepção" / "no atendimento" — explícito
- "Vou passar pra responsável" / "passarei sua mensagem"
- "Esse cuida dessa área" — sinaliza terceiros
- "Aqui é a [nome]" — sem o "Levi" implícito de dono

**Dono típico:**
- Curto, direto: "Pode mandar", "Sim", "Manda aí"
- Pergunta valor: "qto custa", "qual seria o valor"
- Auto-correção polida quando premise tua erra (#7 Opera Boulangerie)

**Implicação:** quando recepção entra, conversion vai pra zero. Dos 8 receptionist, 0 chegou a preço. Dos 18 donos, 6 chegaram a preço. **Conversion-to-price 6/18 = 33% pra dono vs 0/8 pra recepção.** Filtrar no front é alta alavanca.

---

## 7. Pricing reality check

| Métrica                                  | Count | Comentário                                |
|------------------------------------------|-------|-------------------------------------------|
| Sends                                    | 605   | base                                      |
| Chegaram a discutir preço                | 8     | 1.3% — gargalo principal                  |
| Disseram "muito caro" explícito          | 0     | ninguém atacou o número diretamente       |
| Pediram desconto                         | 1     | Hadassa declinou após R$ 1200             |
| Pediram parcelamento (cartão)            | 1     | Matheus "flexibiliza no cartão?"          |
| Sem budget explícito                     | 0     | nenhum disse "não tenho dinheiro"         |
| Você ofereceu desconto sem ser pedido    | **2** | **Julia (R$1200→900) e Hadassa (idem)**   |

**Achado crítico:** o "preço alto" como motivo de morte **não aparece nas conversas**. Ninguém disse "1200 é caro". O que aparece é silêncio após preço. Isso significa uma de duas coisas:

- **Hipótese A:** o lead não chegou a avaliar a relação preço/valor. Sumiu antes.
- **Hipótese B:** o preço ATIVOU "isso é mais sério que eu achava" e o lead foi conferir caixa. Não voltou.

Em ambos os casos, **dropar pra R$ 900 não resolve.** A R$ 900 que você ofereceu pra Julia e Hadassa não ficou nem 24h no ar — Julia silenciou, Hadassa silenciou. Dropar reforça que R$ 1200 era inflado.

**Decisão de pricing implicada pela conversa:** o R$ 997 fixo da Fase 1 está certo. Mas não é o número que decide — é a **percepção de risco** ("e se eu não gostar?", "e se eu pagar e não funcionar?"). A garantia 50/50 da Fase 1 (R$ 500 refundable) ataca isso. Mas o R$ 997 só vai fechar se o framing chegar antes do silêncio.

---

## 8. Offer diagnosis — commodity ou ROI?

**Como leads reagiram ao preview:**

- **Reação dominante: ghost.** 23% silenciam após receber. Preview não foi suficiente pra mover.
- **Reação positiva real:** 4-5 disseram "ficou bom" / "muito legal" e perguntaram preço. Um piscou (#22 Giba's: "davi, até que gostei").
- **Reação negativa explícita:** 0. Ninguém disse "preview tá feio".

**Como reagiram ao preço:**
- 1 perguntou flexibilização cartão (#6 Matheus)
- 1 declinou direto ("no momento não", #36 Hadassa)
- 1 disse "vou pensar e te retorno" (#40 EVOLUA)
- 1 sumiu (#3 Julia)
- 5 não chegaram a preço

**Pergunta-chave: alguém perguntou "o que isso muda pra mim"?**

NÃO. **0 dos 35 reais perguntaram impacto/ROI.** Todos foram pra "como funciona" (curiosidade) ou "qual valor" (operacional).

**Implicação:** você está vendendo commodity visual. O lead não está comprando ROI; está comprando "ah, é mais barato e bonito que o Wix do meu sobrinho?". Se for isso, **a oferta deveria ser ancorada em delta-vs-Wix-ou-nada**, não em "mais clientes".

**Contra-evidência:** Giba's Gym ("até que gostei mas me explica como funcionaria") sugere que algumas perguntas de "como funciona" são tentativas de mapear ROI sem usar a palavra. **HIPÓTESE NÃO MEDIDA:** trocar "site profissional" por "captação de leads via Google + WhatsApp" pode ressoar — mas não há dado real ainda.

---

## 9. Conclusão brutal

### Devo continuar com esse produto?

**Sim, mas reposicionar.** O produto técnico (Next.js + Tailwind + WhatsApp integrado em 24h via Claude Code) é forte — ninguém reclamou da qualidade do preview. **O problema é a oferta, não o entregável.**

### Devo mudar apenas posicionamento?

**Sim.** O reposicionamento principal: parar de vender "site profissional one-page mobile-first" e começar a vender o resultado que o site produz. 0 dos 35 reais perguntaram ROI — sintoma de framing puramente operacional. Faltam 2 mudanças:

- Copy de outreach: ancorar em **dor financeira específica** ("seus concorrentes recebem agendamento à noite, você não") vs dor de presença ("não aparece no Google").
- Copy de pós-preview: junto do preview, mandar **1 promessa mensurável** ("aparece nas primeiras 5 buscas locais em 30 dias" ou similar). Fechar com pergunta de compromisso, não pergunta aberta.

### Devo matar "site" e vender outra coisa?

**Não. Mas envolver "site" em outro nome.** "Captação online" / "presença com agendamento direto" / similar. O site continua sendo o entregável; o produto vendido muda.

### Devo trocar nicho?

**Sim, parcialmente. Estética foi pick errado pra Fase 1.** Dado real:
- 0/3 estéticas reais chegaram a preço
- nutri / fisio / salões / academias chegaram a preço em 1 caso cada
- floricultura chegou a preço 2 vezes mas com problemas (uma offer-drift tua, outra contra-oferta tua)

**Recomendação dura:** Fase 1 deveria ter sido **fisioterapia + nutricionista** (donos respondem direto, perguntam preço, têm budget pra serviço profissional). Estética tem muita auto-resposta de spa/clínica grande com equipe, e "Dra" responde via secretária.

**Não aborte a Fase 1 agora.** Ela acabou de começar (22 sends). Mas se em Day 14 não tiver venda, **trocar pra fisio ou nutri**, não pra dentista (5.3% reply pré-Fase-1, todos bot).

### Devo trocar canal?

**EUA WhatsApp: matar imediatamente.** 0 replies reais em 70 envios. Manter aberto é só queimar Vercel/IA budget.

**BR WhatsApp: manter, com fix de tracker (EXP-001) e adicionar uma camada de bypass de recepção.**

### Devo mudar pricing?

**Não. R$ 997 fixo está certo.** Pricing não é o gargalo (ninguém atacou o número). Mas **pare de oferecer desconto sem ser pedido.** Em 2 casos (Julia, Hadassa) você dropou R$ 1200 → R$ 900 dias depois. Isso destrói percepção de valor permanentemente. **Regra dura: nunca oferecer desconto antes do lead pedir, e nunca dropar mais de 10% do número original.**

### Devo tornar call obrigatória?

**Provavelmente sim, em ticket ≥ R$ 997.** Dado: 0 calls aconteceram em 605 sends. 0 vendas. **HIPÓTESE NÃO TESTADA**, mas é a maior alavanca não-tentada. Espaço Fluir (#11) pediu call no celular pessoal — você não conseguiu adicionar e a venda morreu. Esse era um sinal claro e foi perdido por falha técnica.

**Próxima ação:** EXP-004 (texto vs call) deveria virar P1 quando primeiro lead da Fase 1 aprovar preview.

### Devo abandonar EUA WhatsApp completamente?

**Sim, hoje.** Ver acima.

### Devo parar de gerar preview cedo demais?

**Não — em BR, manter preview-first.** Os 22 da Fase 1 são preview-first com R$ 500 upfront, ainda em curso. Mas: **adicionar pergunta de compromisso ANTES do preview** quando possível. Ex: "se ficar bom, te interessa fechar essa semana?" antes de gerar. Isso filtra curioso de comprador.

---

## 10. O que fazer esta semana — priorizado por impacto

Não toque em código além do P0 e P1. O resto é resposta a leads ativos.

### P0 (ainda hoje — 28/abr)

1. **Responder 5 leads ativos esta semana antes que ghost.** Ordem por urgência:
   - **#34 Bonitas Boutique** — perguntou valor 23/abr e você não respondeu. **5 dias sem retorno.** Manda preço R$ 997 hoje.
   - **#6 Matheus Sabatino** — perguntou flexibilização cartão 22/abr, sem retorno tua. **6 dias.** Responde com 3x cartão R$ 350.
   - **#40 EVOLUA Fisio** — "vou pensar e te retorno" hoje cedo. Aguarda 48h, depois 1 follow-up curto.
   - **#22 Giba's Gym** — você cotou R$ 997 + Google Ads hoje. Aguarda 48h.
   - **#3 Studio Julia Graziela** — você dropou R$ 900 hoje. Se silenciar 48h, marcar lost. Não dropar mais.
2. **Matar pipeline EUA WhatsApp.** Pausar dispatch pra leads `country='US'`. 1 query SQL ou flag no bot.

### P1 (essa semana — 28/abr a 04/maio)

3. **Aplicar fix do tracker (EXP-001).** Sem isso a Fase 1 é cega. ~30min de código. Está especificado em GTM_DIAGNOSIS.md §4.
4. **Auditar fluxo de recepção.** Quando reply contém "passei pra responsável" / "Sou [nome] da recepção" / "trabalho no atendimento" → adicionar follow-up automático em 48h: *"Beleza. Tem o WhatsApp direto do(a) responsável que eu possa chamar?"* Hoje você não tem essa pergunta — todas as 8 conversas com recepção morreram porque você aceitou o filtro.
5. **Parar de oferecer desconto sem ser pedido.** Hard rule. Adicionar no PLAYBOOK §8 (Limites duros).

### P2 (depois da Fase 1 — pós Day 14, 12/maio)

6. **Avaliar EXP-002 contra kill switch.** Se 0 vendas em 100 msgs estética, **trocar pra fisio ou nutri**, não dentistas. Atualizar EXPERIMENT_LOG.md EXP-005 trocando B = fisioterapeutas (n pequeno mas qualidade comprovada nos pré-Fase-1).
7. **Lançar EXP-003 (offer angle).** "Site profissional" vs "Captação de leads via Google". Pré-requisito: coluna `outreach_variant`.
8. **Lançar EXP-004 (call vs texto).** No primeiro lead da Fase 1 que aprovar preview, oferecer call de 10min Google Meet pra alinhar finais. n = 1 já vale como sinal.

### Não fazer essa semana

- Não migrar status enum.
- Não criar dashboards novos.
- Não testar EUA email (depois da Fase 1 fechar).
- Não dropar preço.

---

## Bugs colaterais identificados pela leitura

Não fazem parte do autopsy do funil mas vão te morder se não for resolvido:

1. **Webhook attribution leak.** Conversas pessoais (#46 Esparza com tua família, #47 cross-talk entre 2 leads US, #50 Felps com cinema) estão sendo classificadas como inbound de leads. Sintomas: `last_human_reply_at` setado em leads que nunca foram contactados de verdade. Isso polui métricas e pode confundir o suggester de IA.
2. **`last_human_reply_at` populado por bots.** ~30% dos "replies" são auto-greetings. Precisa de heurística: se primeira inbound for ≤ 60s após outbound E contém "agradece"/"bem-vindo"/"Como podemos ajudar"/"em atendimento" → marcar como auto e NÃO setar last_human_reply_at.
3. **Duplicação de niche por acento.** "clínicas odontológicas" vs "clinicas odontologicas" no banco. Bug de normalização.
4. **Premise errada na copy.** Mensagem assume que lead "não aparece no Google" sem verificar — Opera Boulangerie corrigiu, mas o lead próximo que perceber e não corrigir vira lost silencioso.

---

## Métodológica — limitações deste autopsy

- **N pequeno em vários nichos** (vet=0 humanos, odonto=0 humanos, autoescola=2 ambos no). Conclusões nicho-by-quality são direção, não certeza estatística.
- **Classificação owner vs receptionist é heurística textual**, não confirmada com lead. ~26% ficaram "ambíguo".
- **"Real reply rate ~6%"** assume que minha taxonomia bot/humano é correta. Margem de erro de ±2pp.
- **5 conversas estão ATIVAS**, então o resultado final do funil pré-Fase-1 ainda pode mudar. Re-rodar autopsy daqui a 14 dias.

Reproduzir tudo: `node --env-file=.env.local scripts/pull-replied-conversations.mjs > /tmp/replied.md`. Próximo autopsy deve usar esse mesmo script + adicionar contagem programática de bot via heurística textual.
