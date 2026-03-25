import type { LLMConfig, LLMResponse } from './groqProvider';
import { callLLMWithRAG as callOpenAILegacy, safeCallLLM as safeCallOpenAILegacy, streamLLMWithRAG as streamOpenAILegacy } from './groqProvider';

/**
 * OpenAI provider wrapper (legacy RAG pathway).
 * Kept for backward compatibility while deterministic pipeline uses providerFactory.
 */
export const callLLMWithRAG = async (
  context: string,
  prompt: string,
  config?: Partial<LLMConfig>
): Promise<string> => {
  return callOpenAILegacy(context, prompt, config);
};

export const safeCallLLM = async (
  context: string,
  prompt: string,
  apiKey: string
): Promise<LLMResponse> => {
  return safeCallOpenAILegacy(context, prompt, apiKey);
};

export const streamLLMWithRAG = async function* (
  context: string,
  prompt: string,
  config?: Partial<LLMConfig>
): AsyncGenerator<string, void, unknown> {
  for await (const chunk of streamOpenAILegacy(context, prompt, config)) {
    yield chunk;
  }
};

export type { LLMConfig, LLMResponse } from './groqProvider';
