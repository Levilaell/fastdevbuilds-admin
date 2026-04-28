# Playbook FastDevBuilds

Documento vivo. Consultar antes e durante conversas com cliente. Atualizar
após cada 3-5 clientes fechados com o que aprendeu na prática.

Última atualização: 2026-04-20

---

## 1. Posicionamento e escopo

### O que vendo (Fase 1)

Site institucional one-page para SMB local:
- Barbearia, salão, clínica, estúdio, padaria, pet shop, nutricionista,
  fisioterapeuta, advocacia, contabilidade, imobiliária, psicologia, pilates.
- Next.js 15 + TypeScript + Tailwind. Hospedado na minha Vercel.
- Integração WhatsApp em todos os CTAs (botão wa.me, não calendário real).
- Badge Google real (rating + review count) apontando pro Maps.
- Entrega em até 24h (preview em ~20 min, substituição de fotos em horas).

### O que NÃO vendo hoje

Recuso ou redireciono:
- Sistema de agendamento com calendário real (tipo Cal.com integrado)
- E-commerce com checkout
- App mobile
- SaaS completo
- Automações complexas (CRM, funis, integrações custom)
- Dashboard de gestão

Resposta padrão: "isso não tá no meu escopo hoje, mas se quiser algo
custom faço orçamento separado — valor mínimo R$ 5.000, prazo mínimo
2 semanas. Topa?"

### Quando aceitar custom

Só se:
- Cliente aceita R$ 5.000+ à vista
- Cliente aceita prazo mínimo 2 semanas
- Eu estou com demanda baixa de site simples no momento

Quando demanda de site simples sobe pra 3+ clientes/semana, custom
passa a ser R$ 8.000+ ou recusa.

---

## 2. Preço e pagamento

### Fase 1 (BR-WA-PREVIEW — clínicas estética, ativo desde 2026-04-28)

**Preço fixo R$ 997.** Sem faixa, sem negociação.

Pagamento 50/50:
- **R$ 500 upfront** (Pix) pra começar o processo
- **R$ 497 ao aprovar** a versão final → publicação (domínio + hospedagem
  liberados)
- Alternativa cartão: **3x de R$ 350** (total R$ 1.050; absorve a taxa do
  cartão na 3a parcela)

Inclui:
- Site completo (Next.js + Tailwind, mobile-first)
- Ajustes ilimitados durante o processo (até a aprovação)
- 14 dias de ajustes pequenos após publicação (typo, cor, troca de foto)
- Domínio + hospedagem por 1 ano

Garantia (regra dura):
- Se não aprovar o resultado final, devolvo os R$ 500 upfront sem
  perguntas. Devolução só dos R$ 500 — não há reembolso de pagamento
  total. (CAC IA + reserva de reembolso já está no modelo financeiro;
  reembolso total quebra a margem.)

Comunicação na conversa:
- A oferta inteira (preço + parcelas + inclusos + garantia) já vai na
  **mensagem inicial** com o link do preview (ver
  `PREVIEW_FIRST_OUTREACH_SYSTEM_PROMPT_PT`).
- Quando o lead pergunta preço de novo na conversa, **espelhar
  exatamente** a oferta inicial — nada de faixa, nada de "depende do
  escopo". O suggester já é gated por `previewFirstOfferActive`.

Critério de transição (kill switch — Fase 1 → Fase 2):
- 14 dias / 100+ mensagens enviadas em estética
- 0 vendas E reply rate < 1% → revisar oferta antes de expandir
- 1+ venda OU reply rate ≥ 3% → expandir pra veterinária (Fase 2)

### Histórico — modelo antigo BR (descontinuado em 2026-04-28)

Mantido só pra contexto de leads pré-Fase-1 que ainda estão na conversa:

> Faixa R$ 800–1.500, mediana R$ 1.200. 100% via Pix na aprovação do
> preview. Preço só na fase engajada — fase inicial desvia pro preview.

Esse modelo NÃO se aplica a leads coletados pelo preset BR-WA-PREVIEW.
Toda lead nova de estética em Ribeirão/Sorocaba/Londrina entra direto no
fluxo da Fase 1 acima.

---

## 3. Fluxo de venda — 8 cenários

Cliente responde ao outreach. Classifica em 1 dos 8 casos:

### Caso 1 — Afirmativo curto
"Pode mandar", "Manda aí", "Quero ver"
→ **Ação**: peço material. Se for barbearia/salão, pergunta sobre fotos
dos cortes/espaço. Se for contabilidade, pergunta sobre logo/cores.
→ **Template**: "Beleza. Tem fotos do espaço ou prefere eu montar com
placeholder?"

### Caso 2 — Info completa já de cara
Cliente já manda foto, link Instagram, texto sobre o negócio
→ **Ação**: uso o material. Crio project no CRM direto. Prompt +
Claude Code em 20 min.
→ **Template**: "Perfeito, tenho tudo. Te mando preview em ~1h."

### Caso 3 — Sem fotos/conteúdo
"Não tenho nada pronto", "Tá tudo bagunçado"
→ **Ação**: sem drama. Faço com placeholders, cliente substitui depois.
→ **Template**: "Tranquilo. Faço com placeholders que você troca depois,
sem pressão."

### Caso 4 — Pergunta preço direto
Ver regra da seção 2 ("Comunicação do preço"). Aplicar fase inicial vs
engajada.

### Caso 5 — Pergunta prazo
"Em quanto tempo fica?"
→ **Ação**: resposta padrão.
→ **Template**: "Preview ainda hoje. Aprovando, entrego tudo em até 24h."

### Caso 6 — Objeção timing
"Agora não é o momento", "Mês que vem a gente vê"
→ **Ação**: deixar porta aberta sem pressionar. Marcar lost se sinal
claro de recusa.
→ **Template**: "Beleza, sem problema. Te avisa aí quando fizer sentido."

### Caso 7 — Pergunta aberta/vaga
"Mas como funciona?", "Me explica melhor"
→ **Ação**: explico em 2 linhas + oferece preview.
→ **Template**: "Faço o site todo com botão WhatsApp integrado, hospedo,
cuido do domínio. Preview grátis pra você ver, aprovando paga e entrego.
Posso te mandar um?"

### Caso 8 — Resposta genérica/bot
Cliente parece ser auto-reply que passou pelo filtro ou resposta estranha
fora de contexto
→ **Ação**: uma última tentativa humanizada. Se não responder em 48h,
marcar lost manual.
→ **Template**: "Oi [nome], é o Levi mesmo. Tava falando do site pra
[business]. Rola você dar uma olhada rapidinho?"

---

## 4. Follow-up

### Regra

**Um único follow-up, após 4 dias sem resposta.**

Se após mais 7-8 dias (total ~12 dias), cliente continuar sem responder,
marcar como lost.

### Mensagem de follow-up (Versão D, já validada)

> Oi [nome], ainda interessado em ver o preview? Se não, tudo bem.

Regra dura: **não fazer 2 follow-ups**. Cliente que ignorou 2 mensagens
em 12 dias = lost.

### Lost manual

Usar botão "× Marcar como lost" no CRM. Motivos disponíveis:
- Não respondeu
- Recusou a proposta
- Preço alto
- Escolheu concorrente
- Outro

Projeto (se houver) permanece no banco, lead vira `lost`. Reversível se
cliente reaparecer.

---

## 5. Objeções comuns e respostas

### "Tá caro"
"Entendo. Meu mínimo é R$ 800 com escopo reduzido — sem galeria e 1 seção
a menos. Pacote completo fica em R$ 1.200-1.500. Qual faz mais sentido
pra você?"

### "Vou pensar"
"Tranquilo. Te mando o preview pra você decidir com ele na frente. Se
não gostar, sem compromisso."

### "Já tenho site"
"Bacana. Se for WordPress ou Wix, provavelmente tá lento no celular e
ruim pra Google. Posso mandar um preview com o jeito que eu faço pra você
comparar? Sem compromisso."

### "Preciso falar com sócio/esposa"
"Claro. Te mando o preview pra vocês decidirem juntos. Se topar, PIX
na aprovação e entrego."

### "E se eu não gostar?"
"Aí ajustamos até ficar bom. Se não gostar mesmo nada, não paga e a gente
segue. Zero risco pra você."

### "Posso parcelar?"
"O valor é à vista via PIX. Se precisar parcelar, trabalho com pacote
menor (R$ 800 à vista em vez de R$ 1.200 parcelado em 3x). Qual prefere?"

### "Quanto tempo demora?"
"Preview ainda hoje. Aprovando, entrego com tudo (domínio, fotos
substituídas) em até 24h."

### "Bot automático respondeu (auto-reply detectado)"
Não responder imediato. Esperar 24-48h pra ver se humano pega. Se não
pegar, marcar lost.

---

## 6. Entrega técnica

### Setup Vercel

- Conta Vercel própria (Pro ou trial)
- 1 team "FastDevBuilds"
- 1 project por cliente
- Região: default (iad1 US East) — não usar gru1 (São Paulo), custa 73%
  mais por CPU-hour

### Fluxo deploy

1. Criar pasta `~/previews/[cliente-nome]`
2. Rodar Claude Code com prompt gerado pelo CRM
3. `npm run dev` → valida localmente
4. Deploy na Vercel: `cd ~/previews/[cliente] && vercel --prod`
5. URL preview (`[cliente].vercel.app`) vai pro cliente via modal do CRM
6. Cliente aprova + PIX
7. Substituir placeholders por fotos reais
8. Configurar domínio próprio (se cliente tem)

### Migração de domínio

Manual por enquanto. Fluxo:
1. Pedir acesso ao Registro.br / GoDaddy do cliente
2. Apontar A record / CNAME pro Vercel
3. Aguardar propagação DNS (até 48h, geralmente < 6h)
4. Confirmar SSL automático Vercel
5. Testar em dispositivo diferente

**Tempo médio:** 15-30 min ativo + espera de propagação.

Automação de domínio fica pra depois de 10 clientes fechados.

### E-mail personalizado

Não incluído no pacote padrão. Se cliente pedir "contato@empresa.com":
- Explica que não tá no escopo
- Oferece como extra R$ 100-200 (Google Workspace R$ 30/mês/conta,
  cliente paga direto)
- Alternativa grátis: Cloudflare Email Routing (forward pra Gmail dele)

---

## 7. Pós-venda

### Garantia (decidido)

**30 dias + 3 rodadas de ajustes inclusos.**

Rodada = batch de ajustes. Não contar mensagens soltas.

Regra: se cliente manda mensagem avulsa ("muda cor do botão"), aplico
sem contar. Mas aviso: "tá, mas se fechar a lista depois, conta como
uma rodada."

### Após 30 dias / 3 rodadas

Ajuste novo = cobro R$ 100-200 dependendo do escopo. Frase:
"Passou do período de ajuste gratuito. Esse mexida fica em R$ 150.
Topa que eu já faço?"

### Oferta de manutenção (Fase 2 — após 5 clientes fechados)

Oferecer somente após cliente recebeu entrega final e ficou satisfeito.

**Pacote manutenção — R$ 80/mês:**
- Atualizações técnicas (Next.js, dependências)
- 1 ajuste de conteúdo/mês incluso
- Backup semanal automático
- Relatório mensal de visitas (Google Analytics)
- Suporte prioritário

**Não incluso na manutenção** (cobra extra):
- Nova seção ou refatoração grande
- Campanhas de ads
- Novo conteúdo criado do zero (blog posts, landing de campanha)

### Taxa de conversão esperada

Literatura aponta 30-50% dos clientes aceitam manutenção quando
oferecida após valor comprovado. Minha projeção: 40%.

Se 20 clientes fechados × 40% × R$ 80 = **R$ 640/mês recorrente**.

---

## 8. Limites duros (nunca faça)

### Venda
- Nunca baixar preço abaixo de R$ 800
- Nunca aceitar pagamento após entrega sem sinal
- Nunca prometer calendário real integrado (cenário B)
- Nunca prometer "resposta instantânea" ou "sem fila" (linguagem de
  processo, não garantia de resultado)

### Escopo
- Nunca aceitar custom abaixo de R$ 5.000
- Nunca aceitar prazo menor que 2 semanas em custom
- Nunca prometer feature que dependa da operação do cliente (agendamento
  real que exige recepcionista usando sistema)

### Tom
- Nunca "Olá!" ou "Oi!" dentro de conversa em andamento
- Nunca assinar "— Levi" no final de mensagens
- Nunca usar "!" mais de 1x por mensagem
- Nunca ecoar lista que cliente acabou de falar
- Nunca usar "ótimo", "perfeito", "show" em excesso

### Entrega
- Nunca deletar project no banco ao marcar lead como lost
- Nunca subir site do cliente em Vercel Hobby (viola termos)
- Nunca usar região São Paulo (gru1) — 73% mais caro
- Nunca usar Unsplash / Pexels no site gerado (URLs quebram)
- Nunca testimonials fictícios (art. 37 CDC)

---

## 9. Métricas a acompanhar

Reviso semanalmente:

| Métrica | Meta | Como medir |
|---|---|---|
| Outreach enviados | 30-50/dia inicialmente | SELECT count leads status=sent |
| Taxa de resposta | > 5% | replied / sent |
| Taxa de fechamento | > 10% dos replied | paid / replied |
| Tempo médio até fechamento | < 7 dias | paid_at - first_contact |
| Bot false-positive | < 5% | auditar inbox manualmente |
| Churn manutenção (Fase 2) | < 10%/mês | contas canceladas / total |

---

## 10. Evolução (quando revisar o playbook)

Revisar este documento quando:

**Depois de 3 clientes fechados:**
- Validar se preço R$ 800-1.500 tá alinhado com mercado real
- Ajustar objeções baseado em respostas reais (reescrever respostas
  padrão desta seção 5)
- Documentar caso atípico que apareceu

**Depois de 10 clientes:**
- Avaliar automação de deploy/domínio (ROI concreto)
- Considerar subir preço mínimo pra R$ 1.000
- Começar a oferecer manutenção ativamente (Fase 2)

**Depois de 20 clientes:**
- Avaliar migração Vercel → VPS se bandwidth escalar muito
- Considerar preço por nicho (imobiliária paga mais que barbearia)
- Reavaliar se "ticket + manutenção" virou default OU ticket + upgrade
  a la carte (SEO mês, ads, etc)

**Quando demanda passa 3 clientes/semana:**
- Custom passa de R$ 5k pra R$ 8k
- Considerar terceirizar tarefa repetitiva (substituir foto, migrar
  domínio) pra freelancer júnior R$ 30-50/hora

