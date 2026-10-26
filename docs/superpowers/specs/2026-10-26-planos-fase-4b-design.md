# Planos e permissões — Fase 4b (telas de planos e pagamento, lançamento) — design

Data: 2026-10-26. Status: aprovado em brainstorm, aguardando plano de implementação.
Base: Fase 4a na `main` (backend do pagamento com Asaas sandbox: `POST/GET /api/cobrancas`, `PUT /api/empresa/documento`, webhook, cron de renovação).
Escopo: telas, coleta do CPF/CNPJ, pequenos ajustes de backend adiados da revisão da 4a e o checklist de lançamento.

## Decisões fechadas

| Tema | Decisão |
| --- | --- |
| Tela de planos | Uma só, `/dashboard/planos`, adaptativa ao estado da assinatura |
| Ações por card | `assinar` (trial, suspensa, cancelada), `renovar` (ativa ou carência, plano atual), `upgrade` com valor simulado (nível maior, mesma periodicidade), `suporte` (demais), `atual` |
| Exibição do Pix | Diálogo (shadcn Dialog) na própria página, com polling de `GET /api/cobrancas/[id]` |
| CPF/CNPJ | Campo obrigatório no `/register`, gravado em `empresa.documento`. Empresas antigas: passo extra no diálogo ao receber `422 DOCUMENTO_AUSENTE` |
| "Falar com o suporte" (limite estourado) | Vira "Ver planos", link para `/dashboard/planos`; o mailto fica como link secundário na tela de planos (downgrade, mensal↔anual) |
| Animações | Framer Motion; sem Anime.js (fora de landing, login e registro) |
| Papéis | Sem checagem de papel nas rotas novas enquanto os papéis não estiverem fechados |

## 1. Validação do documento

- `src/lib/pagamentos/documento.ts`: `validarDocumento(digitos)`, função pura que confere os dígitos verificadores de CPF (11) e CNPJ (14) e recusa sequências repetidas (`111.111.111-11`).
- `src/lib/validations/empresa/documento.schema.ts` passa a usar `validarDocumento` depois de remover a máscara. O mesmo schema serve ao `PUT /api/empresa/documento`, ao registro e ao passo do diálogo.
- `src/lib/validations/auth/register.schema.ts` ganha o campo `documento` (reaproveita o schema acima).
- `src/app/api/auth/register/route.ts` grava `empresa.documento` na transação que já cria empresa, trial e usuário.
- O formulário de `/register` ganha o campo com máscara simples (sem biblioteca nova).

## 2. Leitura de dados da tela

- `src/lib/planos/carregar-tela-de-planos.ts` (servidor): junta `buscarAssinaturaVigente`, `derivarStatus`, os planos públicos ativos e, para cada plano de nível maior na mesma periodicidade, o `simularUpgrade`. Devolve um objeto serializável com a ação de cada card (`assinar | renovar | upgrade | suporte | atual`) e o valor do upgrade; o client não decide regra de negócio.
- `src/app/dashboard/planos/page.tsx` (server) chama o loader e renderiza `<PlanosTela dados={...} />`. Item "Planos" na sidebar (`components/dashboard/sidebar.tsx`).

## 3. Componentes e hooks (client)

- `src/components/planos/planos-tela.tsx`: resumo da assinatura (plano, status, vencimento, dias restantes) + grid de cards. Guarda em `useState` qual cobrança está aberta no diálogo (um nível de props, sem Zustand).
- `plano-card.tsx`: card no visual da landing, botão conforme a ação.
- `pix-dialog.tsx`: três estados (gerando, aguardando pagamento, paga ou expirada). QR em `<img>` com o base64, botão de copiar o copia-e-cola, valor e vencimento. Em `paga`: mensagem de sucesso. Em vencida ou cancelada: "gerar novo Pix".
- `documento-passo.tsx`: formulário RHF + Zod (com `documento.schema.ts`) mostrado dentro do diálogo só quando a criação da cobrança volta `422 DOCUMENTO_AUSENTE`; salva e repete a cobrança.
- Hooks em `src/hooks/`: `use-criar-cobranca` (mutation), `use-cobranca` (query com `refetchInterval` de 4 s, desligado quando o status deixa de ser `pendente`), `use-salvar-documento` (mutation). Ao pagar: invalida `["permissoes"]` e chama `router.refresh()`.
- `src/components/common/uso-do-modulo.tsx`: o botão "Falar com o suporte" vira "Ver planos" (`Link` para `/dashboard/planos`) quando bloqueado, sem depender mais de `SUPORTE_EMAIL`.

## 4. Ajustes de backend (itens adiados da revisão final da 4a)

- Recusa definitiva do gateway devolve `502` com código `GATEWAY_RECUSOU` e mensagem própria; falha incerta continua `502` genérico.
- `efeitos.ts` (`aplicarPagamento`): se a assinatura está `suspensa` quando a cobrança de renovação ou upgrade é paga, aplica o efeito de `assinatura` (reinicia o ciclo), em vez de cobrar o preço cheio por pouco ou nenhum acesso.

## 5. Erros na tela

- `409 COBRANCA_NAO_PERMITIDA`: toast e `router.refresh()` (o estado mudou).
- `422 DOCUMENTO_AUSENTE`: abre o passo do documento.
- `502 GATEWAY_RECUSOU` ou genérico: "Não conseguimos gerar o Pix, tente de novo."
- Botão desabilitado durante a mutation; o backend já reaproveita cobrança pendente igual, então clique duplo não cria Pix novo.

## 6. Testes (Vitest)

- `validarDocumento`: CPF e CNPJ válidos, dígito errado, tamanho errado, sequências repetidas, com e sem máscara.
- `carregarTelaDePlanos` contra o banco de teste: uma assinatura por estado (trial, ativa vigente, carência, suspensa, cancelada), ação de cada card e valor do upgrade.
- Rota de registro: grava o documento; rejeita documento inválido.
- `aplicarPagamento` sobre assinatura suspensa; `GATEWAY_RECUSOU` na rota de cobranças.
- Componentes: `pix-dialog` com polling simulado (pendente → paga) se o projeto já tem testes de componente; caso contrário, verificação no navegador com o sandbox do Asaas.

## 7. Lançamento (checklist, sem código novo)

1. Conta Asaas (sandbox para validar; produção ao lançar): `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, webhook apontando para `/api/webhooks/pagamentos/asaas`; rodar `node scripts/asaas-sandbox-check.mjs --cpfcnpj=<válido>`.
2. Aplicar o schema em produção com `drizzle-kit push` antes de publicar o código (3 tabelas novas, `empresa.documento` anulável, índices).
3. `CRON_SECRET` e tarefa agendada diária no Coolify para `POST /api/cron/renovacoes`.
4. `node scripts/seed-planos.mjs --preencher-existentes` se houver empresas sem assinatura; `SUPORTE_EMAIL` definido.
5. Estender os trials em andamento com `admin-plano estender`, depois ligar `ASSINATURA_SUSPENSAO_ATIVA=true`.
6. Revisar os preços provisórios (R$ 99 e R$ 249) e os limites antes de cobrar de verdade.

## Fora desta fase

Histórico de cobranças, cancelamento pelo cliente, boleto e cartão, provider AbacatePay, checagem de papel nas rotas, atualização do cliente no Asaas quando o documento muda, restrição de cascade em `cobranca`.
