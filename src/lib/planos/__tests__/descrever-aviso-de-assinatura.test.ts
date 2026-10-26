import { describe, expect, it } from "vitest";

import { descreverAvisoDeAssinatura } from "../descrever-aviso-de-assinatura";

const base = { venceEm: "2026-06-20T12:00:00Z", diasRestantes: 5 };

describe("descreverAvisoDeAssinatura", () => {
  it("ativa dentro da janela de renovação: avisa o vencimento e chama para renovar", () => {
    expect(descreverAvisoDeAssinatura({ ...base, status: "ativa" })).toEqual({
      tom: "normal",
      texto: "Sua assinatura vence em 5 dias (20/06/2026).",
      acao: "Renovar",
    });
  });

  it("usa o singular com 1 dia", () => {
    expect(descreverAvisoDeAssinatura({ ...base, diasRestantes: 1, status: "ativa" })?.texto).toBe(
      "Sua assinatura vence em 1 dia (20/06/2026).",
    );
  });

  it("ativa com exatamente 10 dias: ainda avisa (borda da janela)", () => {
    expect(descreverAvisoDeAssinatura({ ...base, diasRestantes: 10, status: "ativa" })).toEqual({
      tom: "normal",
      texto: "Sua assinatura vence em 10 dias (20/06/2026).",
      acao: "Renovar",
    });
  });

  it("ativa fora da janela: sem aviso", () => {
    expect(descreverAvisoDeAssinatura({ ...base, diasRestantes: 11, status: "ativa" })).toBeNull();
  });

  it("carência: alerta com o fim do prazo (vencimento + 5 dias)", () => {
    expect(descreverAvisoDeAssinatura({ ...base, diasRestantes: 0, status: "carencia" })).toEqual({
      tom: "alerta",
      texto: "Pagamento em atraso: regularize até 25/06/2026 para não perder o acesso.",
      acao: "Regularizar",
    });
  });

  it("cancelada com acesso: avisa até quando e oferece reativar", () => {
    expect(descreverAvisoDeAssinatura({ ...base, status: "cancelada" })).toEqual({
      tom: "alerta",
      texto: "Assinatura cancelada: você tem acesso até 20/06/2026.",
      acao: "Reativar",
    });
  });

  it.each(["trial", "suspensa"] as const)("%s: sem aviso", (status) => {
    expect(descreverAvisoDeAssinatura({ ...base, status })).toBeNull();
  });
});
