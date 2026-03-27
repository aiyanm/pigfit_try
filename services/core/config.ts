/**
 * AI Configuration Manager
 * Backward compatible with older RAG-* naming.
 */

export type AIProviderName = 'openai' | 'groq' | 'gemini';

export interface AIConfig {
  // API keys
  openaiApiKey?: string;
  groqApiKey?: string;
  geminiApiKey?: string;

  // Legacy/RAG analysis settings
  timeWindow: 'last_hour' | 'last_24h' | 'last_7d';
  enableCache: boolean;
  debug: boolean;

  // LLM Parameters
  llmTemperature?: number;
  llmMaxTokens?: number;
  contextTokenLimit?: number;

  // Retry and resilience
  maxRetries?: number;
  retryBackoffMs?: number;
  deterministicEnabled?: boolean;

  // Deterministic provider routing
  deterministicPrimaryProvider: AIProviderName;
  deterministicFallbackProviders: AIProviderName[];
  deterministicModelByProvider?: Partial<Record<AIProviderName, string>>;
}

// Backward-compatible alias type
export type RAGConfig = AIConfig;

const DEFAULT_CONFIG: AIConfig = {
  timeWindow: 'last_24h',
  enableCache: true,
  debug: false,
  llmTemperature: 0.7,
  llmMaxTokens: 350,
  contextTokenLimit: 3500,
  maxRetries: 5,
  retryBackoffMs: 1000,
  deterministicEnabled: true,
  deterministicPrimaryProvider: 'openai',
  deterministicFallbackProviders: ['groq'],
  deterministicModelByProvider: {
    openai: 'gpt-4o-mini',
    groq: 'llama-3.3-70b-versatile',
    gemini: 'gemini-1.5-flash',
  },
};

let currentConfig: AIConfig = { ...DEFAULT_CONFIG };

export const initializeAIConfig = (overrides?: Partial<AIConfig>): AIConfig => {
  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  currentConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    deterministicModelByProvider: {
      ...DEFAULT_CONFIG.deterministicModelByProvider,
      ...(overrides?.deterministicModelByProvider ?? {}),
    },
  };

  if (openaiKey) currentConfig.openaiApiKey = openaiKey;
  if (groqKey) currentConfig.groqApiKey = groqKey;
  if (geminiKey) currentConfig.geminiApiKey = geminiKey;

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

export const setOpenAIApiKey = (apiKey: string): void => {
  currentConfig.openaiApiKey = apiKey;
};

export const getOpenAIApiKey = (): string => {
  if (!currentConfig.openaiApiKey) {
    throw new Error('OpenAI API key not configured. Call setOpenAIApiKey() or set OPENAI_API_KEY environment variable.');
  }
  return currentConfig.openaiApiKey;
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

export const setGeminiApiKey = (apiKey: string): void => {
  currentConfig.geminiApiKey = apiKey;
};

export const getGeminiApiKey = (): string => {
  if (!currentConfig.geminiApiKey) {
    throw new Error('Gemini API key not configured. Call setGeminiApiKey() or set GEMINI_API_KEY environment variable.');
  }
  return currentConfig.geminiApiKey;
};

export const isConfigured = (): boolean => {
  return !!(currentConfig.openaiApiKey || currentConfig.groqApiKey || currentConfig.geminiApiKey);
};

export const hasOpenAIApiKey = (): boolean => !!currentConfig.openaiApiKey;
export const hasGroqApiKey = (): boolean => !!currentConfig.groqApiKey;
export const hasGeminiApiKey = (): boolean => !!currentConfig.geminiApiKey;

export const isDeterministicEnabled = (): boolean => {
  return currentConfig.deterministicEnabled !== false;
};

// Backward-compatible aliases for legacy imports
export const initializeRAGConfig = (overrides?: Partial<RAGConfig>): RAGConfig => initializeAIConfig(overrides);
export const getRAGConfig = (): RAGConfig => getAIConfig();
export const updateRAGConfig = (updates: Partial<RAGConfig>): RAGConfig => updateAIConfig(updates);
export const resetRAGConfig = (): RAGConfig => resetAIConfig();

