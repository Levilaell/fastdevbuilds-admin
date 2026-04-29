# EXPERIMENT LOG

Documento central de decisão. Toda mudança importante (oferta, copy,
preço, niche, canal, motion) entra aqui antes de ir pro código ou pro
outreach. Sem entrada no log, a mudança não acontece.

Snapshot inicial: 2026-04-28.

---

## Regras

- nunca mudar mais de 1 variável por experimento
- nunca interpretar sem métrica
- "acho" não conta
- "não medi" é melhor que inventar
- toda decisão precisa deixar rastro
- não escalar sem evidência
- nenhum refactor vale mais que fechar o primeiro cliente

---

## Template

Copiar e preencher pra cada experimento novo. Campos vazios devem
levar `—` ou `não sabemos ainda` — nunca inventar.

**ID:** EXP-NNN
**Nome:** [curto, descritivo]
**Data de início:** YYYY-MM-DD
**Status:** ativo | pendente | pausado | fechado
**Hipótese:** [afirmação testável + mecanismo causal]
**Variável testada:** [1 só]
**Controle (A):** [estado atual]
**Variante (B):** [mudança]
**Público:** [ICP filtrado: niche × geo × porte]
**Canal:** [whatsapp, email, sms, ...]
**Oferta:** [ancorada em resultado, não em entregável]
**KPI principal:** [1 número que decide]
**KPI secundário:** [contexto, não decisão]
**Critério de sucesso:** [delta mínimo numérico vs A]
**Resultado:** [preencher após dado; "não sabemos ainda" antes]
**Conclusão:** [o que o dado disse]
**Decisão:** [adotar B / manter A / mais dados / matar]

---

# EXPERIMENTOS

---

## EXP-001 — Tracker fix

**Data de início:** 2026-04-28
**Status:** pendente — fix especificado em `GTM_DIAGNOSIS.md` §4 e §6 P0, não aplicado ainda.
**Tipo:** bug fix de instrumentação. Não é A/B em sentido estrito; é pré-requisito pra qualquer experimento que dependa de medir abertura de preview.

**Hipótese:** Claude Code está dropando a instrução `<Script src=".../track.js">` do system prompt durante geração. Verificado empiricamente: 3 de 3 sites amostrados (`fence-repair.vercel.app`, `muscle-m.vercel.app`, `ace-mobile.vercel.app`) — 0 ocorrências de `track.js` no HTML. Por isso `preview_views` está em 0 apesar de 92 previews enviados.

**Variável testada:** mecanismo de injeção do tracker — LLM-instructed (atual) vs determinístico (proposto).

**Controle (A):** instrução de tracker dentro do prompt em `lib/prompts.ts:602-608`. Aderência observada: 0/3 = 0%.

**Variante (B):** step pós-Claude-Code que lê `app/layout.tsx` (ou `app/page.tsx`), checa presença do tag, injeta antes de `</body>` se ausente. Determinístico.

**Público:** todos os previews gerados após o fix. Os 92 históricos ficam permanentemente sem dado de abertura.

**Canal:** N/A (instrumentação interna).

**Oferta:** N/A.

**KPI principal:** % de previews gerados após o fix com tag `track.js` presente no HTML servido. Critério: 100% (determinístico).

**KPI secundário:** linhas em `preview_views` por cohort de previews pós-fix, cumulativo nos primeiros 7 dias após dispatch.

**Critério de sucesso:**
- KPI principal: 100%. Qualquer falha é bug do injetor.
- KPI secundário: ≥ 30% dos previews enviados pós-fix com 1+ open registrado em 7 dias.

**Resultado:** não sabemos ainda — fix não aplicado. Pré-fix: 0/92.

**Conclusão:** —

**Decisão:** —

---

## EXP-002 — Fase 1: repositioning BR-WA-PREVIEW estética R$ 997

**Data de início:** 2026-04-28
**Status:** ativo — Dia 0 do kill switch (14 dias / 100 msgs).
**Tipo:** repositioning bet, não A/B controlado. Vários eixos mudaram simultaneamente vs modelo velho — não dá pra isolar qual deles moveu o ponteiro. Documentado como experimento porque é a aposta ativa, não porque é controlado.

**Hipótese:** o vazamento principal do modelo velho era reply → close (47 replies pré-Fase-1, 0 vendas), não send → reply (8.4% reply rate é normal-pra-bom). As mudanças da Fase 1 (preço fixo R$ 997, garantia 50/50, niche estreito, GEO específico, motion preview-first) atacam o vazamento em vários pontos ao mesmo tempo.

**Variável testada:** múltiplas (violação consciente da regra "1 variável", documentado pra accountability):
- Niche: pré-Fase-1 amplo (20+ niches) → Fase 1 estreito (clínicas estética).
- GEO: pré-Fase-1 disperso → Ribeirão Preto / Sorocaba / Londrina.
- Pricing: faixa R$ 800-1500 → R$ 997 fixo.
- Motion: majoritariamente offer-first → preview-first.
- Garantia: "não gostou não paga" → R$ 500 refundable explícito.

**Controle (A):** modelo pré-Fase-1. 605 envios, 7.8% reply, 14.4% accepted (estrutural pra preview-first), 0 vendas.

**Variante (B):** Fase 1 conforme `docs/PLAYBOOK.md` §2.

**Público:** clínicas estética em Ribeirão Preto / Sorocaba / Londrina. Filtro adicional via predicado HOT (opportunity_score ≥ 4, review_count ≥ 30, rating ≥ 4.3, sem site).

**Canal:** WhatsApp BR preview-first via `dispatch-preview/route.ts`.

**Oferta:** R$ 997 fixo. 50/50 split (R$ 500 upfront + R$ 497 ao aprovar). Garantia R$ 500 refundable se não aprovar. Inclui domínio + hospedagem 1 ano + 14 dias de ajustes pequenos pós-publicação.

**KPI principal:** vendas (`projects.status = 'paid'`) em 100 envios.

**KPI secundário:**
- reply rate (`last_human_reply_at != null`) em 100 envios
- preview open rate — depende de EXP-001 estar concluído antes de virar mensurável
- distribuição de objeções nas conversas (qualitativo, exige leitura manual)

**Critério de sucesso (kill switch documentado em PLAYBOOK §2):**
- 1+ venda **OU** reply rate ≥ 3% → expandir pra veterinária (Fase 2).
- 0 vendas **E** reply rate < 1% → revisar oferta antes de expandir.
- Cenário intermediário (1-3% reply, 0 vendas) → ler 5 conversas mortas antes de decidir. Adição operacional minha sobre o playbook binário; pode ser removida se preferires.

**Resultado:** snapshot 2026-04-28 21h (Dia 0):
- envios na Fase 1: 22 (22% do alvo de 100)
- reply rate: 9.1% (2/22) — n insuficiente, ruído domina
- preview open rate: 0% — cego por EXP-001
- vendas: 0

**Conclusão:** não sabemos ainda. Mínimo 100 envios pra leitura confiável.

**Decisão:** —

---

## EXP-003 — Offer angle: site vs mais clientes

**Data de início:** pendente. Só ativar após EXP-002 fechar (qualquer veredito).
**Status:** pendente.

**Hipótese:** "site" é commodity sem promessa de resultado — vende competência técnica do operador, não impacto no caixa do cliente. Posicionar como "mais clientes via Google + WhatsApp integrado" ancora em resultado mensurável e converte mais.

**Variável testada:** framing da oferta no outreach inicial e na conversa subsequente.

**Controle (A):** copy atual da Fase 1 — posiciona como "site profissional one-page mobile-first" (ver `PREVIEW_FIRST_OUTREACH_SYSTEM_PROMPT_PT` em `lib/prompts.ts`).

**Variante (B):** reescrever copy posicionando como "captação de leads via Google + WhatsApp", site sendo entregável invisível embutido. Mesmo preço, mesmo escopo técnico — só o framing muda.

**Público:** mesmo da fase ativa no momento do teste. Manter constante.

**Canal:** mesmo da fase ativa. Manter constante.

**Oferta (preço/garantia/escopo):** idêntica entre A e B. Se preço ou escopo mudar junto, é outro experimento.

**KPI principal:** reply rate por variante em ≥ 50 envios cada lado.

**KPI secundário:**
- % das conversas que chegam a discutir preço
- tempo médio entre primeiro contato e "manda preview" (proxy de fricção)

**Critério de sucesso:** B gerar +30% reply rate vs A em n ≥ 50 cada lado, **ou** +30% mais conversas chegando à discussão de preço.

**Resultado:** não sabemos ainda — não rodou.

**Pré-requisitos:**
- coluna `outreach_variant TEXT NULL` em `leads` (1 migração trivial)
- tagueamento no dispatch que cole `outreach_variant` antes de gerar a mensagem
- agregação por variante em `lib/metrics.ts` (~20 linhas)

**Conclusão:** —

**Decisão:** —

---

## EXP-004 — Closing model: texto vs call de 10 min

**Data de início:** pendente. Só ativar após EXP-002 ou EXP-003 ter ≥ 1 lead chegando em "discutir preço" — sem isso não há denominador.
**Status:** pendente.

**Hipótese:** ticket ≥ R$ 1000 cold via texto não fecha porque não há momento de compromisso humano. 47 replies pré-Fase-1 morreram em 0 venda, todos em texto puro. Call de 10 min após preview aprovado força commitment e responde objeções em tempo real.

**Variável testada:** modalidade de fechamento.

**Controle (A):** tudo via texto WhatsApp (atual).

**Variante (B):** após o lead aprovar o preview, oferecer call de 10 min Google Meet pra alinhar finais e enviar PIX. Frase exata e cadência a definir antes de iniciar.

**Público:** subset dos leads que chegaram a "preview aprovado" (`project.status` ∈ {`approved`, `preview_sent`, `adjusting`}). Não testar em todos — só nessa janela.

**Canal:** WhatsApp pra triggar call; Google Meet pra call.

**Oferta:** idêntica entre A e B.

**KPI principal:** close rate (paid / preview_aprovado) por variante em n ≥ 10 cada lado. Volume é o limitante.

**KPI secundário:** tempo médio "preview aprovado" → "PIX recebido".

**Critério de sucesso:** B gerar +50% close rate vs A. Threshold alto porque diff esperado é grande se hipótese é correta.

**Resultado:** não sabemos ainda.

**Conclusão:** —

**Decisão:** —

**Riscos / nota operacional:** call adiciona overhead de tempo do Levi por lead. Se B vencer, viabilidade depende de manter volume baixo + ticket alto. Se ticket cair pra R$ 500 numa Fase futura, call mata margem.

---

## EXP-005 — Niche: estética vs clínicas odontológicas

**Data de início:** pendente. Só ativar após EXP-002 fechar e indicar que estética não rendeu o suficiente.
**Status:** pendente.

**Hipótese:** clínicas estética não é o nicho com melhor pull. Pré-Fase-1 mostra estética 6.7% reply (n=30), abaixo de floriculturas 20.5% (n=39) e padarias 20% (n=20). Dentistas (clínicas odontológicas) tinha 5.3% (n=19) — pior que estética em volume comparável.

**Variável testada:** niche.

**Controle (A):** clínicas estética (Fase 1).

**Variante (B):** clínicas odontológicas. **Reconsiderar B antes de iniciar** — dado pré-Fase-1 sugere que floriculturas, padarias ou veterinária (PLAYBOOK §2 já roteia veterinária como Fase 2) seriam picks com melhor evidência. O user pediu B = dentistas; manter aqui mas flagar que a hipótese de B é fraca.

**Público:** HOT predicado, GEO mantido (Ribeirão / Sorocaba / Londrina). Adaptar predicado HOT pra niche-específico se necessário (ex: dentista premium pode exigir review_count ≥ 50).

**Canal:** WhatsApp BR preview-first. Mesma motion da Fase 1.

**Oferta:** R$ 997 fixo, 50/50 split. Manter constante. Se ticket precisar mudar pra fechar dentistas (que tipicamente tem ticket maior que estética), vira outro experimento.

**KPI principal:** vendas em 100 envios por niche.

**KPI secundário:**
- reply rate
- preview open rate

**Critério de sucesso:** B gerar ≥ 1 venda em 100 envios **E** reply rate B ≥ reply rate A. Critério não simétrico porque B é candidato a substituir A, não complemento.

**Resultado:** não sabemos ainda.

**Conclusão:** —

**Decisão:** —

**Notas:**
- Pré-Fase-1: 19 odonto enviados → 1 reply. Fonte fraca de hipótese pra B.
- Se EXP-002 fechar bem (≥ 1 venda em estética), considerar EXP-005' (linha) como teste de **extensão** de niche em vez de substituição — manter estética rodando, abrir segundo niche em paralelo. Isso muda a estrutura do experimento.
- Duplicação de niche por acentuação no banco ("clínicas odontológicas" vs "clinicas odontologicas") — corrigir no bot antes de tagueio dessas leads.

---

# Como usar este documento

- Toda hipótese nova entra como EXP-NNN antes de virar código ou outreach.
- Editar status na medida em que dado chega. Snapshot do dia fica preservado em commit — git history é o arquivo morto.
- Se um experimento for pausado, não deletar — marcar `Status: pausado` com data e motivo.
- "Não sabemos ainda" é resposta válida e preferível a inventar.
- Antes de rodar EXP-NNN, garantir que os pré-requisitos estão prontos (instrumentação, coluna, predicado SQL, etc.).

---

# Reconciliação com o resto do sistema

- `GTM_DIAGNOSIS.md` é o estado atual da operação (snapshot de dado real). Entra aqui no log a cada release de diagnóstico.
- `docs/PLAYBOOK.md` é a fonte da verdade pra a fase ativa (Fase 1 hoje). EXP-002 reflete o playbook; se playbook mudar, EXP-002 muda.
- `AUDIT.md` é histórico de auditoria de prompts/arquitetura. Itens de lá viram EXPs aqui se justificarem teste antes de aplicar.
- `docs/BACKLOG.md` é fila de tarefas operacionais. Bug fixes pequenos seguem direto, não precisam de EXP. Mudanças de oferta/copy/canal/preço PRECISAM.
