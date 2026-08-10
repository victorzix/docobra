import { GoogleGenAI } from "@google/genai";

import type {
  LLMProvider,
  StructuredExtractionRequest,
  StructuredExtractionResult,
} from "./types";

export class GeminiProvider implements LLMProvider {
  name = "gemini";

  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async extractStructured<T = unknown>({
    systemPrompt,
    userPrompt,
    schema,
  }: StructuredExtractionRequest): Promise<StructuredExtractionResult<T>> {
    const response = await this.client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const data = JSON.parse(response.text ?? "{}") as T;

    return { data, provider: this.name, raw: response };
  }

  async transcribeAudio(audio: Buffer, mimeType: string): Promise<string> {
    const response = await this.client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: "Transcreva o áudio a seguir, palavra por palavra, em português." },
            { inlineData: { mimeType, data: audio.toString("base64") } },
          ],
        },
      ],
    });

    return response.text ?? "";
  }
}
