/**
 * RAG Configuration Manager - Groq Only
 * Simplified configuration for Groq API
 */

/**
 * Global RAG configuration
 */
export interface RAGConfig {
  groqApiKey?: string;
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
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: RAGConfig = {
  timeWindow: 'last_24h',
  enableCache: true,
  debug: false,
  llmTemperature: 0.7,
  llmMaxTokens: 350,
  contextTokenLimit: 3500, // Leave room for response
  maxRetries: 5,
  retryBackoffMs: 1000,
};

// Current configuration
let currentConfig: RAGConfig = { ...DEFAULT_CONFIG };

/**
 * Initialize RAG configuration
 */
export const initializeRAGConfig = (overrides?: Partial<RAGConfig>): RAGConfig => {
  const groqKey = process.env.GROQ_API_KEY;

  currentConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
  };

  if (groqKey) {
    currentConfig.groqApiKey = groqKey;
  }

  return currentConfig;
};

/**
 * Get current configuration
 */
export const getRAGConfig = (): RAGConfig => {
  return { ...currentConfig };
};

/**
 * Set Groq API key
 */
export const setGroqApiKey = (apiKey: string): void => {
  currentConfig.groqApiKey = apiKey;
};

/**
 * Get Groq API key
 */
export const getGroqApiKey = (): string => {
  if (!currentConfig.groqApiKey) {
    throw new Error('Groq API key not configured. Call setGroqApiKey() or set GROQ_API_KEY environment variable.');
  }
  return currentConfig.groqApiKey;
};

/**
 * Update configuration
 */
export const updateRAGConfig = (updates: Partial<RAGConfig>): RAGConfig => {
  currentConfig = { ...currentConfig, ...updates };
  return { ...currentConfig };
};

/**
 * Reset to default configuration
 */
export const resetRAGConfig = (): RAGConfig => {
  currentConfig = { ...DEFAULT_CONFIG };
  return { ...currentConfig };
};

/**
 * Check if configured and ready to use
 */
export const isConfigured = (): boolean => {
  return !!currentConfig.groqApiKey;
};

