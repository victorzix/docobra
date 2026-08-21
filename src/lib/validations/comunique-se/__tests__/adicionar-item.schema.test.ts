import { describe, expect, it } from "vitest";

import { adicionarItemChecklistSchema } from "../adicionar-item.schema";

describe("adicionarItemChecklistSchema", () => {
  it("aceita descricao não vazia", () => {
    const resultado = adicionarItemChecklistSchema.safeParse({ descricao: "Apresentar ART" });

    expect(resultado.success).toBe(true);
  });

  it("rejeita descricao vazia", () => {
    const resultado = adicionarItemChecklistSchema.safeParse({ descricao: "" });

    expect(resultado.success).toBe(false);
  });

  it("rejeita corpo sem descricao", () => {
    const resultado = adicionarItemChecklistSchema.safeParse({});

    expect(resultado.success).toBe(false);
  });
});
