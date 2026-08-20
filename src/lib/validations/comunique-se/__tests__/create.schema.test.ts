import { describe, expect, it } from "vitest";

import { criarComuniqueSeSchema } from "../create.schema";

describe("criarComuniqueSeSchema", () => {
  it("aceita projetoId válido e pdfBase64 não vazio", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      projetoId: "11111111-1111-4111-8111-111111111111",
      pdfBase64: "JVBERi0=",
    });

    expect(resultado.success).toBe(true);
  });

  it("rejeita projetoId que não é uuid", () => {
    const resultado = criarComuniqueSeSchema.safeParse({ projetoId: "abc", pdfBase64: "JVBERi0=" });

    expect(resultado.success).toBe(false);
  });

  it("rejeita pdfBase64 vazio", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      projetoId: "11111111-1111-1111-1111-111111111111",
      pdfBase64: "",
    });

    expect(resultado.success).toBe(false);
  });
});
