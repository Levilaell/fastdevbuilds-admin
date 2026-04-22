# Backlog

Lista viva de pendências e melhorias. Prioridade em ordem — os primeiros impactam conversão/venda, depois operação, depois técnico.

## Bugs de conversão (prioridade alta)

- [ ] CRM não recebe várias respostas dos envios — mensagens chegam no WhatsApp mas não aparecem no inbox. Perdendo leads quentes. Investigar webhook Evolution → endpoint CRM.
- [ ] Leads em status `prospected` que deveriam ter enviado e não enviaram. Ação: deletar e re-prospectar nos próximos envios.
- [ ] Mensagens de prospecção parecem confusas. Revisar templates, testar variações mais diretas.

## Produto (gerador de sites)

- [ ] Na mensagem de preview, avisar que imagens são geradas por IA e oferecer substituição por fotos reais do cliente.
- [ ] Parte 6 — fotos reais Google Places pra nichos Categoria B (padaria, salão, estética, mecânica). Hoje tudo vira Getimg.
- [ ] Endpoint `/api/projects/[place_id]/generate-prompt`: adicionar `maxDuration = 300` + confirmação na UI antes de regenerar (evita queimar ~280 credits por acidente).
- [ ] Validar hero e cards em mobile com rigor (DevTools + celular real). Aparentemente ok, nunca testado.
- [ ] `formatted_address` já é pedido no Place Details mas não é consumido — poderia sobrescrever `lead.address` pelo valor canônico.

## Bot (prospect-bot)

- [ ] Reconciliar constantes de max envios por chip e max total. Hoje estão espalhadas em múltiplos arquivos.
- [ ] Mecanismo de limpeza para leads perdidos (sem resposta em X dias vira `lost` automaticamente). Não sei se existe.
- [ ] Verificar fila automática: comparar arquivo de queue vs banco vs envios reais. Pode ter itens que deveriam rodar e não rodaram.
- [ ] Limpar leads de teste (`test_*`, `preview_test_*`, dummies).

## Frontend CRM

- [ ] Remover follow-up antigo do frontend (não é mais usado).

## Segurança

- [ ] `GOOGLE_PLACES_KEY` sem application restrictions. Risco explícito aceito por ora, mas rever.
- [ ] Configurar cap de gasto no Google Cloud Billing (R$/mês máximo) caso chave vaze.
- [ ] Proxy `/api/places/photo?ref=...` para ocultar chave das URLs de foto renderizadas em sites públicos.
