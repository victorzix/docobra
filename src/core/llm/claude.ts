import Anthropic from "@anthropic-ai/sdk";

import type {
  LLMProvider,
  StructuredExtractionRequest,
  StructuredExtractionResult,
} from "./types";

export class ClaudeProvider implements LLMProvider {
  name = "claude";

  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  async extractStructured<T = unknown>({
    systemPrompt,
    userPrompt,
    schema,
  }: StructuredExtractionRequest): Promise<StructuredExtractionResult<T>> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: { type: "json_schema", schema } },
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const data = JSON.parse(textBlock?.text ?? "{}") as T;

    return { data, provider: this.name, raw: response };
  }
}
