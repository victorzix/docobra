import type {
  LLMProvider,
  StructuredExtractionRequest,
  StructuredExtractionResult,
} from "./types";

export class LLMRouter {
  constructor(private readonly providers: LLMProvider[]) {}

  async extractStructured<T = unknown>(
    req: StructuredExtractionRequest,
  ): Promise<StructuredExtractionResult<T>> {
    let lastError: unknown;

    for (const provider of this.providers) {
      try {
        return await provider.extractStructured<T>(req);
      } catch (error) {
        lastError = error;
        console.error(`[LLMRouter] ${provider.name} falhou, tentando próximo provider`, error);
      }
    }

    throw lastError;
  }

  async transcribeAudio(audio: Buffer, mimeType: string): Promise<string> {
    let lastError: unknown;

    for (const provider of this.providers) {
      if (!provider.transcribeAudio) continue;

      try {
        return await provider.transcribeAudio(audio, mimeType);
      } catch (error) {
        lastError = error;
        console.error(`[LLMRouter] ${provider.name} falhou na transcrição, tentando próximo provider`, error);
      }
    }

    throw lastError ?? new Error("Nenhum provider disponível suporta transcrição de áudio.");
  }
}
