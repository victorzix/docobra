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
  it("por padrão gera a cobrança 10 dias antes do vencimento", () => {
    expect(ANTECEDENCIA_RENOVACAO_DIAS_PADRAO).toBe(10);
    expect(dataDeGeracaoDaRenovacao(VENCE_EM)).toEqual(emDias(-10));
  });

  it("aceita uma antecedência customizada", () => {
    expect(dataDeGeracaoDaRenovacao(VENCE_EM, 15)).toEqual(emDias(-15));
  });
});

describe("valorDaRenovacaoCentavos", () => {
  it("sem troca de plano, o total do ciclo é exatamente o preço", () => {
    expect(valorDaRenovacaoCentavos({ precoCentavos: 24900 })).toBe(24900);
  });
});
