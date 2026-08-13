import { describe, expect, it } from "vitest";

import { gerarPdf } from "../pdf";

describe("gerarPdf", () => {
  it("produz um buffer PDF válido a partir de HTML simples", async () => {
    const pdf = await gerarPdf("<h1>Teste</h1>");

    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
