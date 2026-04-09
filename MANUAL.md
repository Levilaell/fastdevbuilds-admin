# Manual do Usuário — FastDevBuilds Admin

---

## 1. O que é o FastDevBuilds Admin

O FastDevBuilds Admin é o painel de controle da equipe de vendas da FastDevBuilds. Ele serve para:

- **Encontrar clientes automaticamente** — um bot busca empresas na internet, analisa o site delas e envia mensagens pelo WhatsApp ou email.
- **Gerenciar conversas** — todas as respostas dos clientes chegam no Inbox, e o sistema sugere respostas automáticas usando inteligência artificial.
- **Acompanhar o funil de vendas** — cada lead (potencial cliente) passa por etapas visuais, desde o primeiro contato até o pagamento.
- **Gerar propostas e fechar projetos** — o sistema gera escopo, envia proposta pelo WhatsApp e acompanha a execução até o pagamento.

Em resumo: o sistema automatiza a prospecção, facilita a comunicação e organiza todo o processo de venda em um só lugar.

---

## 2. Primeiros passos

### Como fazer login

1. Acesse o painel pelo navegador.
2. Na tela de login, digite seu **email** e **senha**.
3. Clique em **Sign in**.
4. Você será redirecionado automaticamente para o Pipeline.

Se aparecer uma mensagem de erro em vermelho, verifique se digitou o email e a senha corretamente.

### Visão geral da interface

Após o login, você verá uma barra lateral (sidebar) à esquerda com os seguintes menus:

| Menu | O que faz |
|---|---|
| **Pipeline** | Quadro visual com todos os leads organizados por etapa |
| **Inbox** | Central de mensagens — conversas com leads |
| **Bot** | Painel para rodar o bot de prospecção automática |
| **Metrics** | Números e gráficos de desempenho |

O **Inbox** mostra um contador vermelho com a quantidade de mensagens não lidas. Esse número atualiza em tempo real.

No canto superior direito, você verá seu avatar (a inicial do seu email) e a opção de sair do sistema.

---

## 3. Pipeline — Gestão de leads

O Pipeline é um quadro estilo Kanban (como um mural de post-its). Cada coluna representa uma etapa do processo de venda.

### O que significa cada coluna

| Coluna | Significado |
|---|---|
| **Prospectado** | O bot encontrou essa empresa, mas ainda não enviou mensagem |
| **Enviado** | A mensagem de prospecção foi enviada (WhatsApp ou email) |
| **Respondeu** | O lead respondeu a mensagem |
| **Negociando** | Você está em conversa ativa com o lead |
| **Escopo** | O projeto foi definido e a proposta foi gerada |
| **Fechado** | Negócio fechado — o lead virou cliente |
| **Perdido** | O lead não quis seguir em frente |

### Como mover um lead entre colunas

Basta **clicar e arrastar** o card de um lead de uma coluna para outra. O sistema salva a mudança automaticamente.

Por exemplo: quando um lead responder sua mensagem, arraste-o de "Enviado" para "Respondeu".

### O que os cards mostram

Cada card de lead mostra:

- **Nome da empresa** — o nome do negócio
- **Barra de dor** — uma barra colorida com um número de 0 a 10. Quanto maior, mais problemas o site tem e maior a chance de o lead precisar dos seus serviços:
  - 🟢 Verde (0–3): poucos problemas
  - 🟡 Amarelo (4–6): alguns problemas
  - 🔴 Vermelho (7–10): muitos problemas
- **Cidade** — onde a empresa fica
- **Canal** — como a mensagem foi enviada: WhatsApp, Email ou Pendente
- **Tempo** — há quanto tempo o lead está nessa etapa (ex: "2h atrás", "3 dias")

Clique em qualquer card para abrir a página completa do lead.

### Como usar os filtros

No topo do Pipeline, você encontra filtros para encontrar leads específicos:

- **Buscar negócio** — digite o nome da empresa
- **Canal** — filtre por WhatsApp, Email ou Todos
- **Dor mín.** — mostra apenas leads com score de dor acima do valor escolhido (ex: 5 = só mostra leads com dor 5 ou mais)
- **Nicho** — filtre por tipo de negócio (ex: clínicas odontológicas, restaurantes)

---

## 4. Bot — Prospecção automática

### Como funciona o bot

O bot é um robô que busca empresas automaticamente na internet. Ele:

1. Procura empresas de um nicho específico em uma cidade
2. Analisa o site de cada empresa encontrada
3. Calcula um "score de dor" baseado nos problemas do site
4. Gera uma mensagem personalizada de prospecção
5. Envia a mensagem pelo WhatsApp (se você pedir)

Tudo isso acontece sozinho — você só precisa configurar e clicar em "Rodar".

### Como configurar o bot

No painel do Bot, preencha os campos da esquerda:

**Nicho** — Escolha o tipo de negócio que você quer prospectar. Os nichos estão organizados por categoria:

| Categoria | Exemplos de nichos |
|---|---|
| Saúde | Clínicas odontológicas, academias, psicólogos |
| Serviços profissionais | Advogados, contadores, imobiliárias |
| Alimentação | Restaurantes, cafeterias, padarias |
| Beleza | Salões de beleza, barbearias |
| Educação | Escolas de idiomas, auto escolas |

**Cidade** — Digite ou selecione a cidade. Ao selecionar, o sistema mostra se aquele território já foi prospectado (quantos leads já existem e quando foi a última execução).

**Limite** — Quantas empresas o bot vai buscar (de 5 a 100). O padrão é 20.

**Score mínimo** — O bot só vai considerar empresas com score de dor igual ou acima desse valor. O padrão é 4.

**Idioma** — PT para mensagens em português, EN para inglês.

**Export** — Onde salvar os resultados: CSV (planilha), Supabase (banco de dados do sistema) ou Ambos.

### O que é "Dry Run"

Quando o **Dry Run** está ligado, o bot faz tudo normalmente (busca empresas, analisa sites, calcula scores), mas **não envia nenhuma mensagem**. É útil para testar antes de enviar de verdade.

### O que é "Enviar mensagens"

Quando o botão **Enviar** está ativado, o bot vai de fato enviar as mensagens pelo WhatsApp para os leads qualificados. Esse botão fica desativado quando o Dry Run está ligado.

### Como usar a fila de execução

Você pode agendar várias configurações antes de rodar. Funciona assim:

1. Preencha os campos (nicho, cidade, etc.)
2. Clique em **Adicionar à fila**
3. Repita para quantas combinações quiser
4. Quando a fila estiver pronta, clique em **Rodar Fila**

A fila mostra cada item com o nicho, cidade e configuração. Você pode remover itens clicando no **X** ao lado.

Se o bot avisar que aquele território já foi prospectado, você pode escolher **Adicionar mesmo assim** ou **Cancelar**.

### Como ler o terminal durante a execução

O terminal (painel preto à direita) mostra o progresso em tempo real:

- **Texto branco**: informações gerais
- **Texto verde**: ações completadas com sucesso
- **Texto amarelo**: avisos
- **Texto vermelho**: erros
- **Texto roxo**: destaques

No topo do terminal, um indicador mostra o estado atual: **running** (rodando), **done** (finalizado) ou **error** (erro).

### Como cancelar uma execução

Se o bot estiver rodando, o botão muda para **Cancelar**. Clique nele para parar a execução atual.

### Histórico de execuções

Abaixo da configuração, a seção **Últimas execuções** mostra as últimas vezes que o bot rodou, com:

- Nicho e cidade
- Quantos leads foram coletados, qualificados e enviados
- Duração da execução
- Status (completado, falhou ou rodando)

Clique em qualquer execução anterior para recarregar as mesmas configurações no formulário.

### Score mínimo — qual valor usar

| Score mínimo | Quando usar |
|---|---|
| 3–4 | Prospecção ampla — pega mais leads, mas muitos terão poucos problemas |
| 5–6 | Equilíbrio — boa quantidade com qualidade razoável |
| 7–8 | Prospecção focada — menos leads, mas com problemas mais sérios |
| 9–10 | Muito restrito — poucos resultados, só os piores sites |

**Recomendação**: comece com **5** para ter um bom volume de leads qualificados.

---

## 5. Inbox — Central de mensagens

### Como funciona o inbox

O Inbox reúne todas as conversas com leads em um só lugar. A tela é dividida em duas partes:

- **Lado esquerdo**: lista de conversas, ordenada pela mensagem mais recente
- **Lado direito**: conversa aberta (mensagens + área de resposta)

Conversas com mensagens não lidas aparecem com:
- Um **ponto roxo** ao lado do nome
- O **nome em negrito**
- Um **número** indicando quantas mensagens não lidas existem

O inbox atualiza em tempo real — quando um lead responder, a mensagem aparece instantaneamente e um som de notificação toca.

Use o campo de **busca** no topo para encontrar uma conversa pelo nome da empresa.

### O que é o card de sugestão automática

Quando um lead responde, o sistema analisa a mensagem usando inteligência artificial e gera uma **sugestão de resposta**. O card mostra:

- **Intenção detectada** — o que o sistema entendeu que o lead quer:
  - 🟢 Interessado — o lead quer saber mais
  - 🔵 Preço — o lead perguntou sobre valores
  - 🔵 Escopo — o lead quer saber o que está incluso
  - 🟡 Objeção — o lead tem dúvidas ou resistência
  - 🔴 Não interessado — o lead recusou
  - 🟣 Agendamento — o lead quer marcar uma reunião
  - ⚪ Outro — não se encaixa nas categorias acima
- **Confiança** — um percentual de 0% a 100% que indica o quão seguro o sistema está da classificação
- **Texto sugerido** — a resposta que o sistema sugere enviar

### Como aprovar, editar ou rejeitar uma sugestão

- **Aprovar e Enviar** — envia a resposta exatamente como sugerida
- **Editar** — abre o texto para você modificar antes de enviar. Depois de editar, clique em **Pronto** e depois **Aprovar e Enviar**
- **Rejeitar** — descarta a sugestão. Você pode escrever sua própria resposta na caixa abaixo

### Como responder manualmente

Na parte de baixo da conversa, você encontra:

1. Uma caixa de texto para escrever sua mensagem
2. Botões de canal: **WhatsApp** ou **Email** — escolha por onde enviar
3. **Sugerir com IA** — pede ao sistema uma sugestão de resposta
4. **Enviar** — envia a mensagem pelo canal selecionado

Dica: use **Ctrl+Enter** para enviar rapidamente.

### Botões de ação do pipeline no inbox

No topo da conversa aberta, ao lado do nome do lead, aparece um botão de ação que muda conforme a etapa do projeto:

| Botão | Quando aparece |
|---|---|
| **Gerar Escopo** | Quando ainda não existe um projeto para o lead |
| **Marcar em progresso** | Quando o projeto foi aprovado pelo cliente |
| **Marcar entregue** | Quando o projeto está em progresso |
| **Cliente aprovou** | Quando o projeto foi entregue |
| **Marcar pago** | Quando o cliente aprovou o projeto |
| **Pago** (badge verde) | Quando o pagamento foi recebido |

Esses botões permitem avançar o projeto sem sair do inbox.

### Como ver o lead completo a partir do inbox

Clique no link **Ver lead** no topo da conversa para abrir a página completa do lead com todos os detalhes.

---

## 6. Lead Detail — Página do lead

Ao clicar em um lead no Pipeline ou no Inbox, você abre a página completa com todos os detalhes. A tela é dividida em:

- **Lado esquerdo**: informações e ações
- **Lado direito**: histórico de conversa

### Informações de contato

No topo, você vê:
- Nome da empresa
- Status atual (com cor) e canal (WhatsApp/Email)
- Site da empresa (clicável)
- Telefone (clicável para ligar)
- Cidade e endereço

### O que são os dados de análise técnica

O card **Análise técnica** mostra o que o bot descobriu sobre o site da empresa:

| Item | O que significa |
|---|---|
| SSL | O site tem conexão segura (cadeado no navegador) |
| Mobile friendly | O site funciona bem no celular |
| Meta Pixel | O site usa rastreamento do Facebook/Instagram |
| Google Analytics | O site mede suas visitas |
| WhatsApp no site | O site tem um link para WhatsApp |
| Formulário de contato | O site tem um formulário para contato |
| Sistema de booking | O site tem agendamento online |

Cada item mostra ✅ (tem) ou ❌ (não tem).

Também mostra a **plataforma do site** (Wix, WordPress, Squarespace, etc.) e os **scores de velocidade**:
- **Mobile Score** — nota do site no celular (0 a 100)
- **Performance Score** — nota geral de desempenho (0 a 100)
- 🟢 Acima de 89: bom
- 🟡 Entre 50 e 89: médio
- 🔴 Abaixo de 50: ruim

### O que é o Pain Score

O **Pain Score** (score de dor) é um número de 0 a 10 que indica quantos problemas o site do lead tem. Quanto maior o número, mais o lead precisa de um site novo.

Abaixo do número, uma lista mostra os motivos do score:
- "Site muito lento no celular"
- "Sem Meta Pixel"
- "Sem Google Analytics"
- "Sem WhatsApp no site"
- "Sem formulário de contato"
- "Sem sistema de agendamento"
- "Construído em plataforma ultrapassada"
- "Sem certificado SSL"
- "Não otimizado para mobile"

Esses motivos são ótimos argumentos para usar na negociação com o lead.

### Outreach — A mensagem de prospecção

O card **Outreach** mostra a mensagem que o bot gerou e enviou para o lead, junto com:
- Se a mensagem já foi enviada ou está pendente
- O canal usado (WhatsApp ou email)
- A data e hora do envio

### Como ler o histórico de conversa

No lado direito da tela, a seção **Conversa** mostra todas as mensagens trocadas:

- **Mensagens enviadas** (suas) aparecem à direita com fundo roxo
- **Mensagens recebidas** (do lead) aparecem à esquerda com fundo escuro
- Mensagens sugeridas pela IA aparecem com um badge "IA"
- Cada mensagem mostra a data e hora

Se ainda não houver conversa, aparece "Nenhuma conversa ainda".

### Como avançar o status do lead

No card **Pipeline**, use o menu de seleção para mudar o status do lead para qualquer etapa (Prospectado, Enviado, Respondeu, etc.).

### Como gerar e enviar uma proposta

Quando o lead chega na etapa de **Escopo**, o sistema gera automaticamente uma proposta com:

- **Escopo** — lista do que será feito no projeto
- **Valor** — o preço em reais (você pode editar)
- **Preview da mensagem** — como a proposta vai aparecer no WhatsApp

Você tem duas opções:
- **Aprovar e Enviar no WhatsApp** — envia a proposta direto para o lead
- **Descartar** — descarta a proposta gerada

### O fluxo completo do projeto

Após a proposta ser enviada, o projeto passa pelas seguintes etapas:

| Etapa | O que acontece | Ação disponível |
|---|---|---|
| **Escopo** | Proposta gerada e enviada | Aguardar resposta do cliente |
| **Aprovado** | Cliente autorizou o projeto | Clicar em "Marcar em progresso" |
| **Em progresso** | Você está executando o projeto | Inserir link de preview e clicar em "Enviar link de preview" |
| **Entregue** | O preview foi enviado ao cliente | Clicar em "Cliente aprovou" quando ele aprovar |
| **Aprovado pelo cliente** | Cliente aprovou o resultado | Inserir chave PIX e clicar em "Gerar cobrança PIX" |
| **Pago** | Pagamento recebido | Clicar em "Gerar prompt Claude Code" para obter o prompt de execução |

### Como gerar o prompt para executar o projeto

Quando o projeto está na etapa **Pago**, aparece o botão **Gerar prompt Claude Code**. Ao clicar, o sistema gera um prompt detalhado com tudo o que é necessário para executar o projeto. Use o botão **Copy** para copiar e colar onde precisar.

---

## 7. Fluxo completo — do lead ao pagamento

Aqui está o passo a passo de todo o processo, do começo ao fim:

**1. Bot prospecta**
O bot busca empresas no nicho e cidade que você escolheu. Ele analisa cada site e calcula o score de dor.

**2. Mensagem enviada**
O bot envia uma mensagem personalizada pelo WhatsApp para cada lead qualificado (que atingiu o score mínimo).

**3. Lead responde**
O lead responde no WhatsApp. A mensagem aparece no Inbox e o sistema toca um som de notificação.

**4. IA sugere resposta**
O sistema analisa a mensagem do lead e sugere uma resposta automática, classificando a intenção (interessado, preço, escopo, etc.).

**5. Você aprova a sugestão**
Revise a sugestão da IA. Você pode aprovar, editar ou escrever sua própria resposta.

**6. Negociação**
Troque mensagens com o lead até alinhar expectativas. Mova o lead para "Negociando" no Pipeline.

**7. Definição de escopo**
Quando o lead estiver pronto, use o botão "Gerar Escopo" no Inbox ou mova para "Escopo" no Pipeline. O sistema gera uma proposta com escopo e valor.

**8. Proposta enviada**
Revise a proposta gerada. Ajuste o valor se necessário e clique em "Aprovar e Enviar no WhatsApp".

**9. Cliente autoriza**
Quando o cliente aceitar a proposta, clique em "Cliente autorizou" para mover o projeto para "Aprovado".

**10. Execução do projeto**
Clique em "Marcar em progresso" e comece a trabalhar no projeto.

**11. Preview enviado**
Insira o link do preview do site e clique em "Enviar link de preview" para o cliente ver o resultado.

**12. Cliente aprova**
Quando o cliente gostar do resultado, clique em "Cliente aprovou".

**13. Pagamento**
Insira sua chave PIX e clique em "Gerar cobrança PIX" para enviar a cobrança ao cliente.

**14. Projeto finalizado**
Após o pagamento, clique em "Gerar prompt Claude Code" para obter as instruções de execução. Copie o prompt e finalize o projeto.

---

## 8. Métricas

A página de Métricas mostra o desempenho geral da sua prospecção e vendas.

### Filtros de período

No topo da tela, escolha o período que deseja analisar:
- **Hoje** — apenas o dia atual
- **7 dias** — última semana
- **30 dias** — último mês
- **Tudo** — todos os dados desde o início

### O que cada número significa

No topo, quatro cards mostram os números principais:

| Card | O que mostra |
|---|---|
| **Total Leads** | Quantos leads existem no período selecionado |
| **Taxa Resposta** | Porcentagem de leads que responderam (de todos que receberam mensagem) |
| **Em Negociação** | Quantos leads estão sendo negociados agora |
| **Receita Total** | Quanto dinheiro foi recebido em projetos fechados |

### Como ler o funil de conversão

O gráfico de **Funil de Conversão** mostra quantos leads estão em cada etapa, com barras coloridas. Ao lado de cada barra, aparece o número absoluto e a porcentagem em relação ao total de leads prospectados.

Exemplo: se você tem 100 leads prospectados e 15 responderam, a barra "Respondeu" mostra "15 (15%)".

Esse funil ajuda a identificar onde você está perdendo leads. Se muitos leads são enviados mas poucos respondem, a mensagem de prospecção pode precisar de ajustes.

### Receita

O card de receita mostra:
- **Total Paga** — quanto já foi recebido (em verde)
- **Pendente** — quanto está aguardando pagamento (em amarelo)
- **Ticket Médio** — valor médio por projeto
- **Fechados (mês)** — quantos projetos foram fechados no mês atual, com comparação ao mês anterior
- **Últimos Projetos** — tabela com os projetos recentes, mostrando nome, valor e data

### Nichos e cidades

Dois gráficos mostram quais nichos e cidades estão gerando mais leads, ajudando a decidir onde concentrar esforços.

---

## 9. Dicas de uso

### Qual score mínimo usar para cada nicho

- **Restaurantes e alimentação**: use score 4–5. Esse nicho costuma ter sites simples, então scores muito altos geram poucos resultados.
- **Clínicas e saúde**: use score 5–6. Esses negócios geralmente investem mais em presença online, então é bom ser mais seletivo.
- **Advogados e contadores**: use score 5–7. Sites de serviços profissionais costumam ser mais antigos e ter mais problemas.
- **Salões e barbearias**: use score 4–5. Muitos nem têm site, então o volume já é menor.
- **Academias**: use score 5–6. Bom equilíbrio entre volume e qualidade.

### Quantas mensagens enviar por dia

O WhatsApp tem limites para evitar bloqueios. Siga estas regras:

- **Máximo 20–30 mensagens por dia** para números novos
- **Espalhe as execuções** ao longo do dia (não envie tudo de uma vez)
- **Comece com volumes menores** (10–15) e aumente gradualmente
- **Nunca envie mais de 50 mensagens em um dia** — risco alto de bloqueio
- Se o número for bloqueado temporariamente, pare por 24 horas

### Como responder leads que pediram preço

Quando a IA detectar intenção "Preço":

1. Não responda direto com o valor
2. Primeiro, pergunte sobre o que ele precisa exatamente
3. Destaque os problemas que o bot encontrou no site dele
4. Só depois apresente uma faixa de valor
5. Exemplo: "Antes de falar em valor, me conta: seu objetivo principal é ter mais clientes pelo site ou mais pelo WhatsApp? Pergunto porque vi que seu site atual não tem [problema encontrado]."

### Como responder leads que pediram escopo

Quando a IA detectar intenção "Escopo":

1. Use os dados da análise técnica como base
2. Liste os problemas encontrados
3. Proponha soluções específicas para cada problema
4. Use o botão "Gerar Escopo" para criar uma proposta automaticamente

### Como lidar com leads não interessados

1. Não insista — marque como "Perdido" no Pipeline
2. Se o lead respondeu com um "agora não", espere 30 dias e tente novamente
3. Se o lead respondeu de forma negativa, respeite e siga em frente
4. Nunca envie mais de uma mensagem para quem pediu para não ser contatado

### Melhores nichos para começar

Se está começando agora, estes nichos costumam ter boa taxa de conversão:

1. **Clínicas odontológicas** — alta demanda por presença online, bons orçamentos
2. **Advogados** — sites geralmente desatualizados, valorizam imagem profissional
3. **Imobiliárias** — precisam de sites rápidos para mostrar imóveis
4. **Restaurantes** — volume alto, conversão rápida
5. **Academias** — crescimento constante, investem em marketing digital

---

## 10. Perguntas frequentes

**1. O bot envia mensagens sozinho?**
Somente se você ativar a opção "Enviar" na configuração. Com o "Dry Run" ligado, ele apenas busca e analisa sem enviar nada.

**2. Posso editar a mensagem que o bot vai enviar?**
A mensagem é gerada automaticamente para cada lead. Você pode ver a mensagem na página do lead (card Outreach), mas a edição é feita antes do envio, na etapa de aprovação de sugestões.

**3. O que acontece se o WhatsApp bloquear meu número?**
Reduza o volume de envios e espere 24 horas. Envie no máximo 20–30 mensagens por dia e espalhe ao longo do dia.

**4. Posso rodar o bot para cidades fora do Brasil?**
Sim. Mude o idioma para EN e selecione cidades dos EUA (Miami, Austin, New York, etc.).

**5. O que é a sugestão automática da IA?**
Quando um lead responde, o sistema usa inteligência artificial para entender o que o lead quer e sugere uma resposta apropriada. Você sempre pode editar ou ignorar a sugestão.

**6. Como sei se um lead leu minha mensagem?**
O sistema registra mensagens enviadas e recebidas, mas não mostra confirmação de leitura do WhatsApp. A melhor indicação é se o lead respondeu.

**7. Posso usar o sistema no celular?**
O sistema funciona no navegador do celular, mas a experiência é melhor no computador por causa das telas de Pipeline e Inbox que usam duas colunas.

**8. O que significa "Sem Meta Pixel" na análise técnica?**
O Meta Pixel é um código do Facebook/Instagram que permite rastrear visitantes do site e criar anúncios direcionados. Se o site do lead não tem, ele está perdendo oportunidades de marketing — e isso é um bom argumento de venda.

**9. Como faço para gerar uma proposta?**
Mova o lead para a etapa "Escopo" ou use o botão "Gerar Escopo" no Inbox. O sistema gera automaticamente uma proposta com escopo e valor. Revise, ajuste o preço se necessário e envie.

**10. Posso atender mais de um nicho ao mesmo tempo?**
Sim. Você pode adicionar várias combinações de nicho e cidade na fila do bot e rodar tudo de uma vez. Cada combinação será executada na ordem da fila.

**11. O que fazer se o bot não encontrar nenhum lead?**
Tente reduzir o score mínimo ou aumentar o limite. Alguns nichos em cidades menores podem ter poucos resultados. Tente uma cidade maior ou um nicho diferente.

**12. Como sei quanto cobrar do cliente?**
O sistema sugere um valor na proposta, mas você pode ajustar. Use os dados da análise técnica para justificar o preço — quanto mais problemas o site tiver, mais valor você está entregando.

**13. Onde vejo todo o histórico de conversas com um lead?**
Na página do lead (clique no card no Pipeline ou no link "Ver lead" no Inbox). O histórico completo fica no lado direito da tela.

**14. O que é o "prompt Claude Code" que aparece quando o projeto é pago?**
É um conjunto de instruções gerado automaticamente para executar o projeto. Ele contém tudo o que foi definido no escopo. Copie esse texto e use-o como referência para construir o projeto.

---

*Manual atualizado em abril de 2025. FastDevBuilds Admin.*
