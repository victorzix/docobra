import { describe, expect, it } from "vitest";

import { descreverAssinatura } from "../descrever-assinatura";

const base = { planoNome: "Essencial", ehTrial: false, venceEm: "2026-06-20T12:00:00Z", diasRestantes: 5 };

describe("descreverAssinatura", () => {
  it("trial: título de teste gratuito, dias restantes e data do fim", () => {
    expect(
      descreverAssinatura({ ...base, planoNome: "Trial", ehTrial: true, status: "trial", diasRestantes: 9 }),
    ).toEqual({
      titulo: "Teste gratuito",
      selo: "Em teste",
      detalhe: "9 dias restantes · termina em 20/06/2026",
      tom: "normal",
    });
    expect(descreverAssinatura({ ...base, ehTrial: true, status: "trial", diasRestantes: 1 }).detalhe).toMatch(
      /^1 dia restante/,
    );
  });

  it("ativa: nome do plano e data da renovação", () => {
    expect(descreverAssinatura({ ...base, status: "ativa" })).toEqual({
      titulo: "Plano Essencial",
      selo: "Ativo",
      detalhe: "Renova em 20/06/2026 (5 dias)",
      tom: "normal",
    });
  });

  it("carência: alerta com o fim do prazo (vencimento + 5 dias)", () => {
    expect(descreverAssinatura({ ...base, status: "carencia", diasRestantes: 0 })).toEqual({
      titulo: "Plano Essencial",
      selo: "Pagamento em atraso",
      detalhe: "Regularize até 25/06/2026 para não perder o acesso",
      tom: "alerta",
    });
  });

  it("suspensa: diferencia teste encerrado de plano pago vencido", () => {
    expect(descreverAssinatura({ ...base, ehTrial: true, status: "suspensa", diasRestantes: 0 })).toEqual({
      titulo: "Teste gratuito",
      selo: "Teste encerrado",
      detalhe: "O teste terminou em 20/06/2026. Escolha um plano para continuar.",
      tom: "erro",
    });
    expect(descreverAssinatura({ ...base, status: "suspensa", diasRestantes: 0 })).toMatchObject({
      selo: "Suspenso",
      tom: "erro",
    });
  });

  it("cancelada: acesso até o vencimento", () => {
    expect(descreverAssinatura({ ...base, status: "cancelada" })).toEqual({
      titulo: "Plano Essencial",
      selo: "Cancelado",
      detalhe: "Acesso até 20/06/2026",
      tom: "alerta",
    });
  });
});
