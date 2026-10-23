# Planos e permissões — Fase 3 (biblioteca de cobrança) — design

Data: 2026-10-23. Status: aprovado em brainstorm, aguardando plano de implementação.
Base: `docs/superpowers/specs/2026-10-05-planos-permissoes-design.md` (seção 2, "Billing e pagamento") e a Fase 2 já na `main`.

## Objetivo

Travar, em funções puras e testadas, as regras de dinheiro já decididas, antes de qualquer
gateway existir: quanto custa um upgrade no meio do ciclo, quem pode fazê-lo e quando gerar a
cobrança de renovação. A Fase 4 só liga um gateway nessas funções.

Fora desta fase: tabelas `cobranca` e `evento_pagamento`, qualquer chamada a gateway, job de
renovação, tela de planos. Nada aqui lê ou escreve no banco.

## Regras (já decididas na Fase 1)

- Ciclo de 30 dias fixos (mensal) ou 360 (anual); diária = preço ÷ `ciclo_dias`.
- Cobrança pré-paga: o upgrade cobra a diferença na hora, `(preço novo − preço antigo) × dias
  restantes ÷ ciclo_dias`, **arredondada uma única vez** para o centavo (meio para cima). O
  dia da troca já conta como plano novo.
- Exemplo de referência: R$ 31 → R$ 62 no dia 15 de um ciclo de 30 dias = `(6200 − 3100) × 15 ÷ 30`
  = R$ 15,50.
- Troca por conta própria só para cima (`nivel` maior) e na mesma periodicidade. Downgrade e
  mensal↔anual só pelo suporte.
- O destino precisa custar mais que o plano atual; um plano de nível maior porém mais barato é
  recusado (`preco_nao_maior`), para nunca gerar valor de upgrade negativo ou zero.
- A cobrança do ciclo seguinte é gerada com antecedência (padrão 5 dias) e vence no fim do
  ciclo atual. Sem troca de plano, o total do ciclo é exatamente o preço.

## Módulo `src/core/billing/`

Mesmo padrão de `src/core/llm/`: um diretório por camada, testes em `__tests__/` ao lado.
Reaproveita `MS_POR_DIA` de `@/lib/permissoes/janela`.

**`upgrade.ts`**

- `interface PlanoCobravel { chave: string; nivel: number; cicloDias: number; precoCentavos: number }`
- `type MotivoRecusaUpgrade = "mesmo_plano" | "periodicidade_diferente" | "mesmo_nivel_ou_menor" | "preco_nao_maior"`
- `diasRestantesNoCiclo(venceEm: Date, agora: Date, cicloDias: number): number` — teto de
  `(venceEm − agora) ÷ 1 dia`, limitado entre 0 e `cicloDias`.
- `valorDoUpgradeCentavos({ precoAtualCentavos, precoNovoCentavos, cicloDias, diasRestantes }): number`
  — aritmética inteira, meio para cima, sem depender de ponto flutuante.
- `avaliarUpgrade(atual, destino): { permitido: true } | { permitido: false; motivo: MotivoRecusaUpgrade }`
  — ordem das checagens: mesmo plano, periodicidade, nível, preço.
- `simularUpgrade({ atual, destino, venceEm, agora }): SimulacaoUpgrade` com
  `SimulacaoUpgrade = { ok: true; valorCentavos: number; diasRestantes: number } | { ok: false; motivo: MotivoRecusaUpgrade | "ciclo_vencido" }`.
  A política (`avaliarUpgrade`) vem antes de `ciclo_vencido`; ciclo vencido (`agora ≥ venceEm`)
  não permite upgrade: quem está em carência renova antes de trocar de plano.

**`renovacao.ts`**

- `ANTECEDENCIA_RENOVACAO_DIAS_PADRAO = 5`
- `proximoVencimento(venceEm: Date, cicloDias: number): Date`
- `dataDeGeracaoDaRenovacao(venceEm: Date, antecedenciaDias?: number): Date`
- `valorDaRenovacaoCentavos(plano: Pick<PlanoCobravel, "precoCentavos">): number` — o preço cheio.

## Testes (Vitest, sem banco)

- Upgrade: o exemplo de referência (3100 → 6200, dia 15 de 30 = 1550), dia 0 (diferença cheia),
  último dia, anual de 360, meios arredondados para cima, cada motivo de recusa, a ordem
  política antes de ciclo vencido, e o ciclo vencido.
- Dias restantes: exato, fração arredondada para cima, praticamente zero, vencido, limitado ao ciclo.
- Renovação: próximo vencimento mensal e anual, geração com antecedência padrão e customizada,
  valor da renovação.
