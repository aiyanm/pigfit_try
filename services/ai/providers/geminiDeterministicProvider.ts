import { getGeminiApiKey } from '../../core/config';
import type { DeterministicLLMProvider, StructuredOutputRequest, StructuredOutputResult } from './contracts';
import { parseJsonFromText } from './json';

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

export class GeminiDeterministicProvider implements DeterministicLLMProvider {
  readonly name = 'gemini' as const;

  async generateStructured(request: StructuredOutputRequest): Promise<StructuredOutputResult> {
    const apiKey = getGeminiApiKey();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${request.system}\n\nCONTEXT:\n${request.context}\n\nTASK:\n${request.user}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: request.temperature ?? 0.1,
          maxOutputTokens: request.maxTokens ?? 260,
          responseMimeType: 'application/json',
          responseJsonSchema: request.schema,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData?.error?.message || `Gemini API error ${response.status}`;
      throw new Error(message);
    }

    const data = (await response.json()) as GeminiResponse;
    const rawText = String(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    const parsed = parseJsonFromText(rawText);

    return {
      provider: this.name,
      model: request.model,
      rawText,
      parsed,
    };
  }
}

