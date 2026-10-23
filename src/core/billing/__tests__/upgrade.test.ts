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
const MAIS_BARATO: PlanoCobravel = { chave: "mais-barato", nivel: 3, cicloDias: 30, precoCentavos: 5000 };
const MESMO_PRECO: PlanoCobravel = { chave: "mesmo-preco", nivel: 3, cicloDias: 30, precoCentavos: 6200 };

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

  it("recusa nível maior com preço menor ou igual", () => {
    expect(avaliarUpgrade(PRO, MAIS_BARATO)).toEqual({ permitido: false, motivo: "preco_nao_maior" });
    expect(avaliarUpgrade(PRO, MESMO_PRECO)).toEqual({ permitido: false, motivo: "preco_nao_maior" });
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

  it("recusa upgrade de nível maior e preço menor, em vez de devolver valor negativo", () => {
    expect(simularUpgrade({ atual: PRO, destino: MAIS_BARATO, venceEm: emDias(30), agora: emDias(15) })).toEqual({
      ok: false,
      motivo: "preco_nao_maior",
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
