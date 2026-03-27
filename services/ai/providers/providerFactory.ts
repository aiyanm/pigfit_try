import {
  getAIConfig,
  hasGeminiApiKey,
  hasGroqApiKey,
  hasOpenAIApiKey,
  type AIProviderName,
} from '../../core/config';
import type { DeterministicLLMProvider } from './contracts';
import { OpenAIDeterministicProvider } from './openaiDeterministicProvider';
import { GroqDeterministicProvider } from './groqDeterministicProvider';
import { GeminiDeterministicProvider } from './geminiDeterministicProvider';

const createProvider = (name: AIProviderName): DeterministicLLMProvider => {
  switch (name) {
    case 'openai':
      return new OpenAIDeterministicProvider();
    case 'groq':
      return new GroqDeterministicProvider();
    case 'gemini':
      return new GeminiDeterministicProvider();
    default:
      return new OpenAIDeterministicProvider();
  }
};

const uniqueProviders = (names: AIProviderName[]): AIProviderName[] => {
  const seen = new Set<AIProviderName>();
  return names.filter((name) => {
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
};

const isProviderAvailable = (provider: AIProviderName): boolean => {
  if (provider === 'openai') return hasOpenAIApiKey();
  if (provider === 'groq') return hasGroqApiKey();
  return hasGeminiApiKey();
};

export const getDeterministicProviderOrder = (): AIProviderName[] => {
  const config = getAIConfig();
  const chain = uniqueProviders([
    config.deterministicPrimaryProvider,
    ...(config.deterministicFallbackProviders || []),
  ]);
  return chain.filter(isProviderAvailable);
};

export const getDeterministicProviderChain = (): DeterministicLLMProvider[] => {
  const chain = getDeterministicProviderOrder();
  return chain.map((name) => createProvider(name));
};

export const getDeterministicModelForProvider = (providerName: AIProviderName): string => {
  const config = getAIConfig();
  return (
    config.deterministicModelByProvider?.[providerName] ||
    (providerName === 'openai'
      ? 'gpt-4o-mini'
      : providerName === 'groq'
        ? 'llama-3.3-70b-versatile'
        : 'gemini-1.5-flash')
  );
};

