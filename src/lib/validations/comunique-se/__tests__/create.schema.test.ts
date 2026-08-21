import { describe, expect, it } from "vitest";

import { criarComuniqueSeSchema } from "../create.schema";

const PROJETO_ID = "11111111-1111-4111-8111-111111111111";

describe("criarComuniqueSeSchema (modoCriacao: pdf)", () => {
  it("aceita projetoId válido e pdfBase64 não vazio", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      modoCriacao: "pdf",
      projetoId: PROJETO_ID,
      pdfBase64: "JVBERi0=",
    });

    expect(resultado.success).toBe(true);
  });

  it("rejeita projetoId que não é uuid", () => {
    const resultado = criarComuniqueSeSchema.safeParse({ modoCriacao: "pdf", projetoId: "abc", pdfBase64: "JVBERi0=" });

    expect(resultado.success).toBe(false);
  });

  it("rejeita pdfBase64 vazio", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      modoCriacao: "pdf",
      projetoId: PROJETO_ID,
      pdfBase64: "",
    });

    expect(resultado.success).toBe(false);
  });
});

describe("criarComuniqueSeSchema (modoCriacao: manual)", () => {
  it("aceita projetoId válido e ao menos um item", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      modoCriacao: "manual",
      projetoId: PROJETO_ID,
      itens: [{ descricao: "Apresentar ART" }],
    });

    expect(resultado.success).toBe(true);
  });

  it("rejeita lista de itens vazia", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      modoCriacao: "manual",
      projetoId: PROJETO_ID,
      itens: [],
    });

    expect(resultado.success).toBe(false);
  });

  it("rejeita item com descricao vazia", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      modoCriacao: "manual",
      projetoId: PROJETO_ID,
      itens: [{ descricao: "" }],
    });

    expect(resultado.success).toBe(false);
  });
});

describe("criarComuniqueSeSchema (modoCriacao desconhecido)", () => {
  it("rejeita modoCriacao que não é pdf nem manual", () => {
    const resultado = criarComuniqueSeSchema.safeParse({ modoCriacao: "video", projetoId: PROJETO_ID });

    expect(resultado.success).toBe(false);
  });
});
