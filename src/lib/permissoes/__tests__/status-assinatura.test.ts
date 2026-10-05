import { describe, expect, it } from "vitest";

import { MS_POR_DIA } from "../janela";
import { derivarStatus } from "../status-assinatura";

const VENCE_EM = new Date("2026-03-31T00:00:00Z");
const apos = (dias: number) => new Date(VENCE_EM.getTime() + dias * MS_POR_DIA);

describe("derivarStatus", () => {
  it("antes do vencimento mantém o status gravado", () => {
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(-1))).toBe("ativa");
    expect(derivarStatus({ status: "trial", venceEm: VENCE_EM }, apos(-1))).toBe("trial");
    expect(derivarStatus({ status: "cancelada", venceEm: VENCE_EM }, apos(-1))).toBe("cancelada");
  });

  it("assinatura ativa vencida entra em carência", () => {
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(0))).toBe("carencia");
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(4))).toBe("carencia");
  });

  it("passada a carência de 5 dias vira suspensa", () => {
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(5))).toBe("suspensa");
  });

  it("respeita uma carência customizada", () => {
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(0), 0)).toBe("suspensa");
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(9), 10)).toBe("carencia");
  });

  it("trial vencido não tem carência", () => {
    expect(derivarStatus({ status: "trial", venceEm: VENCE_EM }, apos(0))).toBe("suspensa");
  });

  it("cancelada vencida vira suspensa", () => {
    expect(derivarStatus({ status: "cancelada", venceEm: VENCE_EM }, apos(0))).toBe("suspensa");
  });
});
