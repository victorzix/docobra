import { GeminiProvider } from "./gemini";
import { ClaudeProvider } from "./claude";
import { LLMRouter } from "./router";
import { resolverOrdem } from "./config";

export * from "./types";
export { GeminiProvider, ClaudeProvider, LLMRouter, resolverOrdem };

const providersDisponiveis = {
  gemini: new GeminiProvider(),
  claude: new ClaudeProvider(),
};

export const memorialRouter = new LLMRouter(
  resolverOrdem(process.env.LLM_ORDER_MEMORIAL, providersDisponiveis),
);
export const comuniqueSeRouter = new LLMRouter(
  resolverOrdem(process.env.LLM_ORDER_COMUNIQUE_SE, providersDisponiveis),
);
