export type JsonSchema = Record<string, unknown>;

export interface StructuredExtractionRequest {
  systemPrompt?: string;
  userPrompt: string;
  schema: JsonSchema;
}

export interface StructuredExtractionResult<T = unknown> {
  data: T;
  provider: string;
  raw: unknown;
}

export interface LLMProvider {
  name: string;
  extractStructured<T = unknown>(
    req: StructuredExtractionRequest,
  ): Promise<StructuredExtractionResult<T>>;
  transcribeAudio?(audio: Buffer, mimeType: string): Promise<string>;
}

export class LLMValidationError extends Error {}
