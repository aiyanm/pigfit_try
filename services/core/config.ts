/**
 * AI Configuration Manager
 * Groq-only deterministic insight configuration.
 */

export type AIProviderName = 'groq';

export interface AIConfig {
  // API keys
  groqApiKey?: string;

  // LLM Parameters
  llmTemperature?: number;
  llmMaxTokens?: number;

  // Retry and resilience
  deterministicEnabled?: boolean;

  // Deterministic provider routing
  deterministicPrimaryProvider: AIProviderName;
  deterministicFallbackProviders: AIProviderName[];
  deterministicModelByProvider?: Partial<Record<AIProviderName, string>>;
}

const DEFAULT_CONFIG: AIConfig = {
  llmTemperature: 0.7,
  llmMaxTokens: 350,
  deterministicEnabled: true,
  deterministicPrimaryProvider: 'groq',
  deterministicFallbackProviders: [],
  deterministicModelByProvider: {
    groq: 'llama-3.3-70b-versatile',
  },
};

let currentConfig: AIConfig = { ...DEFAULT_CONFIG };

export const initializeAIConfig = (overrides?: Partial<AIConfig>): AIConfig => {
  const groqKey = process.env.GROQ_API_KEY;

  currentConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    deterministicModelByProvider: {
      ...DEFAULT_CONFIG.deterministicModelByProvider,
      ...(overrides?.deterministicModelByProvider ?? {}),
    },
  };

  if (groqKey) currentConfig.groqApiKey = groqKey;

  return { ...currentConfig };
};

export const getAIConfig = (): AIConfig => ({ ...currentConfig });

export const updateAIConfig = (updates: Partial<AIConfig>): AIConfig => {
  currentConfig = {
    ...currentConfig,
    ...updates,
    deterministicModelByProvider: {
      ...currentConfig.deterministicModelByProvider,
      ...(updates.deterministicModelByProvider ?? {}),
    },
  };
  return { ...currentConfig };
};

export const resetAIConfig = (): AIConfig => {
  currentConfig = { ...DEFAULT_CONFIG };
  return { ...currentConfig };
};

export const setGroqApiKey = (apiKey: string): void => {
  currentConfig.groqApiKey = apiKey;
};

export const getGroqApiKey = (): string => {
  if (!currentConfig.groqApiKey) {
    throw new Error('Groq API key not configured. Call setGroqApiKey() or set GROQ_API_KEY environment variable.');
  }
  return currentConfig.groqApiKey;
};

export const isConfigured = (): boolean => {
  return !!currentConfig.groqApiKey;
};

export const hasGroqApiKey = (): boolean => !!currentConfig.groqApiKey;

export const isDeterministicEnabled = (): boolean => {
  return currentConfig.deterministicEnabled !== false;
};

