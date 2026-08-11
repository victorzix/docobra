import type { LLMProvider } from "./types";

export function resolverOrdem(
  env: string | undefined,
  providersDisponiveis: Record<string, LLMProvider>,
): LLMProvider[] {
  const valor = env?.trim() ? env : "gemini,claude";
  const nomes = valor.split(",").map((nome) => nome.trim());

  return nomes.map((nome) => {
    const provider = providersDisponiveis[nome];
    if (!provider) {
      throw new Error(`Provider desconhecido em LLM_ORDER: "${nome}"`);
    }
    return provider;
  });
}
