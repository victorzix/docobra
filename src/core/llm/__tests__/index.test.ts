import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../gemini", () => ({
  GeminiProvider: class {
    name = "gemini";
    extractStructured = vi.fn();
  },
}));

vi.mock("../claude", () => ({
  ClaudeProvider: class {
    name = "claude";
    extractStructured = vi.fn();
  },
}));

const ENV_VARS = ["LLM_ORDER_MEMORIAL", "LLM_ORDER_COMUNIQUE_SE"] as const;

describe("core/llm/index wiring", () => {
  const originais: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const chave of ENV_VARS) originais[chave] = process.env[chave];
    vi.resetModules();
  });

  afterEach(() => {
    for (const chave of ENV_VARS) {
      const valorOriginal = originais[chave];
      if (valorOriginal === undefined) delete process.env[chave];
      else process.env[chave] = valorOriginal;
    }
  });

  it("usa a ordem default gemini,claude pros dois routers quando as env vars estão ausentes", async () => {
    delete process.env.LLM_ORDER_MEMORIAL;
    delete process.env.LLM_ORDER_COMUNIQUE_SE;

    const { memorialRouter, comuniqueSeRouter, LLMRouter } = await import("../index");

    expect(memorialRouter).toBeInstanceOf(LLMRouter);
    // acessa o campo privado `providers` via cast pra any — aceitável só em teste
    expect((memorialRouter as any).providers.map((p: any) => p.name)).toEqual(["gemini", "claude"]);
    expect((comuniqueSeRouter as any).providers.map((p: any) => p.name)).toEqual(["gemini", "claude"]);
  });

  it("respeita LLM_ORDER_MEMORIAL e LLM_ORDER_COMUNIQUE_SE independentemente", async () => {
    process.env.LLM_ORDER_MEMORIAL = "claude,gemini";
    process.env.LLM_ORDER_COMUNIQUE_SE = "gemini,claude";

    const { memorialRouter, comuniqueSeRouter } = await import("../index");

    expect((memorialRouter as any).providers.map((p: any) => p.name)).toEqual(["claude", "gemini"]);
    expect((comuniqueSeRouter as any).providers.map((p: any) => p.name)).toEqual(["gemini", "claude"]);
  });

  it("lança erro na inicialização quando a env var cita um provider desconhecido", async () => {
    process.env.LLM_ORDER_MEMORIAL = "gemini,openai";

    await expect(import("../index")).rejects.toThrow(
      'Provider desconhecido em LLM_ORDER: "openai"',
    );
  });
});
