import { describe, expect, it } from "vitest";

import { alternarItemChecklistSchema } from "../toggle-item.schema";

describe("alternarItemChecklistSchema", () => {
  it("aceita itemId e concluida boolean", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc", concluida: true });

    expect(resultado.success).toBe(true);
  });

  it("aceita itemId e descricao", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc", descricao: "Texto corrigido" });

    expect(resultado.success).toBe(true);
  });

  it("aceita itemId com os dois campos ao mesmo tempo", () => {
    const resultado = alternarItemChecklistSchema.safeParse({
      itemId: "abc",
      concluida: true,
      descricao: "Texto corrigido",
    });

    expect(resultado.success).toBe(true);
  });

  it("rejeita concluida que não é boolean", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc", concluida: "sim" });

    expect(resultado.success).toBe(false);
  });

  it("rejeita itemId vazio", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "", concluida: true });

    expect(resultado.success).toBe(false);
  });

  it("rejeita quando nem concluida nem descricao vieram preenchidos", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc" });

    expect(resultado.success).toBe(false);
  });

  it("rejeita descricao vazia", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc", descricao: "" });

    expect(resultado.success).toBe(false);
  });
});
