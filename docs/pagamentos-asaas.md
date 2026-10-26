# Pagamentos com Asaas (sandbox)

O DocObra cobra por Pix via Asaas. **Por enquanto tudo roda no sandbox**, que é uma
conta separada da produção e sai em minutos.

## 1. Conta e chave

1. Crie a conta em https://sandbox.asaas.com.
2. Gere a API key (Integrações → Chaves de API) e ponha no `.env`:
   ```bash
   ASAAS_API_KEY="<chave do sandbox>"
   ASAAS_BASE_URL="https://api-sandbox.asaas.com"
   PAGAMENTOS_ORDEM="asaas"
   ```
3. Cadastre uma chave Pix na conta sandbox (o QR Code dinâmico depende dela).

## 2. Verificação da API

```bash
node scripts/asaas-sandbox-check.mjs --cpfcnpj=<CPF ou CNPJ válido de teste>
```

O script cria um cliente e uma cobrança Pix de R$ 5,00, consulta por `externalReference`,
busca o QR e cancela. Anote o que aparecer de diferente do esperado, em especial:

- o **valor mínimo** aceito para uma cobrança Pix (ajuste `PAGAMENTO_VALOR_MINIMO_CENTAVOS`);
- se o `cpfCnpj` é realmente obrigatório para gerar a cobrança.

## 3. Webhook

O Asaas precisa alcançar uma URL pública. Em desenvolvimento use um túnel (por exemplo
`ngrok http 3000`).

1. No sandbox, Integrações → Webhooks → novo webhook:
   - URL: `https://<seu-endereço-público>/api/webhooks/pagamentos/asaas`
   - Token de autenticação (`authToken`): um valor longo e aleatório. O mesmo valor vai no
     `.env` como `ASAAS_WEBHOOK_TOKEN`.
   - Eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`,
     `PAYMENT_DELETED`, `PAYMENT_REFUNDED`.
2. O app responde `200` só depois de gravar o evento. **Quinze falhas seguidas pausam a fila
   de webhooks do Asaas**: se isso acontecer, reative a fila no painel.
3. Para simular o pagamento de um Pix no sandbox, siga o guia do Asaas
   ("Testar pagamento de QR Codes Pix").

## 4. Renovações

A rota `POST /api/cron/renovacoes` gera as cobranças de renovação (10 dias antes do
vencimento) e só considera assinaturas de plano mensal. Defina `CRON_SECRET` e agende no Coolify (Scheduled Task, 1x por dia):

```bash
curl -fsS -X POST https://<dominio>/api/cron/renovacoes -H "Authorization: Bearer $CRON_SECRET"
```

A rota é idempotente: rodar mais de uma vez no dia não duplica cobrança.

**Escopo**: o Pix cobre só o plano mensal. Plano anual e cartão ficam para a fase do
cartão (o card aparece como "Em breve no cartão"); não há boleto.

**Cancelamento**: o botão fica na tela de Assinatura. Cancelada, a assinatura mantém o
acesso até o vencimento. Reativar antes do vencimento é uma renovação: a nova cobrança
emenda no vencimento atual.

**Operação local**: no `.env` de desenvolvimento, escape o `$` inicial da chave do Asaas
(`ASAAS_API_KEY="\$aact_..."`), porque o Next expande `$`. Em produção (Coolify) não precisa.

## 5. O que o Asaas faz sozinho

As notificações ao cliente ficam **ligadas** de propósito: o Asaas manda por e-mail o
link do Pix, o que serve de lembrete de renovação (o DocObra ainda não tem e-mail próprio).

## Antes de ir para produção

Troque a chave e `ASAAS_BASE_URL`, recrie o webhook na conta de produção com um novo
`authToken`, e valide de novo o valor mínimo.

## 6. Lançamento (checklist)

Faça nesta ordem; a tela `/dashboard/configuracoes/assinatura` já existe, mas só cobra de verdade com as chaves de produção.

1. **Conta e webhook**: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e o webhook apontando para
   `/api/webhooks/pagamentos/asaas` (sandbox para validar; troque por produção ao lançar,
   com `ASAAS_BASE_URL` de produção). Rode `node scripts/asaas-sandbox-check.mjs --cpfcnpj=<válido>`
   antes e ajuste `PAGAMENTO_VALOR_MINIMO_CENTAVOS` se o mínimo do Asaas for maior que R$ 5,00.
2. **Banco**: aplique o schema em produção com `drizzle-kit push` **antes** de publicar o código
   (3 tabelas novas, `empresa.documento` anulável e índices; é aditivo).
3. **Renovações**: defina `CRON_SECRET` e crie a tarefa agendada diária no Coolify para
   `POST /api/cron/renovacoes` (seção 4).
4. **Empresas existentes**: `node scripts/seed-planos.mjs --preencher-existentes` se houver empresa
   sem assinatura; defina `SUPORTE_EMAIL`. Empresas criadas antes do campo de CPF/CNPJ informam o
   documento na primeira cobrança (o diálogo pede sozinho).
5. **Fim do trial**: estenda os trials em andamento (`admin-plano estender`) e só então ligue
   `ASSINATURA_SUSPENSAO_ATIVA=true`.
6. **Preços e limites**: os valores do seed (R$ 99 e R$ 249; 20 e 90 documentos por mês) são
   provisórios. Revise antes de cobrar de verdade.
7. **Teste ponta a ponta no sandbox**: crie uma conta nova, assine o Essencial, pague o Pix de
   teste, confira o plano ativo e o consumo; depois faça um upgrade e uma renovação (ajustando
   `vence_em` no banco para 3 dias à frente).
