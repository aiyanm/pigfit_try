/**
 * RAG Orchestration Service - Groq Only
 * Single entry point for RAG + Groq LLM pipeline
 * Handles context retrieval and LLM calling
 */

import { prepareRAGContext, clearRAGCache, startCacheCleanup as startRAGCacheCleanup, stopCacheCleanup as stopRAGCacheCleanup } from './ragService';
import { safeCallGroq, streamGroqWithRAG, LLMResponse } from './llmSevice';
import { getGroqApiKey, getRAGConfig, isConfigured } from './ragConfig';
import { getAnalysisPrompt, AnalysisType } from './promptTemplates';

/**
 * Response from orchestration
 */
export interface RAGAnalysisResult {
  success: boolean;
  pigId: string;
  analysis: string;
  tokensUsed?: number;
  executionTime: number;
  error?: string;
  cacheHit?: boolean;
}

/**
 * Cache for RAG analysis results
 */
interface AnalysisCacheEntry {
  result: RAGAnalysisResult;
  timestamp: number;
}
const orchestratorCache = new Map<string, AnalysisCacheEntry>();
const ORCHESTRATOR_CACHE_DURATION = 600000; // 10 minutes

/**
 * Get cache key
 */
const getCacheKey = (pigId: string, timeWindow: string): string => {
  return `${pigId}:${timeWindow}`;
};

/**
 * Simple rate limiter for concurrent requests
 * Prevents overwhelming the LLM API with too many simultaneous calls
 */
class RateLimiter {
  private running = 0;
  private queue: Array<() => Promise<any>> = [];

  constructor(private concurrency: number = 3) {}

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    while (this.running >= this.concurrency) {
      // Wait for a slot to free up
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.running++;

    try {
      return await task();
    } finally {
      this.running--;
    }
  }

  getStatus() {
    return {
      running: this.running,
      queued: this.queue.length,
      concurrency: this.concurrency,
    };
  }
}

/**
 * Auto-cleanup expired orchestrator cache entries
 */
const cleanupOrchestratorCache = (duration = ORCHESTRATOR_CACHE_DURATION): void => {
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of orchestratorCache.entries()) {
    if (now - entry.timestamp > duration * 2) {
      orchestratorCache.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(
      `🧹 Orchestrator cache cleanup: removed ${removed} expired entries`
    );
  }
};

/**
 * Start periodic orchestrator cache cleanup
 */
let orchestratorCleanupInterval: ReturnType<typeof setInterval> | null = null;

export const startOrchestratorCleanup = (interval = 600000): void => {
  if (orchestratorCleanupInterval) return;

  orchestratorCleanupInterval = setInterval(() => {
    cleanupOrchestratorCache();
  }, interval);

  console.log('🔄 Orchestrator cache cleanup scheduled');
};

export const stopOrchestratorCleanup = (): void => {
  if (orchestratorCleanupInterval) {
    clearInterval(orchestratorCleanupInterval);
    orchestratorCleanupInterval = null;
    console.log('⏹️ Orchestrator cache cleanup stopped');
  }
};

/**
 * Main orchestration function - Groq only
 * Retrieves RAG context and calls Groq LLM with farmer-friendly prompt
 * 
 * analysisType: Always 'full' for complete health assessment
 */
export const analyzepigHealth = async (
  pigId: string,
  timeWindow: 'last_hour' | 'last_24h' | 'last_7d' = 'last_24h',
  analysisType: AnalysisType = 'full'
): Promise<RAGAnalysisResult> => {
  const startTime = Date.now();
  const config = getRAGConfig();
  const cacheKey = getCacheKey(pigId, timeWindow);

  // Check cache if enabled
  if (config.enableCache) {
    const cached = orchestratorCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ORCHESTRATOR_CACHE_DURATION) {
      if (config.debug) {
        console.log(`✅ Cache hit for pig ${pigId}`);
      }
      return { ...cached.result, cacheHit: true };
    }
  }

  try {
    // Verify configuration
    if (!isConfigured()) {
      throw new Error('Groq API key not configured');
    }

    const apiKey = getGroqApiKey();

    if (config.debug) {
      console.log(`🔄 Starting RAG analysis for pig ${pigId} using Groq`);
    }

    // Step 1: Retrieve RAG context
    if (config.debug) {
      console.log(`📍 Step 1: Retrieving RAG context...`);
    }

    const ragContext = await prepareRAGContext(pigId, timeWindow);

    if (config.debug) {
      console.log(`✅ RAG context retrieved (${ragContext.length} chars)`);
    }

    // Step 2: Get analysis prompt template (customizable)
    if (config.debug) {
      console.log(`📍 Step 2: Loading ${analysisType} prompt template...`);
    }
    
    const promptTemplate = getAnalysisPrompt(analysisType);

    if (config.debug) {
      console.log(`📍 Step 3: Calling Groq LLM with ${analysisType} analysis...`);
    }

    // Step 3: Call Groq with custom system role and user prompt
    const llmResponse = await safeCallGroq(
      promptTemplate.systemRole,
      promptTemplate.userPrompt,
      ragContext,
      apiKey
    );

    if (!llmResponse.success) {
      throw new Error(llmResponse.error || 'LLM call failed');
    }

    if (config.debug) {
      console.log(`✅ Groq response received`);
    }

    // Step 4: Compile results
    const executionTime = Date.now() - startTime;
    const result: RAGAnalysisResult = {
      success: true,
      pigId,
      analysis: llmResponse.content,
      tokensUsed: llmResponse.tokensUsed,
      executionTime,
    };

    // Cache result if enabled
    if (config.enableCache) {
      orchestratorCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });
    }

    if (config.debug) {
      console.log(
        `✅ Analysis complete in ${executionTime}ms for pig ${pigId}`
      );
    }

    return result;

  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    console.error(`❌ RAG analysis failed for pig ${pigId}:`, errorMsg);

    return {
      success: false,
      pigId,
      analysis: `Failed to analyze pig health: ${errorMsg}`,
      executionTime,
      error: errorMsg,
    };
  }
};

/**
 * Stream RAG analysis (for real-time UI updates)
 * analysisType: 'full'
 */
export const analyzepigHealthStream = async function* (
  pigId: string,
  timeWindow: 'last_hour' | 'last_24h' | 'last_7d' = 'last_24h',
  analysisType: AnalysisType = 'full'
): AsyncGenerator<string, RAGAnalysisResult, unknown> {
  const startTime = Date.now();
  const config = getRAGConfig();

  try {
    if (!isConfigured()) {
      throw new Error('Groq API key not configured');
    }

    const apiKey = getGroqApiKey();

    if (config.debug) {
      console.log(`🔄 Starting streaming RAG analysis for pig ${pigId}`);
    }

    // Retrieve RAG context
    const ragContext = await prepareRAGContext(pigId, timeWindow);

    if (config.debug) {
      console.log(`✅ RAG context retrieved (${ragContext.length} chars)`);
    }

    // Get analysis prompt template (customizable)
    const promptTemplate = getAnalysisPrompt(analysisType);

    if (config.debug) {
      console.log(`📍 Streaming from Groq LLM (${analysisType})...`);
    }

    // Stream from Groq with custom prompts
    for await (const chunk of streamGroqWithRAG(
      promptTemplate.systemRole,
      promptTemplate.userPrompt,
      ragContext,
      apiKey
    )) {
      yield chunk;
    }

    const executionTime = Date.now() - startTime;

    if (config.debug) {
      console.log(`✅ Streaming complete in ${executionTime}ms`);
    }

    return {
      success: true,
      pigId,
      analysis: '', // Streaming already yielded content
      executionTime,
    } as RAGAnalysisResult;

  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    console.error(`❌ Streaming analysis failed for pig ${pigId}:`, errorMsg);

    return {
      success: false,
      pigId,
      analysis: `Failed to stream analysis: ${errorMsg}`,
      executionTime,
      error: errorMsg,
    } as RAGAnalysisResult;
  }
};

/**
 * Batch analyze multiple pigs
 * Uses rate limiter to prevent overwhelming the API
 * analysisType: Always 'full' for complete health assessment
 */
export const analyzePigGroupHealth = async (
  pigIds: string[],
  timeWindow: 'last_hour' | 'last_24h' | 'last_7d' = 'last_24h',
  analysisType: AnalysisType = 'full'
): Promise<RAGAnalysisResult[]> => {
  const config = getRAGConfig();

  if (config.debug) {
    console.log(
      `🐷 Starting batch analysis for ${pigIds.length} pigs (${analysisType})`
    );
  }

  // Use rate limiter for concurrent requests (max 3 simultaneous)
  const rateLimiter = new RateLimiter(3);
  const startTime = Date.now();

  try {
    const results = await Promise.all(
      pigIds.map(pigId =>
        rateLimiter.schedule(() =>
          analyzepigHealth(pigId, timeWindow, analysisType)
        )
      )
    );

    const executionTime = Date.now() - startTime;

    if (config.debug) {
      const successCount = results.filter(r => r.success).length;
      console.log(
        `✅ Batch analysis complete: ${successCount}/${pigIds.length} successful in ${executionTime}ms`
      );
      console.log(
        `   Rate limiter status: ${JSON.stringify(rateLimiter.getStatus())}`
      );
    }

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Batch analysis failed:`, errorMsg);

    return pigIds.map(pigId => ({
      success: false,
      pigId,
      analysis: `Failed to analyze pig: ${errorMsg}`,
      executionTime: Date.now() - startTime,
      error: errorMsg,
    }));
  }
};

/**
 * Clear orchestration cache
 */
export const clearOrchestratorCache = (): void => {
  orchestratorCache.clear();
  clearRAGCache();
  console.log('🧹 Orchestrator cache cleared');
};

/**
 * Get cache statistics
 */
export const getOrchestratorStats = (): {
  cacheSize: number;
} => {
  return {
    cacheSize: orchestratorCache.size,
  };
};

/**
 * Validate configuration
 */
export const validateOrchestratorConfig = (): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!isConfigured()) {
    errors.push('Groq API key is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Estimate costs (Groq is free)
 */
export const estimateCost = (): number => {
  return 0; // Groq is free
};
