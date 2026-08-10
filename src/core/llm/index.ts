import { GeminiProvider } from "./gemini";
import { ClaudeProvider } from "./claude";
import { LLMRouter } from "./router";

export * from "./types";
export { GeminiProvider, ClaudeProvider, LLMRouter };

const providersEmOrdem = [new GeminiProvider(), new ClaudeProvider()];

export const memorialRouter = new LLMRouter(providersEmOrdem);
export const comuniqueSeRouter = new LLMRouter(providersEmOrdem);
