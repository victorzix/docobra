import { describe, expect, it } from "vitest";

import { formatarData, formatarReais, rotuloDoCiclo } from "../formatar";

describe("formatar", () => {
  it("formatarReais usa vírgula decimal e o símbolo", () => {
    expect(formatarReais(9900).replace(/ /g, " ")).toBe("R$ 99,00");
    expect(formatarReais(1550).replace(/ /g, " ")).toBe("R$ 15,50");
    expect(formatarReais(500).replace(/ /g, " ")).toBe("R$ 5,00");
  });

  it("formatarData respeita o fuso de São Paulo", () => {
    expect(formatarData("2026-06-15T02:00:00Z")).toBe("14/06/2026");
    expect(formatarData("2026-06-15T12:00:00Z")).toBe("15/06/2026");
  });

  it("rotuloDoCiclo", () => {
    expect(rotuloDoCiclo(30)).toBe("mês");
    expect(rotuloDoCiclo(360)).toBe("ano");
    expect(rotuloDoCiclo(14)).toBe("14 dias");
  });
});
