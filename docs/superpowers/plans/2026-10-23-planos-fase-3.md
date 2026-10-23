# Planos e permissões — Fase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `src/core/billing/`, a biblioteca pura de cobrança: valor do upgrade com rateio, regra de quem pode fazer upgrade e datas de renovação.

**Architecture:** Duas funções-módulo puras (`upgrade.ts`, `renovacao.ts`) sem banco, sem gateway e sem efeitos colaterais, seguindo o padrão de camada de `src/core/llm/` (arquivos de código ao lado de `__tests__/`). O dinheiro é sempre inteiro em centavos e o arredondamento acontece uma única vez, em aritmética inteira.

**Tech Stack:** TypeScript, Vitest (testes puros; o `vitest.setup.ts` do projeto ainda exige o banco de teste configurado, mas estes testes não o usam).

Spec: `docs/superpowers/specs/2026-10-23-planos-fase-3-design.md`.

## Global Constraints

- Executar numa branch própria a partir da `main` (ex.: `feat/planos-fase-3`). **Nunca commitar na `main`, nunca dar push nem merge sem o Victor pedir.** Os commits dos passos "Commit" são na branch de feature e terminam com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (texto literal, como parágrafo final).
- Ciclo de 30 dias fixos (mensal) ou 360 (anual); diária = preço ÷ `ciclo_dias`; milissegundos por dia = `MS_POR_DIA` importado de `@/lib/permissoes/janela`.
- Upgrade = `(preço novo − preço antigo) × dias restantes ÷ ciclo_dias`, arredondado **uma única vez** para o centavo, meio para cima, em aritmética inteira.
- O dia da troca conta como plano novo: `diasRestantesNoCiclo` usa o teto da fração de dia e limita entre 0 e `cicloDias`.
- Troca por conta própria só para cima (`nivel` maior) e na mesma periodicidade. Ordem das recusas: `mesmo_plano`, `periodicidade_diferente`, `mesmo_nivel_ou_menor`; `ciclo_vencido` só depois da política.
- Funções puras: nada de banco, rede, `Date.now()` implícito nem variáveis de ambiente; o "agora" é sempre um parâmetro.
- Comentário só quando o PORQUÊ não é óbvio. Sem abstração além do que a tarefa pede. Nomes de domínio em português, imports com alias `@/`.
- Fora desta fase: tabelas `cobranca`/`evento_pagamento`, gateway, job de renovação, tela de planos.
- Nunca rodar duas execuções de teste ao mesmo tempo (o banco de teste é compartilhado pelo restante da suíte).
- O repositório pode ter outras alterações não commitadas que não são desta fase: nunca usar `git add -A`/`git add .`; adicionar sempre caminhos explícitos.

---

### Task 1: `upgrade.ts` — rateio e regra de upgrade

**Files:**
- Create: `src/core/billing/upgrade.ts`
- Test: `src/core/billing/__tests__/upgrade.test.ts`

**Interfaces:**
- Consumes: `MS_POR_DIA` de `@/lib/permissoes/janela`.
- Produces:
  - `interface PlanoCobravel { chave: string; nivel: number; cicloDias: number; precoCentavos: number }`
  - `type MotivoRecusaUpgrade = "mesmo_plano" | "periodicidade_diferente" | "mesmo_nivel_ou_menor"`
  - `diasRestantesNoCiclo(venceEm: Date, agora: Date, cicloDias: number): number`
  - `valorDoUpgradeCentavos(dados: { precoAtualCentavos: number; precoNovoCentavos: number; cicloDias: number; diasRestantes: number }): number`
  - `avaliarUpgrade(atual: PlanoCobravel, destino: PlanoCobravel): { permitido: true } | { permitido: false; motivo: MotivoRecusaUpgrade }`
  - `type SimulacaoUpgrade = { ok: true; valorCentavos: number; diasRestantes: number } | { ok: false; motivo: MotivoRecusaUpgrade | "ciclo_vencido" }`
  - `simularUpgrade(dados: { atual: PlanoCobravel; destino: PlanoCobravel; venceEm: Date; agora: Date }): SimulacaoUpgrade`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/core/billing/__tests__/upgrade.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MS_POR_DIA } from "@/lib/permissoes/janela";
import {
  avaliarUpgrade,
  diasRestantesNoCiclo,
  simularUpgrade,
  valorDoUpgradeCentavos,
  type PlanoCobravel,
} from "../upgrade";

const DIA_0 = new Date("2026-03-01T00:00:00Z");
const emDias = (dias: number) => new Date(DIA_0.getTime() + dias * MS_POR_DIA);

const BASICO: PlanoCobravel = { chave: "basico", nivel: 1, cicloDias: 30, precoCentavos: 3100 };
const PRO: PlanoCobravel = { chave: "pro", nivel: 2, cicloDias: 30, precoCentavos: 6200 };
const OUTRO_NIVEL_1: PlanoCobravel = { chave: "outro", nivel: 1, cicloDias: 30, precoCentavos: 4000 };
const ANUAL_1: PlanoCobravel = { chave: "anual-1", nivel: 1, cicloDias: 360, precoCentavos: 30000 };
const ANUAL_2: PlanoCobravel = { chave: "anual-2", nivel: 2, cicloDias: 360, precoCentavos: 60000 };

describe("valorDoUpgradeCentavos", () => {
  it("R$ 31 → R$ 62 no dia 15 de 30: R$ 15,50", () => {
    expect(
      valorDoUpgradeCentavos({ precoAtualCentavos: 3100, precoNovoCentavos: 6200, cicloDias: 30, diasRestantes: 15 }),
    ).toBe(1550);
  });

  it("no dia 0 cobra a diferença cheia", () => {
    expect(
      valorDoUpgradeCentavos({ precoAtualCentavos: 3100, precoNovoCentavos: 6200, cicloDias: 30, diasRestantes: 30 }),
    ).toBe(3100);
  });

  it("no último dia cobra 1/30 da diferença, arredondado", () => {
    expect(
      valorDoUpgradeCentavos({ precoAtualCentavos: 3100, precoNovoCentavos: 6200, cicloDias: 30, diasRestantes: 1 }),
    ).toBe(103);
  });

  it("anual: metade do ciclo cobra metade da diferença", () => {
    expect(
      valorDoUpgradeCentavos({ precoAtualCentavos: 30000, precoNovoCentavos: 60000, cicloDias: 360, diasRestantes: 180 }),
    ).toBe(15000);
  });

  it("arredonda o meio centavo para cima, uma única vez", () => {
    expect(
      valorDoUpgradeCentavos({ precoAtualCentavos: 0, precoNovoCentavos: 15, cicloDias: 30, diasRestantes: 1 }),
    ).toBe(1);
    expect(
      valorDoUpgradeCentavos({ precoAtualCentavos: 0, precoNovoCentavos: 14, cicloDias: 30, diasRestantes: 1 }),
    ).toBe(0);
  });

  it("sem dias restantes não cobra nada", () => {
    expect(
      valorDoUpgradeCentavos({ precoAtualCentavos: 3100, precoNovoCentavos: 6200, cicloDias: 30, diasRestantes: 0 }),
    ).toBe(0);
  });
});

describe("diasRestantesNoCiclo", () => {
  it("conta dias inteiros exatos", () => {
    expect(diasRestantesNoCiclo(emDias(30), emDias(15), 30)).toBe(15);
  });

  it("fração de dia conta como dia inteiro (o dia da troca é do plano novo)", () => {
    expect(diasRestantesNoCiclo(emDias(30), emDias(15.5), 30)).toBe(15);
    expect(diasRestantesNoCiclo(emDias(30), new Date(emDias(30).getTime() - 1), 30)).toBe(1);
  });

  it("no dia 0 devolve o ciclo inteiro", () => {
    expect(diasRestantesNoCiclo(emDias(30), DIA_0, 30)).toBe(30);
  });

  it("ciclo vencido devolve 0", () => {
    expect(diasRestantesNoCiclo(emDias(30), emDias(30), 30)).toBe(0);
    expect(diasRestantesNoCiclo(emDias(30), emDias(40), 30)).toBe(0);
  });

  it("nunca passa do tamanho do ciclo", () => {
    expect(diasRestantesNoCiclo(emDias(100), DIA_0, 30)).toBe(30);
  });
});

describe("avaliarUpgrade", () => {
  it("permite subir de nível na mesma periodicidade", () => {
    expect(avaliarUpgrade(BASICO, PRO)).toEqual({ permitido: true });
    expect(avaliarUpgrade(ANUAL_1, ANUAL_2)).toEqual({ permitido: true });
  });

  it("recusa o mesmo plano", () => {
    expect(avaliarUpgrade(BASICO, BASICO)).toEqual({ permitido: false, motivo: "mesmo_plano" });
  });

  it("recusa mudar de periodicidade (mensal ↔ anual é pelo suporte)", () => {
    expect(avaliarUpgrade(BASICO, ANUAL_2)).toEqual({ permitido: false, motivo: "periodicidade_diferente" });
    expect(avaliarUpgrade(ANUAL_1, PRO)).toEqual({ permitido: false, motivo: "periodicidade_diferente" });
  });

  it("recusa nível menor (downgrade é pelo suporte) e nível igual", () => {
    expect(avaliarUpgrade(PRO, BASICO)).toEqual({ permitido: false, motivo: "mesmo_nivel_ou_menor" });
    expect(avaliarUpgrade(BASICO, OUTRO_NIVEL_1)).toEqual({ permitido: false, motivo: "mesmo_nivel_ou_menor" });
  });
});

describe("simularUpgrade", () => {
  it("o exemplo de referência: dia 15 de 30 = R$ 15,50 e 15 dias restantes", () => {
    expect(simularUpgrade({ atual: BASICO, destino: PRO, venceEm: emDias(30), agora: emDias(15) })).toEqual({
      ok: true,
      valorCentavos: 1550,
      diasRestantes: 15,
    });
  });

  it("no dia 0 cobra a diferença cheia", () => {
    expect(simularUpgrade({ atual: BASICO, destino: PRO, venceEm: emDias(30), agora: DIA_0 })).toEqual({
      ok: true,
      valorCentavos: 3100,
      diasRestantes: 30,
    });
  });

  it("no último dia (restando uma hora) cobra 1 dia", () => {
    const agora = new Date(emDias(30).getTime() - 60 * 60 * 1000);

    expect(simularUpgrade({ atual: BASICO, destino: PRO, venceEm: emDias(30), agora })).toEqual({
      ok: true,
      valorCentavos: 103,
      diasRestantes: 1,
    });
  });

  it("anual: upgrade no meio do ciclo de 360 dias", () => {
    expect(simularUpgrade({ atual: ANUAL_1, destino: ANUAL_2, venceEm: emDias(360), agora: emDias(180) })).toEqual({
      ok: true,
      valorCentavos: 15000,
      diasRestantes: 180,
    });
  });

  it("repassa o motivo da política quando o upgrade não é permitido", () => {
    expect(simularUpgrade({ atual: PRO, destino: BASICO, venceEm: emDias(30), agora: emDias(15) })).toEqual({
      ok: false,
      motivo: "mesmo_nivel_ou_menor",
    });
  });

  it("ciclo vencido não permite upgrade", () => {
    expect(simularUpgrade({ atual: BASICO, destino: PRO, venceEm: emDias(30), agora: emDias(30) })).toEqual({
      ok: false,
      motivo: "ciclo_vencido",
    });
    expect(simularUpgrade({ atual: BASICO, destino: PRO, venceEm: emDias(30), agora: emDias(35) })).toEqual({
      ok: false,
      motivo: "ciclo_vencido",
    });
  });

  it("a política vem antes de ciclo vencido", () => {
    expect(simularUpgrade({ atual: BASICO, destino: ANUAL_2, venceEm: emDias(30), agora: emDias(35) })).toEqual({
      ok: false,
      motivo: "periodicidade_diferente",
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/core/billing/__tests__/upgrade.test.ts`
Expected: FAIL (`Failed to resolve import "../upgrade"`).

- [ ] **Step 3: Implementar**

Criar `src/core/billing/upgrade.ts`:

```ts
import { MS_POR_DIA } from "@/lib/permissoes/janela";

export interface PlanoCobravel {
  chave: string;
  nivel: number;
  cicloDias: number;
  precoCentavos: number;
}

export type MotivoRecusaUpgrade = "mesmo_plano" | "periodicidade_diferente" | "mesmo_nivel_ou_menor";

export type SimulacaoUpgrade =
  | { ok: true; valorCentavos: number; diasRestantes: number }
  | { ok: false; motivo: MotivoRecusaUpgrade | "ciclo_vencido" };

export function diasRestantesNoCiclo(venceEm: Date, agora: Date, cicloDias: number): number {
  const dias = Math.ceil((venceEm.getTime() - agora.getTime()) / MS_POR_DIA);
  return Math.min(cicloDias, Math.max(0, dias));
}

export function valorDoUpgradeCentavos({
  precoAtualCentavos,
  precoNovoCentavos,
  cicloDias,
  diasRestantes,
}: {
  precoAtualCentavos: number;
  precoNovoCentavos: number;
  cicloDias: number;
  diasRestantes: number;
}): number {
  const numerador = (precoNovoCentavos - precoAtualCentavos) * diasRestantes;
  // Meio centavo sobe, em aritmética inteira: dividir em ponto flutuante poderia errar o meio.
  return Math.floor((2 * numerador + cicloDias) / (2 * cicloDias));
}

export function avaliarUpgrade(
  atual: PlanoCobravel,
  destino: PlanoCobravel,
): { permitido: true } | { permitido: false; motivo: MotivoRecusaUpgrade } {
  if (atual.chave === destino.chave) return { permitido: false, motivo: "mesmo_plano" };
  if (atual.cicloDias !== destino.cicloDias) return { permitido: false, motivo: "periodicidade_diferente" };
  if (destino.nivel <= atual.nivel) return { permitido: false, motivo: "mesmo_nivel_ou_menor" };
  return { permitido: true };
}

export function simularUpgrade({
  atual,
  destino,
  venceEm,
  agora,
}: {
  atual: PlanoCobravel;
  destino: PlanoCobravel;
  venceEm: Date;
  agora: Date;
}): SimulacaoUpgrade {
  const avaliacao = avaliarUpgrade(atual, destino);
  if (!avaliacao.permitido) return { ok: false, motivo: avaliacao.motivo };
  if (agora.getTime() >= venceEm.getTime()) return { ok: false, motivo: "ciclo_vencido" };

  const diasRestantes = diasRestantesNoCiclo(venceEm, agora, atual.cicloDias);
  const valorCentavos = valorDoUpgradeCentavos({
    precoAtualCentavos: atual.precoCentavos,
    precoNovoCentavos: destino.precoCentavos,
    cicloDias: atual.cicloDias,
    diasRestantes,
  });

  return { ok: true, valorCentavos, diasRestantes };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/core/billing/__tests__/upgrade.test.ts`
Expected: PASS (todos os testes do arquivo).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/core/billing/upgrade.ts src/core/billing/__tests__/upgrade.test.ts
git commit -m "feat(planos): calculo de upgrade com rateio e regra de quem pode trocar de plano"
```

---

### Task 2: `renovacao.ts` — datas e valor da renovação

**Files:**
- Create: `src/core/billing/renovacao.ts`
- Test: `src/core/billing/__tests__/renovacao.test.ts`

**Interfaces:**
- Consumes: `MS_POR_DIA` de `@/lib/permissoes/janela`; `PlanoCobravel` de `../upgrade` (Task 1).
- Produces:
  - `ANTECEDENCIA_RENOVACAO_DIAS_PADRAO = 5`
  - `proximoVencimento(venceEm: Date, cicloDias: number): Date`
  - `dataDeGeracaoDaRenovacao(venceEm: Date, antecedenciaDias?: number): Date`
  - `valorDaRenovacaoCentavos(plano: Pick<PlanoCobravel, "precoCentavos">): number`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/core/billing/__tests__/renovacao.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MS_POR_DIA } from "@/lib/permissoes/janela";
import {
  ANTECEDENCIA_RENOVACAO_DIAS_PADRAO,
  dataDeGeracaoDaRenovacao,
  proximoVencimento,
  valorDaRenovacaoCentavos,
} from "../renovacao";

const VENCE_EM = new Date("2026-03-31T00:00:00Z");
const emDias = (dias: number) => new Date(VENCE_EM.getTime() + dias * MS_POR_DIA);

describe("proximoVencimento", () => {
  it("mensal soma 30 dias", () => {
    expect(proximoVencimento(VENCE_EM, 30)).toEqual(emDias(30));
  });

  it("anual soma 360 dias", () => {
    expect(proximoVencimento(VENCE_EM, 360)).toEqual(emDias(360));
  });
});

describe("dataDeGeracaoDaRenovacao", () => {
  it("por padrão gera a cobrança 5 dias antes do vencimento", () => {
    expect(ANTECEDENCIA_RENOVACAO_DIAS_PADRAO).toBe(5);
    expect(dataDeGeracaoDaRenovacao(VENCE_EM)).toEqual(emDias(-5));
  });

  it("aceita uma antecedência customizada", () => {
    expect(dataDeGeracaoDaRenovacao(VENCE_EM, 10)).toEqual(emDias(-10));
  });
});

describe("valorDaRenovacaoCentavos", () => {
  it("sem troca de plano, o total do ciclo é exatamente o preço", () => {
    expect(valorDaRenovacaoCentavos({ precoCentavos: 24900 })).toBe(24900);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/core/billing/__tests__/renovacao.test.ts`
Expected: FAIL (`Failed to resolve import "../renovacao"`).

- [ ] **Step 3: Implementar**

Criar `src/core/billing/renovacao.ts`:

```ts
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import type { PlanoCobravel } from "./upgrade";

export const ANTECEDENCIA_RENOVACAO_DIAS_PADRAO = 5;

export function proximoVencimento(venceEm: Date, cicloDias: number): Date {
  return new Date(venceEm.getTime() + cicloDias * MS_POR_DIA);
}

export function dataDeGeracaoDaRenovacao(
  venceEm: Date,
  antecedenciaDias: number = ANTECEDENCIA_RENOVACAO_DIAS_PADRAO,
): Date {
  return new Date(venceEm.getTime() - antecedenciaDias * MS_POR_DIA);
}

export function valorDaRenovacaoCentavos(plano: Pick<PlanoCobravel, "precoCentavos">): number {
  return plano.precoCentavos;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/core/billing`
Expected: PASS (os dois arquivos de teste).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/core/billing/renovacao.ts src/core/billing/__tests__/renovacao.test.ts
git commit -m "feat(planos): datas e valor da renovacao do ciclo"
```
