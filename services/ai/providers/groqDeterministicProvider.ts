import { getGroqApiKey } from '../../core/config';
import type { DeterministicLLMProvider, StructuredOutputRequest, StructuredOutputResult } from './contracts';
import { parseJsonFromText } from './json';

interface GroqChatChoice {
  message?: {
    content?: string;
  };
}

interface GroqChatResponse {
  choices?: GroqChatChoice[];
}

export class GroqDeterministicProvider implements DeterministicLLMProvider {
  readonly name = 'groq' as const;

  async generateStructured(request: StructuredOutputRequest): Promise<StructuredOutputResult> {
    const apiKey = getGroqApiKey();

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: `${request.system} Return valid JSON only.` },
          { role: 'user', content: `CONTEXT:\n${request.context}\n\nTASK:\n${request.user}` },
        ],
        temperature: request.temperature ?? 0.1,
        max_tokens: request.maxTokens ?? 260,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Groq API error ${response.status}`);
    }

    const data = (await response.json()) as GroqChatResponse;
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

