import { getOpenAIApiKey } from '../../core/config';
import type { DeterministicLLMProvider, StructuredOutputRequest, StructuredOutputResult } from './contracts';
import { parseJsonFromText } from './json';

interface OpenAIChatChoice {
  message?: {
    content?: string;
  };
}

interface OpenAIChatResponse {
  choices?: OpenAIChatChoice[];
}

export class OpenAIDeterministicProvider implements DeterministicLLMProvider {
  readonly name = 'openai' as const;

  async generateStructured(request: StructuredOutputRequest): Promise<StructuredOutputResult> {
    const apiKey = getOpenAIApiKey();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: `CONTEXT:\n${request.context}\n\nTASK:\n${request.user}` },
        ],
        temperature: request.temperature ?? 0.1,
        max_tokens: request.maxTokens ?? 260,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `OpenAI API error ${response.status}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const rawText = String(data.choices?.[0]?.message?.content ?? '').trim();
    const parsed = parseJsonFromText(rawText);

    return {
      provider: this.name,
      model: request.model,
      rawText,
      parsed,
    };
  }
}

