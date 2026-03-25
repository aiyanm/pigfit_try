import type { LLMResponse } from './groqProvider';
import { callGeminiLLM as callGeminiLegacy, safeCallGemini as safeCallGeminiLegacy } from './groqProvider';

/**
 * Gemini provider wrapper (legacy RAG pathway).
 * Kept for backward compatibility while deterministic pipeline uses providerFactory.
 */
export const callGeminiLLM = async (
  context: string,
  prompt: string,
  apiKey: string
): Promise<string> => {
  return callGeminiLegacy(context, prompt, apiKey);
};

export const safeCallGemini = async (
  context: string,
  prompt: string,
  apiKey: string
): Promise<LLMResponse> => {
  return safeCallGeminiLegacy(context, prompt, apiKey);
};

export type { LLMResponse } from './groqProvider';
