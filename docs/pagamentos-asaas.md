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

A rota `POST /api/cron/renovacoes` gera as cobranças de renovação (5 dias antes do
vencimento). Defina `CRON_SECRET` e agende no Coolify (Scheduled Task, 1x por dia):

```bash
curl -fsS -X POST https://<dominio>/api/cron/renovacoes -H "Authorization: Bearer $CRON_SECRET"
```

A rota é idempotente: rodar mais de uma vez no dia não duplica cobrança.

## 5. O que o Asaas faz sozinho

As notificações ao cliente ficam **ligadas** de propósito: o Asaas manda por e-mail o
link do Pix, o que serve de lembrete de renovação (o DocObra ainda não tem e-mail próprio).

## Antes de ir para produção

Troque a chave e `ASAAS_BASE_URL`, recrie o webhook na conta de produção com um novo
`authToken`, e valide de novo o valor mínimo.
