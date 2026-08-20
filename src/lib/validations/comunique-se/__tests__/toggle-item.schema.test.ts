import { describe, expect, it } from "vitest";

import { alternarItemChecklistSchema } from "../toggle-item.schema";

describe("alternarItemChecklistSchema", () => {
  it("aceita itemId e concluida boolean", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc", concluida: true });

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
});
