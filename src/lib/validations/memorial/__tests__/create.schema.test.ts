import { describe, expect, it } from "vitest";

import { criarMemorialSchema } from "../create.schema";

const BASE = {
  projetoId: "11111111-1111-1111-1111-111111111111",
  tipoConstrucao: "residencial",
};

describe("criarMemorialSchema", () => {
  it("aceita modo texto com especificações opcionais", () => {
    const resultado = criarMemorialSchema.safeParse({
      ...BASE,
      modoEspecificacoes: "texto",
      especificacoes: { fundacaoEstrutura: "Radier" },
    });

    expect(resultado.success).toBe(true);
  });

  it("aceita modo texto sem nenhuma especificação (todas opcionais)", () => {
    const resultado = criarMemorialSchema.safeParse({ ...BASE, modoEspecificacoes: "texto" });

    expect(resultado.success).toBe(true);
  });

  it("aceita modo áudio com audioBase64 e audioMimeType", () => {
    const resultado = criarMemorialSchema.safeParse({
      ...BASE,
      modoEspecificacoes: "audio",
      audioBase64: "ZmFrZS1hdWRpbw==",
      audioMimeType: "audio/webm",
    });

    expect(resultado.success).toBe(true);
  });

  it("rejeita modo áudio sem audioBase64", () => {
    const resultado = criarMemorialSchema.safeParse({
      ...BASE,
      modoEspecificacoes: "audio",
      audioMimeType: "audio/webm",
    });

    expect(resultado.success).toBe(false);
  });

  it("rejeita sem tipoConstrucao", () => {
    const resultado = criarMemorialSchema.safeParse({
      projetoId: BASE.projetoId,
      modoEspecificacoes: "texto",
    });

    expect(resultado.success).toBe(false);
  });

  it("rejeita numeroPavimentos negativo", () => {
    const resultado = criarMemorialSchema.safeParse({
      ...BASE,
      modoEspecificacoes: "texto",
      numeroPavimentos: -1,
    });

    expect(resultado.success).toBe(false);
  });

  it("rejeita modoEspecificacoes desconhecido", () => {
    const resultado = criarMemorialSchema.safeParse({ ...BASE, modoEspecificacoes: "video" });

    expect(resultado.success).toBe(false);
  });
});
