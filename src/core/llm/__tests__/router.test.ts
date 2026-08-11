import { describe, expect, it, vi } from "vitest";

import { LLMRouter } from "../router";
import { LLMValidationError } from "../types";
import type { LLMProvider, StructuredExtractionResult } from "../types";

function criarProviderFake(
  nome: string,
  comportamento:
    | { tipo: "sucesso"; resultado: StructuredExtractionResult }
    | { tipo: "falha"; erro: Error },
  comTranscricao = false,
): LLMProvider {
  const provider: LLMProvider = {
    name: nome,
    extractStructured: vi.fn(async () => {
      if (comportamento.tipo === "falha") throw comportamento.erro;
      return comportamento.resultado;
    }),
  };

  if (comTranscricao) {
    provider.transcribeAudio = vi.fn(async () => {
      if (comportamento.tipo === "falha") throw comportamento.erro;
      return `${nome} transcreveu`;
    });
  }

  return provider;
}

describe("LLMRouter.extractStructured", () => {
  const requestValido = { userPrompt: "extraia isso", schema: { type: "object" } };

  it("retorna do primeiro provider sem chamar o segundo", async () => {
    const resultadoEsperado: StructuredExtractionResult = { data: { ok: true }, provider: "p1", raw: {} };
    const provider1 = criarProviderFake("p1", { tipo: "sucesso", resultado: resultadoEsperado });
    const provider2 = criarProviderFake("p2", {
      tipo: "sucesso",
      resultado: { data: {}, provider: "p2", raw: {} },
    });

    const router = new LLMRouter([provider1, provider2]);
    const resultado = await router.extractStructured(requestValido);

    expect(resultado).toBe(resultadoEsperado);
    expect(provider2.extractStructured).not.toHaveBeenCalled();
  });

  it("cai pro segundo provider quando o primeiro falha", async () => {
    const provider1 = criarProviderFake("p1", { tipo: "falha", erro: new Error("p1 caiu") });
    const resultadoEsperado: StructuredExtractionResult = { data: { ok: true }, provider: "p2", raw: {} };
    const provider2 = criarProviderFake("p2", { tipo: "sucesso", resultado: resultadoEsperado });

    const router = new LLMRouter([provider1, provider2]);
    const resultado = await router.extractStructured(requestValido);

    expect(resultado).toBe(resultadoEsperado);
    expect(provider1.extractStructured).toHaveBeenCalledOnce();
  });

  it("propaga o erro do último provider quando todos falham", async () => {
    const erroFinal = new Error("p2 caiu");
    const provider1 = criarProviderFake("p1", { tipo: "falha", erro: new Error("p1 caiu") });
    const provider2 = criarProviderFake("p2", { tipo: "falha", erro: erroFinal });

    const router = new LLMRouter([provider1, provider2]);

    await expect(router.extractStructured(requestValido)).rejects.toBe(erroFinal);
  });

  it("lança LLMValidationError sem chamar nenhum provider quando userPrompt é vazio", async () => {
    const provider1 = criarProviderFake("p1", {
      tipo: "sucesso",
      resultado: { data: {}, provider: "p1", raw: {} },
    });
    const router = new LLMRouter([provider1]);

    await expect(
      router.extractStructured({ userPrompt: "   ", schema: { type: "object" } }),
    ).rejects.toThrow(LLMValidationError);
    expect(provider1.extractStructured).not.toHaveBeenCalled();
  });

  it("lança LLMValidationError sem chamar nenhum provider quando schema é vazio", async () => {
    const provider1 = criarProviderFake("p1", {
      tipo: "sucesso",
      resultado: { data: {}, provider: "p1", raw: {} },
    });
    const router = new LLMRouter([provider1]);

    await expect(
      router.extractStructured({ userPrompt: "extraia isso", schema: {} }),
    ).rejects.toThrow(LLMValidationError);
    expect(provider1.extractStructured).not.toHaveBeenCalled();
  });
});

describe("LLMRouter.transcribeAudio", () => {
  const audio = Buffer.from("fake-audio");

  it("retorna do primeiro provider que suporta transcrição, sem chamar o segundo", async () => {
    const provider1 = criarProviderFake(
      "p1",
      { tipo: "sucesso", resultado: { data: {}, provider: "p1", raw: {} } },
      true,
    );
    const provider2 = criarProviderFake(
      "p2",
      { tipo: "sucesso", resultado: { data: {}, provider: "p2", raw: {} } },
      true,
    );

    const router = new LLMRouter([provider1, provider2]);
    const resultado = await router.transcribeAudio(audio, "audio/wav");

    expect(resultado).toBe("p1 transcreveu");
    expect(provider2.transcribeAudio).not.toHaveBeenCalled();
  });

  it("cai pro segundo provider quando o primeiro falha na transcrição", async () => {
    const provider1 = criarProviderFake("p1", { tipo: "falha", erro: new Error("p1 caiu") }, true);
    const provider2 = criarProviderFake(
      "p2",
      { tipo: "sucesso", resultado: { data: {}, provider: "p2", raw: {} } },
      true,
    );

    const router = new LLMRouter([provider1, provider2]);
    const resultado = await router.transcribeAudio(audio, "audio/wav");

    expect(resultado).toBe("p2 transcreveu");
  });

  it("propaga o erro do último provider quando todos falham na transcrição", async () => {
    const erroFinal = new Error("p2 caiu");
    const provider1 = criarProviderFake("p1", { tipo: "falha", erro: new Error("p1 caiu") }, true);
    const provider2 = criarProviderFake("p2", { tipo: "falha", erro: erroFinal }, true);

    const router = new LLMRouter([provider1, provider2]);

    await expect(router.transcribeAudio(audio, "audio/wav")).rejects.toBe(erroFinal);
  });

  it("lança erro dedicado quando nenhum provider da lista suporta transcrição", async () => {
    const provider1 = criarProviderFake(
      "p1",
      { tipo: "sucesso", resultado: { data: {}, provider: "p1", raw: {} } },
      false,
    );

    const router = new LLMRouter([provider1]);

    await expect(router.transcribeAudio(audio, "audio/wav")).rejects.toThrow(
      "Nenhum provider disponível suporta transcrição de áudio.",
    );
    expect(provider1.extractStructured).not.toHaveBeenCalled();
  });
});
