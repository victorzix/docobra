import { describe, expect, it } from "vitest";

import { resolverOrdem } from "../config";
import type { LLMProvider, StructuredExtractionResult } from "../types";

function providerFake(nome: string): LLMProvider {
  return {
    name: nome,
    extractStructured: async <T = unknown>(): Promise<StructuredExtractionResult<T>> => ({
      data: {} as T,
      provider: nome,
      raw: {},
    }),
  };
}

describe("resolverOrdem", () => {
  const gemini = providerFake("gemini");
  const claude = providerFake("claude");
  const providersDisponiveis = { gemini, claude };

  it("usa a ordem default gemini,claude quando a env var está ausente", () => {
    const ordem = resolverOrdem(undefined, providersDisponiveis);
    expect(ordem).toEqual([gemini, claude]);
  });

  it("usa a ordem default gemini,claude quando a env var está vazia", () => {
    const ordem = resolverOrdem("", providersDisponiveis);
    expect(ordem).toEqual([gemini, claude]);
  });

  it("respeita a ordem customizada da env var", () => {
    const ordem = resolverOrdem("claude,gemini", providersDisponiveis);
    expect(ordem).toEqual([claude, gemini]);
  });

  it("aceita espaços em torno dos nomes", () => {
    const ordem = resolverOrdem(" claude , gemini ", providersDisponiveis);
    expect(ordem).toEqual([claude, gemini]);
  });

  it("lança erro quando a env var cita um provider desconhecido", () => {
    expect(() => resolverOrdem("gemini,openai", providersDisponiveis)).toThrow(
      'Provider desconhecido em LLM_ORDER: "openai"',
    );
  });
});
