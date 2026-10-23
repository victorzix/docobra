# Planos e permissões — Fase 4a (núcleo de pagamento com Asaas) — design

Data: 2026-10-23. Status: aprovado em brainstorm, aguardando plano de implementação.
Base: Fases 1 a 3 já na `main` (permissões, assinatura/trechos, biblioteca `core/billing`) e a seção 2 do spec da Fase 1.
Escopo: backend do pagamento, **sem tela** (as telas e o lançamento são a Fase 4b). Tudo contra o **sandbox** do Asaas por enquanto.

## Decisões fechadas

| Tema | Decisão |
| --- | --- |
| Gateway inicial | **Asaas** (sandbox). AbacatePay vira o segundo provider quando a conta dele responder; mais um arquivo que implementa `PaymentProvider` |
| Forma de pagamento | Só Pix na v1 |
| Cadastro do cliente | O Asaas exige cadastro prévio com `cpfCnpj`: novo campo `empresa.documento` e tabela `cliente_gateway` |
| Notificações do Asaas ao cliente | **Ligadas** (servem de lembrete de renovação; não há e-mail próprio) |
| Primeiro pagamento | Reinicia o dia 0 (`assinatura.inicio` = data do pagamento) |
| Vencimento da cobrança | Assinar e upgrade vencem em 3 dias; renovação vence no fim do ciclo (se já passou, em 3 dias) |
| Valor mínimo | Configurável (`PAGAMENTO_VALOR_MINIMO_CENTAVOS`, padrão 500); upgrade abaixo disso cobra o mínimo; valor a validar no sandbox |
| Cancelamento pelo cliente | Fora da v1 (continua pelo suporte) |
| Fim do trial | A suspensão por data (`ASSINATURA_SUSPENSAO_ATIVA`) é ligada no lançamento (Fase 4b) |

## API do Asaas usada (confirmada na documentação)

- Autenticação: header `access_token`. Base do sandbox: `https://api-sandbox.asaas.com` (variável `ASAAS_BASE_URL`).
- `POST /v3/customers` (`name`, `cpfCnpj` obrigatórios; `email`, `externalReference`) → `id` (`cus_...`). Não criar um cliente novo por pagamento.
- `POST /v3/payments` (`customer`, `billingType: "PIX"`, `value` em **reais decimais**, `dueDate` `YYYY-MM-DD`, `externalReference`, `description`) → `id` (`pay_...`).
- `GET /v3/payments/{id}/pixQrCode` → `encodedImage` (base64), `payload` (copia e cola), `expirationDate`.
- `GET /v3/payments?externalReference=...` (filtro confirmado) e `DELETE /v3/payments/{id}`.
- Sem header de idempotência: o `externalReference` é o ID da nossa `cobranca`, estável em todas as tentativas; o ID do Asaas é guardado assim que volta; antes de recriar após timeout, consulta-se por `externalReference`.
- Webhook: token estático no header `asaas-access-token` (não é HMAC); o `id` do evento é estável em reenvio; responder `200` só depois de persistir e rápido (15 falhas seguidas pausam a fila).
- Eventos mapeados: `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` → paga; `PAYMENT_OVERDUE` → vencida; `PAYMENT_DELETED` → cancelada; `PAYMENT_REFUNDED` → estornada; os demais recebem `200` sem ação.

## 1. Modelo de dados

- `empresa.documento` (CPF ou CNPJ, só dígitos, opcional).
- `cliente_gateway`: `empresa_id` + `provider` (PK), `provider_cliente_id`.
- `cobranca`: assinatura, empresa, `tipo` (`assinatura` | `upgrade` | `renovacao`), `plano_destino_id`, `valor_centavos`, `status` (`pendente` | `paga` | `vencida` | `cancelada` | `estornada`), `vence_em`, `provider`, `provider_charge_id`, `pix_copia_e_cola`, `pix_qr_code_base64`, `pix_expira_em`, `paga_em`. Índice único em (`provider`, `provider_charge_id`).
- `evento_pagamento`: `provider` + `event_id` (índice único), `tipo_original`, `provider_charge_id`, `cobranca_id` (nulo se não achar), `payload`, `resultado`.

## 2. `src/core/payments/` (mesmo padrão de `src/core/llm/`)

- `types.ts`: `PaymentProvider` (`nome`, `criarCliente`, `criarCobranca`, `buscarCobrancaPorReferencia`, `cancelarCobranca`, `lerWebhook`), `CobrancaCriada`, `EventoPagamento` normalizado.
- `erros.ts`: `RecusaDefinitivaError` (4xx, o gateway recusou), `FalhaIncertaError` (rede, timeout, 5xx, 408, 429: pode ter sido criada), `WebhookNaoAutenticadoError`, `WebhookInvalidoError`.
- `formatos.ts`: `centavosParaReais`, `dataIso` (fuso de São Paulo).
- `asaas.ts`: `AsaasProvider` (`fetch` injetável para teste).
- `router.ts`: `PaymentRouter`. Passa para o próximo provider **somente** em `RecusaDefinitivaError`; em `FalhaIncertaError` não troca de gateway (a cobrança pode ter sido criada) e anota qual provider falhou no erro.
- `index.ts`: monta o router a partir do ambiente (`PAGAMENTOS_ORDEM`, padrão `asaas`), de forma preguiçosa.

## 3. Serviços em `src/lib/pagamentos/`

- `iniciarCobranca({ empresaId, tipo, planoDestinoChave?, agora?, roteador?, valorMinimoCentavos? })`: valida se o tipo é permitido para o estado da assinatura; calcula valor e vencimento (upgrade pelo `simularUpgrade` da Fase 3); **reaproveita** cobrança pendente igual; exige `empresa.documento`; grava a `cobranca` **antes** de falar com o gateway; cadastra o cliente se preciso; cria a cobrança no gateway; em `FalhaIncertaError` consulta por `externalReference` e adota a que existir.
  - `assinatura`: só se a assinatura é `trial`, `cancelada` ou está suspensa (vencida além da carência); `renovacao`: só se `ativa` e vigente ou em carência; `upgrade`: só se `ativa` e vigente, destino ativo, público e aprovado pela política.
- `aplicarPagamento(tx, cobranca, agora)`: efeitos de um pagamento confirmado, dentro da transação do evento:
  - `assinatura`: fecha o trecho vigente, abre o do plano novo (origem `autoatendimento`), `inicio = agora`, `status = ativa`, `vence_em = agora + ciclo`.
  - `upgrade`: troca o trecho e **mantém o dia 0 e o vencimento**.
  - `renovacao`: `vence_em = proximoVencimento(vence_em, ciclo)` (alinhado ao ciclo, não à data do pagamento) e `status = ativa`.
  - Em todos: marca a cobrança `paga`, cancela as outras cobranças `pendente`/`vencida` da assinatura e devolve quais precisam ser canceladas no gateway (feito **depois** do commit, sem derrubar o processamento se falhar).
- `processarEventoPagamento(provider, evento)`: **uma transação** grava o evento (`ON CONFLICT DO NOTHING`), acha a cobrança (por `externalReference`, senão por `provider_charge_id`), aplica o status e registra o resultado. Se o processamento falhar, o evento também volta atrás, e o reenvio do Asaas reprocessa. Resultados: `processado`, `ignorado`, `duplicado`, `sem_cobranca`, `pagamento_sem_efeito` (pagou outra cobrança do mesmo pedido ou uma cobrança já cancelada: dinheiro entrou sem efeito, o suporte resolve).
- `gerarRenovacoes({ agora, antecedenciaDias, roteador })`: para assinaturas `ativa` com vencimento entre `agora − carência` e `agora + antecedência`, garante a cobrança de renovação (idempotente) e conta `garantidas`, `semDocumento` e `falhas` sem derrubar o lote.

## 4. Rotas

- `POST /api/webhooks/pagamentos/[provider]`: `404` provider desconhecido, `401` token inválido, `400` corpo inválido, `200` para evento sem ação, duplicado ou processado; `500` se o processamento falhar (para o Asaas reenviar).
- `POST /api/cobrancas` (sessão): corpo `{ tipo, planoChave? }` → `201` com a cobrança e o Pix. Erros: `422 DOCUMENTO_AUSENTE`, `409 COBRANCA_NAO_PERMITIDA` (com `motivo`), `502` falha do gateway.
- `GET /api/cobrancas/[id]` (sessão, só da própria empresa): status e Pix, para a tela atualizar sozinha.
- `PUT /api/empresa/documento` (sessão): grava CPF/CNPJ (só dígitos; 11 ou 14).
- `POST /api/cron/renovacoes`: `Authorization: Bearer CRON_SECRET`, chamada diária (tarefa agendada do Coolify); `503` sem `CRON_SECRET`, `401` com token errado.

## 5. Variáveis de ambiente

`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL` (padrão `https://api-sandbox.asaas.com`), `PAGAMENTOS_ORDEM` (padrão `asaas`), `CRON_SECRET`, `PAGAMENTO_VALOR_MINIMO_CENTAVOS` (padrão 500). O provider só é montado quando usado: sem `ASAAS_API_KEY` o app e os testes seguem funcionando.

## 6. Testes (Vitest)

Provider Asaas com `fetch` simulado (cada endpoint, cada classe de erro, o webhook com token certo, errado, evento ignorado). Router (fallback só em recusa definitiva, sem troca em falha incerta). Serviços e rotas contra o banco de teste, com provider falso: todos os efeitos de pagamento, idempotência de evento duplicado, pagamento sem efeito, reaproveitamento de cobrança pendente, adoção após timeout, renovação idempotente. Verificação real no sandbox por script manual (`scripts/asaas-sandbox-check.mjs`), quando o Victor tiver a chave.

## Fora desta fase

Telas (planos, pagamento, aviso de suspensão), ligar `ASSINATURA_SUSPENSAO_ATIVA`, boleto e cartão, cancelamento pelo cliente, provider AbacatePay, preços reais.
