import {
  getAIConfig,
  hasGroqApiKey,
  type AIProviderName,
} from '../../core/config';
import type { DeterministicLLMProvider } from './contracts';
import { GroqDeterministicProvider } from './groqDeterministicProvider';

const createProvider = (name: AIProviderName): DeterministicLLMProvider => {
  return new GroqDeterministicProvider();
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
  return provider === 'groq' && hasGroqApiKey();
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
  return config.deterministicModelByProvider?.[providerName] || 'llama-3.3-70b-versatile';
};

