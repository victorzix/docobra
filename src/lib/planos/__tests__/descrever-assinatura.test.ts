import { describe, expect, it } from "vitest";

import { descreverAssinatura } from "../descrever-assinatura";

const base = { planoNome: "Essencial", venceEm: "2026-06-20T12:00:00Z", diasRestantes: 5 };

describe("descreverAssinatura", () => {
  it("trial: mostra os dias restantes do teste", () => {
    expect(descreverAssinatura({ ...base, planoNome: "Trial", status: "trial", diasRestantes: 9 })).toEqual({
      titulo: "Período de teste",
      detalhe: "9 dias restantes",
      tom: "normal",
    });
    expect(descreverAssinatura({ ...base, status: "trial", diasRestantes: 1 }).detalhe).toBe("1 dia restante");
  });

  it("ativa: nome do plano e data da renovação", () => {
    expect(descreverAssinatura({ ...base, status: "ativa" })).toEqual({
      titulo: "Plano Essencial",
      detalhe: "Renova em 20/06/2026 (5 dias)",
      tom: "normal",
    });
  });

  it("carência: alerta com o fim do prazo (vencimento + 5 dias)", () => {
    expect(descreverAssinatura({ ...base, status: "carencia", diasRestantes: 0 })).toEqual({
      titulo: "Plano Essencial",
      detalhe: "Pagamento em atraso: regularize até 25/06/2026 para não perder o acesso",
      tom: "alerta",
    });
  });

  it("suspensa: erro com o chamado para assinar", () => {
    expect(descreverAssinatura({ ...base, status: "suspensa", diasRestantes: 0 })).toEqual({
      titulo: "Acesso limitado",
      detalhe: "Assine um plano para voltar a gerar documentos.",
      tom: "erro",
    });
  });

  it("cancelada: acesso até o vencimento", () => {
    expect(descreverAssinatura({ ...base, status: "cancelada" })).toEqual({
      titulo: "Plano Essencial (cancelado)",
      detalhe: "Acesso até 20/06/2026",
      tom: "alerta",
    });
  });
});
