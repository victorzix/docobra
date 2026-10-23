import { describe, expect, it } from "vitest";

import { centavosParaReais, dataIso } from "../formatos";

describe("centavosParaReais", () => {
  it("converte centavos em reais decimais sem erro de ponto flutuante", () => {
    expect(centavosParaReais(9900)).toBe(99);
    expect(centavosParaReais(10090)).toBe(100.9);
    expect(centavosParaReais(1550)).toBe(15.5);
    expect(centavosParaReais(5)).toBe(0.05);
    expect(centavosParaReais(0)).toBe(0);
    expect(centavosParaReais(1)).toBe(0.01);
  });
});

describe("dataIso", () => {
  it("formata AAAA-MM-DD no fuso de São Paulo", () => {
    expect(dataIso(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06-15");
  });

  it("não adianta nem atrasa o dia por causa do fuso (02:00Z ainda é o dia anterior em SP)", () => {
    expect(dataIso(new Date("2026-06-15T02:00:00Z"))).toBe("2026-06-14");
    expect(dataIso(new Date("2026-06-15T03:00:00Z"))).toBe("2026-06-15");
  });
});
