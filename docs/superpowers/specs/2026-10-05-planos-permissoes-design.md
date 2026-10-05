# Planos e permissões — design

Data: 2026-10-05. Status: aprovado em brainstorm, aguardando plano de implementação.

## Objetivo

Hoje "plano" é só texto na landing (Essencial / Escritório); o campo `empresa.plano`
não é lido por nada. Este design cria um **catálogo de permissões** ao qual os
planos são ligados, com limites numéricos em janelas de tempo, consumo por evento,
assinatura com rateio de upgrade e uma camada de pagamento com strategy.

Fora de escopo: papéis de usuário (o TODO do `papel` continua aberto — o catálogo é
desenhado para depois aceitar `papel_permissao` sem mudar o que existe), débito
automático em cartão, reembolso automático, escolha do gateway.

## Decisões fechadas

| Tema | Decisão |
| --- | --- |
| Tipo de permissão | Booleana ou limite numérico; sobrescrevível por empresa |
| Janela de limite | Em dias, definida no **vínculo** (plano ou empresa), não na permissão |
| Âncora da janela | Uma só: o dia 0 (início da assinatura); a janela se repete a cada `janela_dias` |
| Sobrescrita da empresa | Tem `inicio` próprio (padrão: dia da concessão) e vence o plano |
| Troca de plano | Mantém dia 0 e consumo; limite do plano novo vale na hora |
| Ciclo | 30 dias fixos (mensal) ou 360 (anual); diária = preço ÷ `ciclo_dias` |
| Cobrança | Pré-paga; upgrade cobra a diferença na hora |
| Troca por conta própria | Só upgrade, na mesma periodicidade; "upgrade" = `nivel` maior |
| Downgrade / mensal↔anual | Só pelo suporte, a partir da próxima renovação, sem crédito |
| Limite estourado | Bloqueia antes de chamar a IA e oferece upgrade |
| Inadimplência | Carência (padrão 5 dias), depois leitura limitada |
| Leitura limitada | Lista sem conteúdo: não abre, não baixa, não gera |
| Cadastro novo | Trial por tempo limitado (plano interno, preço zero) |

## 1. Modelo de dados (`db/schema/<entidade>.ts`, um arquivo por entidade)

**Catálogo e vínculos**

- `permissao`: `chave` única (`memorial.gerar`, `comunique-se.processar`,
  `memorial.audio`, `projetos.criar`, `acervo.abrir`, `acervo.baixar`), `tipo`
  (`booleana` | `limite`), `descricao`.
- `plano`: `chave`, `nome`, `nivel`, `ciclo_dias` (30 | 360), `preco_centavos`,
  `ativo`, `interno`. Internos (`trial`, `suspenso`) não aparecem na landing. O
  `ciclo_dias` dos planos públicos é 30 ou 360; o `trial` usa a duração própria (ex.:
  14 dias), preço zero, e ao acabar sem assinatura a empresa cai no `suspenso`.
- `plano_permissao`: plano, permissão, `valor`, `janela_dias`. Booleana não tem
  valor nem janela.
- `empresa_permissao`: empresa, permissão, `valor`, `janela_dias`, `inicio`,
  `expira_em?`, `motivo`.

**Assinatura e cobrança**

- `assinatura`: empresa, `inicio` (dia 0), `status` (`trial` | `ativa` | `carencia` |
  `suspensa` | `cancelada`), vencimento do ciclo atual.
- `assinatura_trecho`: assinatura, plano, `inicio`, `fim?` (nulo = vigente), `origem`
  (`autoatendimento` | `suporte`).
- `cobranca`: assinatura, `tipo` (`ciclo` | `upgrade`), `valor_centavos`, status,
  vencimento, `provider`, `provider_charge_id`.
- `evento_pagamento`: `provider` + `event_id` único, payload — idempotência de webhook.

**Consumo**

- `consumo`: empresa, permissão, quantidade, `ocorrido_em`, referência ao item
  gerado (única por permissão, para não contar retry duas vezes). O usado é a soma
  das linhas dentro da janela atual.

**Janela atual:** `inicio_janela = ancora + floor((agora − ancora) / janela_dias) × janela_dias`.
Âncora = início da assinatura (permissão vinda do plano) ou `empresa_permissao.inicio`.

**`verificarPermissao(empresa, chave)`** devolve `{ permitido, usado, restante,
janela: { inicio, fim } }`. Ordem: sobrescrita ativa da empresa → plano do trecho
vigente. Se o status derivado é `suspensa` ou `cancelada`, o plano efetivo é o
`suspenso`, sem `if` espalhado pelo app.

**Status derivado:** `ativa` / `carencia` / `suspensa` é calculado do vencimento e
da data de agora, não gravado por job.

## 2. Billing e pagamento

**`core/billing/`** — funções puras, sem banco nem gateway.

- Upgrade: `round((preco_novo − preco_antigo) × dias_restantes / ciclo_dias)`,
  arredondado uma única vez (meio para cima). O dia da troca conta como plano novo.
  Exemplo: R$ 31 → R$ 62 no dia 15 de 30 → `(6200 − 3100) × 15 / 30` = R$ 15,50.
- Renovação: a cobrança do próximo ciclo é gerada com antecedência (padrão 5 dias,
  configurável) e vence no fim do ciclo atual. Paga abre o ciclo; não paga entra em
  carência (padrão 5 dias, configurável) e depois `suspensa`.
- Downgrade e mensal↔anual: pelo suporte, a partir da próxima renovação, sem crédito.
- Cancelamento: vale até o fim do ciclo pago; depois `cancelada` (plano `suspenso`).

**`core/payments/`** (mesma ideia de `core/llm/`)

```text
core/payments/
  types.ts    -> interface PaymentProvider (criarCobranca, cancelarCobranca, lerWebhook)
  <gateway>.ts
  router.ts   -> PaymentRouter
```

- `lerWebhook` devolve evento normalizado (`paga` | `falhou` | `cancelada`) com ID de
  evento estável e verifica a assinatura do webhook.
- Sem assinatura recorrente nativa: só cobrança avulsa de valor livre; o ciclo é nosso.
- **Fallback só em recusa definitiva** (4xx, ou indisponível antes de aceitar). Em
  timeout/erro de rede não troca de gateway: repete no mesmo com a mesma chave de
  idempotência, pois a cobrança pode ter sido criada.
- Cada `cobranca` guarda seu `provider`; webhooks chegam em
  `/api/webhooks/pagamentos/[provider]`.
- Requisitos do gateway: cobrança avulsa de valor livre via API, Pix e boleto, webhook
  com ID de evento estável, de preferência chave de idempotência.

## 3. Aplicação no app

- Checagem sempre no servidor (API routes / server actions).
- `memorial.gerar` e `comunique-se.processar`: checa antes de chamar a IA; registra o
  consumo só no sucesso, com o ID do item como referência. Comunique-se criado à mão
  ou reimportado do modelo exportado não gasta IA e não consome.
- Interface: hook React Query (`["permissoes"]`) mostra o uso e o bloqueio com atalho
  de upgrade. Sem Zustand.
- Corrida: duas requisições simultâneas podem passar do limite por 1; aceito no MVP.

## 4. Fases de entrega

1. **Schema, seed e `verificarPermissao`** — tabelas, catálogo, planos (`trial`,
   `suspenso`, `essencial`, `escritorio`, valores provisórios), consumo, cálculo de
   janela. Sem pagamento. Empresas existentes ganham assinatura inicial.
2. **Aplicar nos pontos de uso** — bloqueio, mensagens, barra de uso, ajuste manual de
   plano pelo suporte.
3. **Billing** — `core/billing/`, trechos de assinatura, cálculo de upgrade, sem cobrar.
4. **Pagamento** — gateway escolhido, `core/payments/`, cobranças, webhooks, job de
   renovação, landing com planos reais.

Parar depois da Fase 2 para validar o limite; pagamento entra quando houver quem pague.

## 5. Testes (Vitest)

- Janela: virada exata, empresa assinando no dia 0, janela de 360 dias, sobrescrita com
  início próprio.
- Resolução: sobrescrita vence plano, `suspensa` resolve pelo `suspenso`, booleana,
  limite estourado.
- Billing: R$ 31 → R$ 62, upgrade no dia 0 e no último dia, anual, arredondamento.
- Pagamento: fallback só em recusa definitiva, timeout sem trocar de gateway, webhook
  duplicado ignorado.

## Valores provisórios (definir antes de publicar)

Preços, limite de documentos por plano, duração do trial e tamanho das janelas. O
desenho não depende deles.
