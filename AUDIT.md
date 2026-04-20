# Changelog

## Session 2026-04-20 — Applied fixes + live validation

Sessão de teste end-to-end do fluxo de entrega, com validação real do
sistema (suggestion prompt + claude-code generation) contra lead sintético
Barbearia Corte Fino. Resultados aplicados diretamente no código.

### Fixes aplicados (commit 68d0bbe)

**Fix #2 — Remove "48h prototype": DONE**
Removido de buildSuggestionSystemPrompt e substituído por "ainda hoje" /
"em algumas horas". Testado em conversa real — sugestão não mais
promete 48h arbitrário.

**Fix #3 — Remove depoimentos fictícios: DONE**
Seção "Avaliações" inteira removida do CLAUDE_CODE_SITE_SYSTEM_PROMPT.
Badge Google (rating + review count real) agora aparece no Hero e no
CTA final, apontando para busca real no Google Maps. Zero conteúdo
fabricado nos sites gerados.

**Fix #4 — Remove URLs Unsplash inventadas: DONE**
Proibição explícita de qualquer banco de imagens no prompt. Galeria e
hero agora usam gradientes CSS + SVG placeholders com comentário JSX
{/*PLACEHOLDER: substituir por foto real*/}. Testado: Claude Code gerou
galeria com 6 placeholders elegantes sem nenhuma URL externa.

**Fix #5 — Expandir paleta de cores: DONE (parcial)**
Adicionados 4 nichos novos: contabilidade/advocacia (azul-marinho),
imobiliária/construção (terracota), psicologia/terapia (lilás pastel),
pilates/estúdio (verde claro). Paleta agora cobre 10 segmentos vs 6
originais. Ainda não cobre todos os 20 nichos do bot — resto cai em
"Outros" por ora.

**Fix #8 — Não repetir problema já mencionado: MITIGATED**
Reescrita do suggestion prompt em princípios (não branches) incluiu
princípio P2 "NÃO ECOAR". Testado em 4 cenários — modelo parou de
repetir lista que cliente acabou de falar.

**Fix #10 — Regra prazo/preço específico: DONE**
Implementado via nova arquitetura: endpoint calcula phase
('inicial' ou 'engajado') baseado em count de mensagens inbound.
Phase injetada como contexto flat no system prompt. Regra de preço
virou lookup direto em vez de conditional interpretativo. Accuracy:
0% antes do fix (modelo sempre escolhia 'inicial'), 100% depois.

### Novos achados (validados em teste real)

**Novo fix A — Anti-promessa operacional: APPLIED**
Modelo tendia a gerar "sem fila de espera" como diferencial — promessa
que depende da operação do cliente. Regra nova proíbe este tipo de
linguagem. Trocar por "horário respeitado" ou "agendamento com hora
marcada" (processo, não garantia de resultado).

**Novo fix B — Contraste em fundo de destaque: APPLIED**
CTA final com fundo dourado estava gerando botão dourado+preto (baixo
contraste). Regra nova força botão sólido escuro (#1A1A1A) com texto
branco em qualquer seção de fundo destaque. Melhora conversão do CTA
mais importante do site.

### Aprendizado arquitetural

Condicionais interpretativas em system prompts falham independente do
modelo (testado Haiku 4.5 e Sonnet 4.6 — ambos ignoraram). Solução:
calcular a decisão fora do LLM (código), injetar resultado flat no
contexto, modelo só executa lookup. Padrão reusável para outras regras
complexas futuras.

### Models atualizados

- app/api/conversations/suggest: claude-haiku-4-5 → claude-sonnet-4-6
- lib/ai-workflow (generateClaudeCodePrompt):
  claude-sonnet-4-20250514 → claude-opus-4-7

Custo adicional estimado no volume atual: ~R$ 15/mês. Ganho:
consistência de output + qualidade superior de site gerado.

### Validação end-to-end

Fluxo testado: lead BR sem website → outreach (histórico) → 6 turnos de
Sugerir com IA → criar projeto com observações → gerar prompt Claude
Code → rodar em pasta local → site Next.js funcional em ~15min.

Qualidade do site gerado: acima da média do mercado BR SMB local
(R$ 800-1.500 range). Compete com agência local de R$ 2.5-4k em
qualidade visual, entregando em 20 minutos.

### Pendentes

**Ainda não aplicados (aguardando primeiro cliente real):**

- Fix #7 expandido — adicionar todos os 20 nichos do bot
- Fix #9 — Reescrever CLAUDE_CODE_SITE_SYSTEM_PROMPT em PT (hoje
  instruções em EN, output em PT — refactor de ~1-2h, impacto médio)
- Reforma inputs de criação de projeto — substituir textarea único por
  campos estruturados (Instagram URL, site antigo, site referência,
  observações). Abre possibilidade de Claude Code extrair paleta real
  do Instagram do cliente antes de gerar.

**Rejected / deferred para fase futura:**

- Substituir VISUAL_SYSTEM por scorer determinístico — decisão mantida:
  aguardar 3+ clientes fechados antes de investir 3-4h nessa troca.

# Auditoria FastDevBuilds — 2026-04-19

Contexto: auditoria completa dos prompts de IA + arquitetura do sistema,
feita em sessão de 17h no dia 18-19/04/2026. Sistema em produção com 0
clientes fechados, 3 leads pendentes de resposta desde 14/04 (Matheus,
Veronica, Opera).

---

## REGRA ANTES DE MEXER EM QUALQUER COISA ABAIXO

**Nenhum fix deste documento é prioridade maior que fechar o primeiro cliente.**

Se você abriu este arquivo pra começar refactor sem antes ter respondido
os 3 leads pendentes, pare e feche esta aba. Responde primeiro. Só
volta aqui depois que o primeiro cliente pagar.

Motivo: cada hora gasta em refactor pré-cliente é hora que não fechou
venda. Sistema atual funciona. Não está otimizado, mas fecha. Otimizar
sem amostra de cliente real = otimizar no escuro.

---

## Resumo do sistema atual

**7 prompts de IA ativos, média 6.8/10.**

| Prompt | Nota | Canal | Status |
|---|---|---|---|
| SYSTEM_PT | 7.0 | BR WhatsApp outreach | ativo |
| SYSTEM_NO_WEBSITE_PT | 7.5 | BR WhatsApp outreach | ativo |
| SYSTEM_EMAIL_EN | 6.5 | US email outreach | ativo |
| SYSTEM_NO_WEBSITE_EMAIL_EN | 6.5 | US email outreach | ativo |
| CLAUDE_CODE_SITE_SYSTEM_PROMPT | 7.5 | Geração de site | ativo |
| buildSuggestionSystemPrompt | 7.0 | Inbox AI reply | ativo |
| VISUAL_SYSTEM | 5.0 | Vision scoring | **deletar** (ver decisão 1) |
| SYSTEM_EN | — | morto | deletar |
| SYSTEM_NO_WEBSITE_EN | — | morto | deletar |

Sistema funciona. Não é competitivo. Conversão é estimada 10-25% abaixo
do que seria com fixes priorizados aplicados.

---

## Top 10 fixes priorizados

Ordem: maior impacto × menor esforço primeiro.

### 1. Deletar VISUAL_SYSTEM + adicionar scorer determinístico

**Decisão estratégica do dia 19/04.** Ver seção "Decisão 1 — VISUAL_SYSTEM".

Esforço: 3-4h. Impacto: alto. Risco: baixo.

### 2. Remover "48h prototype" de todos os prompts

Contradiz política anti-prazo do SYSTEM_NO_WEBSITE_PT e te compromete
em escala.

Arquivos:
- lib/prompts.ts — buildSuggestionSystemPrompt (PT e EN)
- prospect-bot/lib/prompts.js — SYSTEM_EMAIL_EN + SYSTEM_NO_WEBSITE_EMAIL_EN

Substituir por: "working preview before you commit" (EN) / "posso te
mostrar uma versão pensada pro seu negócio" (PT).

Esforço: 15min. Impacto: alto.

### 3. Remover depoimentos fictícios do CLAUDE_CODE

Risco legal (CDC art. 37 — publicidade enganosa). Depoimento genérico
converte pior que nenhum.

Arquivo: lib/prompts.ts — CLAUDE_CODE_SITE_SYSTEM_PROMPT (seção Avaliações).

Substituir por: badge Google Reviews real (já tem rating + count),
remover os 3 depoimentos fake. Se quiser manter seção, deixar placeholder
"substituir com depoimentos reais após lançamento".

Esforço: 10min. Impacto: alto.

### 4. Remover URLs Unsplash inventadas do CLAUDE_CODE

Modelo inventa URLs que podem estar quebradas ou mostrar conteúdo errado.
Visto no teste: https://images.unsplash.com/photo-1559839734-2b71ea197ec2
foi alucinado.

Arquivo: lib/prompts.ts — CLAUDE_CODE_SITE_SYSTEM_PROMPT (seção Hero).

Substituir por: gradiente CSS puro usando a paleta OU placeholder
{{UPLOAD_HERO_FOTO}} pra você substituir manualmente.

Esforço: 10min. Impacto: alto.

### 5. Adicionar 2-3 exemplos variados no SYSTEM_PT

Hoje tem 2 exemplos com estrutura idêntica (nome + reviews + mecânica
de busca). Modelo tende a replicar estrutura. Faltam:
- Exemplo sem reviews/tração
- Exemplo abrindo com Opção B (sem "Oi!")
- Exemplo com visual_notes específico (quando scorer determinístico detectar)

Arquivo: prospect-bot/lib/prompts.js — SYSTEM_PT.

Esforço: 30min. Impacto: médio-alto (reduz mensagens mecânicas).

### 6. Resolver contradição do CTA em SYSTEM_PT e SYSTEM_NO_WEBSITE_PT

Regra "nunca combinar 2 CTAs" contradiz exemplos que fazem exatamente
isso ("Sou o Levi, posso te mostrar. te mando?").

Solução: redefinir explicitamente o que é "combinar 2 CTAs" (proibir
2 perguntas no final, ex: "quer ver? te mando?") ou remover a regra.

Esforço: 10min. Impacto: médio.

### 7. Expandir paleta de cores do CLAUDE_CODE

Hoje 6 paletas, 50%+ dos nichos do bot (20 nichos) caem em "Outros".
Adicionar:
- Contabilidade/advocacia → azul-marinho + dourado
- Imobiliária/construção → cinza + dourado ou terracota
- Pilates/estúdio → verde claro + neutros
- Psicologia → tons pastéis

Esforço: 20min. Impacto: médio.

### 8. Regra "não repetir problema já mencionado" em buildSuggestionSystemPrompt

Modelo hoje repete o mesmo pain point em toda sugestão, mesmo após já
mencionado 3x no histórico. Cliente cansa.

Esforço: 10min. Impacto: médio.

### 9. Reescrever CLAUDE_CODE_SITE_SYSTEM_PROMPT em PT

Hoje instruções em EN, saída em PT. Risco de leakage de inglês. Consome
~20% mais tokens.

Esforço: 1-2h. Impacto: baixo-médio.

### 10. Regra prazo/preço específico em buildSuggestionSystemPrompt

Quando cliente pergunta prazo/preço concreto, modelo hoje improvisa e
pode te comprometer. Ensinar desviar: "pra dar número preciso preciso
entender melhor o escopo, me conta X".

Esforço: 10min. Impacto: médio.

---

## Código morto a remover

1. **SYSTEM_EN (WhatsApp EN)** — US é email-only, este prompt nunca é chamado
2. **SYSTEM_NO_WEBSITE_EN (WhatsApp EN)** — idem
3. **VISUAL_SYSTEM** — ver Decisão 1
4. **steps/visual.js** (ou arquivo equivalente) — chamada do VISUAL_SYSTEM
5. **bot-server/server.js linhas 303-305** — header de SSE pra rota /run que não existe
6. **is_follow_up no payload bot→CRM** — CRM não consome mais o campo (follow-up foi removido)
7. **bot-server referências a follow-up** — CLAUDE.md + lib/whatsapp.js + lib/crm-client.js
8. **lib/ai-workflow.ts duplicação de client Supabase** — usa createClient direto em vez de lib/supabase/service.ts

---

## Decisão 1 — VISUAL_SYSTEM

**Decisão: deletar e substituir por scorer determinístico.**

### Motivo

VISUAL_SYSTEM atual tem 30% hallucination sistemática. Não é bug de
execução — é consequência do design do prompt (instrução "be harsh",
comparação com Apple/Stripe, teto artificial de 7+). Modelo **obedece**
a instrução inventando defeitos.

Isso contamina 2 fluxos downstream:
- Outreach cita defeito inexistente → lead abre site, percebe mentira,
  perde confiança para sempre
- Geração de site "conserta" problema inventado → estética divergente

Reescrever o prompt não resolve. Teto inerente de LLM vision pra julgar
"é feio?" com precisão.

### Implementação

Criar scorer determinístico que analisa fatos verificáveis do site:
- Stack antigo (WordPress, jQuery, Flash, Bootstrap 3)
- Ausência de viewport mobile tag
- Imagens com resolução inadequada
- CSS > 300KB
- Número de fontes > 3
- Uso de `<table>` pra layout
- Load time > 3s (já tem via PageSpeed)
- Sem SSL (já tem)

Output:
```json
{
  "ugliness_score": 0-10,
  "ugliness_signals": ["WordPress com tema de 2019", "jQuery 1.x", ...]
}
```

Alimentar downstream:
- SYSTEM_PT / NO_WEBSITE_PT: usar UM ugliness_signal como gancho
- CLAUDE_CODE: incluir ugliness_signals na seção "problemas detectados"

### Vantagens

- 0% hallucination (fato verificável)
- Grátis (sem API de IA)
- Acionável (cada sinal vira linha da outreach)
- Cliente não consegue contestar

### Desvantagens

- Perde capacidade de observações sobre "composição visual" (sensação,
  hierarquia, tipografia)
- Não cobre sites modernos mas com problema de usabilidade

### Quando fazer

Depois de 3+ clientes fechados e pagando. Antes disso, manter VISUAL_SYSTEM
atual (aceitar 30% hallucination como custo temporário) e priorizar
fechar venda.

### Esforço

3-4h pra implementar scorer + integrar downstream + deletar VISUAL_SYSTEM.

---

## Próximos passos desde 19/04 3:40h

### Imediato (antes de qualquer refactor)

1. **Dormir.** Sessão de 17h, decisão cansada é decisão ruim.
2. **Responder os 3 leads pendentes (Matheus, Veronica, Opera).** Não
   existe fix de código mais importante que isso.
3. **Avançar 1 deles pra fechamento.** Usar o fluxo novo end-to-end
   (botão "Criar projeto" + auto-prompt + Claude Code + preview).

### Depois do primeiro cliente fechado

Aplicar fixes 2, 3, 4 (total 35min, zero risco, alto impacto).
Esses 3 removem os maiores riscos do sistema atual sem construir nada novo.

### Depois de 2-3 clientes fechados

Aplicar fixes 5, 6, 7, 8, 10 (total 1h20, médio risco, médio impacto).

### Depois de 5+ clientes fechados, com caixa entrando

Executar Decisão 1 (scorer determinístico, 3-4h).
Avaliar se fix 9 (CLAUDE_CODE em PT) vale o tempo.

---

## Notas finais

Este documento foi escrito ao final de uma sessão de 17h onde você
pediu pra IA decidir sozinha a direção do VISUAL_SYSTEM. Isso é sinal
de fadiga de decisão. Da próxima vez que sentir vontade de delegar
decisão estratégica pra IA, pare e pergunte: estou cansado ou sem
contexto? Quase sempre é o primeiro.

Auditoria completa disponível no histórico da conversa de 18-19/04/2026.

