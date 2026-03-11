/**
 * LLM Service with RAG Integration
 * Handles all communication with OpenAI API (GPT-4o mini)
 * Includes error handling, retries, and timeout management
 */

import { getRAGConfig } from './ragConfig';

export interface LLMConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  retries?: number;
}

export interface LLMResponse {
  success: boolean;
  content: string;
  tokensUsed?: number;
  error?: string;
}

const DEFAULT_CONFIG: Partial<LLMConfig> = {
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 350,
  timeout: 15000,
  retries: 3,
};

/**
 * Estimate token count using simple heuristic
 * OpenAI models typically use ~1.3 tokens per word on average
 */
const estimateTokenCount = (text: string): number => {
  const words = text.trim().split(/\s+/).length;
  const tokens = Math.ceil(words * 1.3);
  return tokens + 4;
};

/**
 * Call OpenAI API with proper error handling and timeout
 */
const callOpenAIAPI = async (
  context: string,
  prompt: string,
  config: LLMConfig
): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const fullPrompt = `CONTEXT:\n${context}\n\nQUESTION/ANALYSIS:\n${prompt}`;

    const requestBody = {
      model: config.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert veterinary AI assistant specializing in pig health monitoring. ' +
            'Analyze sensor data to provide clinical insights, identify health concerns, and recommend monitoring actions. ' +
            'Be concise, evidence-based, and focus on actionable recommendations.',
        },
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    };

    console.log(`🚀 Making API call to OpenAI (${config.model})`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal as AbortSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        errorData.error?.message ||
        `OpenAI API error: ${response.status} ${response.statusText}`;
      throw new Error(errorMsg);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from OpenAI API');
    }

    const content = data.choices[0].message.content;
    const tokensUsed = data.usage?.total_tokens;

    console.log(`✅ LLM response received (${tokensUsed} tokens used)`);

    return content;

  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`LLM request timeout after ${config.timeout}ms`);
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to reach OpenAI API');
    }

    throw error;
  }
};

/**
 * Main function to call LLM with RAG context
 */
export const callLLMWithRAG = async (
  context: string,
  prompt: string,
  config?: Partial<LLMConfig>
): Promise<string> => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config } as LLMConfig;

  if (!finalConfig.apiKey) {
    throw new Error('OpenAI API key not provided. Set it in the config or as OPENAI_API_KEY environment variable.');
  }

  if (!validateAPIKey(finalConfig.apiKey)) {
    throw new Error('Invalid OpenAI API key format. Keys should start with "sk-"');
  }

  const estimatedTokens = estimateTokenCount(context + prompt);
  console.log(`📊 Estimated token count: ${estimatedTokens}`);

  if (estimatedTokens > 4000) {
    console.warn('⚠️ Token count very high. Response may be truncated.');
  }

  for (let attempt = 1; attempt <= finalConfig.retries!; attempt++) {
    try {
      console.log(`🤖 Calling LLM (Attempt ${attempt}/${finalConfig.retries})`);

      const response = await callOpenAIAPI(context, prompt, finalConfig);

      console.log('✅ LLM call successful');
      return response;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`❌ Attempt ${attempt} failed: ${errorMsg}`);

      if (attempt === finalConfig.retries) {
        console.error('❌ All retries exhausted');
        throw new Error(
          `Failed to get response from LLM after ${finalConfig.retries} attempts: ${errorMsg}`
        );
      }

      const waitTime = Math.pow(2, attempt - 1) * 1000;
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('LLM call failed unexpectedly');
};

/**
 * Helper: Validate OpenAI API key format
 */
export const validateAPIKey = (apiKey: string): boolean => {
  return apiKey.startsWith('sk-') && apiKey.length > 20;
};

/**
 * Helper: Get available models
 */
export const getAvailableModels = (): string[] => {
  return [
    'gpt-4o-mini', // Recommended: fast, cost-effective
    'gpt-4o',
    'gpt-3.5-turbo',
  ];
};

/**
 * Call Groq API (OpenAI-compatible format)
 * REFACTORED: Now accepts systemRole from promptTemplates.ts
 * This ensures all prompts are centralized and customizable
 */
const callGroqAPI = async (
  systemRole: string,
  userPrompt: string,
  context: string,
  apiKey: string
): Promise<string> => {
  const config = getRAGConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const fullUserMessage = `CONTEXT:\n${context}\n\nQUESTION/ANALYSIS:\n${userPrompt}`;

    const requestBody = {
      model: 'mixtral-8x7b-32768',
      messages: [
        {
          role: 'system',
          content: systemRole,
        },
        {
          role: 'user',
          content: fullUserMessage,
        },
      ],
      temperature: config.llmTemperature ?? 0.7,
      max_tokens: config.llmMaxTokens ?? 350,
    };

    if (config.debug) {
      console.log('🚀 Making API call to Groq');
      console.log(`   Temperature: ${requestBody.temperature}, MaxTokens: ${requestBody.max_tokens}`);
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal as AbortSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        errorData.error?.message ||
        `Groq API error: ${response.status} ${response.statusText}`;
      throw new Error(errorMsg);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from Groq API');
    }

    const content = data.choices[0].message.content;
    const tokensUsed = data.usage?.total_tokens;

    console.log(`✅ Groq response received (${tokensUsed} tokens used)`);

    return content;

  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Groq request timeout after 15000ms`);
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to reach Groq API');
    }

    throw error;
  }
};

/**
 * Safe wrapper for Groq (with custom prompts)
 * systemRole: Custom system instruction (from promptTemplates)
 * userPrompt: User-facing prompt instruction (from promptTemplates)
 * context: RAG context from database
 * apiKey: Groq API key
 */
export const safeCallGroq = async (
  systemRole: string,
  userPrompt: string,
  context: string,
  apiKey: string
): Promise<LLMResponse> => {
  try {
    if (!apiKey) {
      return {
        success: false,
        content: 'Groq API key not provided',
        error: 'MISSING_KEY',
      };
    }

    console.log('🔐 Calling Groq API');

    const result = await callGroqAPI(systemRole, userPrompt, context, apiKey);

    return {
      success: true,
      content: result,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('🚨 Groq error:', errorMsg);

    return {
      success: false,
      content: 'Unable to get analysis from Groq API. Please try again.',
      error: errorMsg,
    };
  }
};

/**
 * Stream Groq response (for real-time UI updates)
 * REFACTORED: Now accepts systemRole from promptTemplates.ts
 */
export const streamGroqWithRAG = async function* (
  systemRole: string,
  userPrompt: string,
  context: string,
  apiKey: string
): AsyncGenerator<string, void, unknown> {
  if (!apiKey) {
    throw new Error('Groq API key not provided');
  }

  const config = getRAGConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const fullUserMessage = `CONTEXT:\n${context}\n\nQUESTION/ANALYSIS:\n${userPrompt}`;

    const requestBody = {
      model: 'mixtral-8x7b-32768',
      messages: [
        {
          role: 'system',
          content: systemRole,
        },
        {
          role: 'user',
          content: fullUserMessage,
        },
      ],
      temperature: 0.7,
      max_tokens: 350,
      stream: true,
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal as AbortSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();

          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();

            if (data === '[DONE]') {
              break;
            }

            try {
              const parsed = JSON.parse(data);
              const chunk = parsed.choices?.[0]?.delta?.content;

              if (chunk) {
                yield chunk;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }

        buffer = lines[lines.length - 1];
      }
    } finally {
      reader.releaseLock();
    }

  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Stream timeout after 15000ms`);
    }

    throw error;
  }
};

/**
 * Safe wrapper to handle LLM calls without crashing the app
 */
export const safeCallLLM = async (
  context: string,
  prompt: string,
  apiKey: string
): Promise<LLMResponse> => {
  try {
    if (!validateAPIKey(apiKey)) {
      return {
        success: false,
        content: 'Invalid OpenAI API key format',
        error: 'INVALID_KEY',
      };
    }

    console.log('🔐 Validated API key, proceeding with LLM call');

    const result = await callLLMWithRAG(context, prompt, { apiKey });

    return {
      success: true,
      content: result,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('🚨 LLM call error:', errorMsg);

    return {
      success: false,
      content: 'Unable to get analysis from AI. Please try again.',
      error: errorMsg,
    };
  }
};

/**
 * Stream LLM response (for real-time UI updates)
 * Returns an async generator of text chunks
 */
export const streamLLMWithRAG = async function* (
  context: string,
  prompt: string,
  config?: Partial<LLMConfig>
): AsyncGenerator<string, void, unknown> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config } as LLMConfig;

  if (!finalConfig.apiKey) {
    throw new Error('OpenAI API key not provided');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), finalConfig.timeout);

  try {
    const fullPrompt = `CONTEXT:\n${context}\n\nQUESTION/ANALYSIS:\n${prompt}`;

    const requestBody = {
      model: finalConfig.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert veterinary AI assistant specializing in pig health monitoring. ' +
            'Analyze sensor data to provide clinical insights. Be concise and actionable.',
        },
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
      temperature: finalConfig.temperature,
      max_tokens: finalConfig.maxTokens,
      stream: true,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${finalConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal as AbortSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();

          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();

            if (data === '[DONE]') {
              break;
            }

            try {
              const parsed = JSON.parse(data);
              const chunk = parsed.choices?.[0]?.delta?.content;

              if (chunk) {
                yield chunk;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }

        buffer = lines[lines.length - 1];
      }
    } finally {
      reader.releaseLock();
    }

  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Stream timeout after ${finalConfig.timeout}ms`);
    }

    throw error;
  }
};

/**
 * Call Gemini LLM
 */
export const callGeminiLLM = async (
  context: string,
  prompt: string,
  apiKey: string
): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const fullPrompt = `CONTEXT:\n${context}\n\nQUESTION/ANALYSIS:\n${prompt}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are an expert veterinary AI assistant specializing in pig health monitoring. ${fullPrompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 350,
          },
        }),
        signal: controller.signal as AbortSignal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('✅ Gemini response received');
    return responseText;

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

/**
 * Safe wrapper for Gemini
 */
export const safeCallGemini = async (
  context: string,
  prompt: string,
  apiKey: string
): Promise<LLMResponse> => {
  try {
    if (!apiKey) {
      return {
        success: false,
        content: 'Google Gemini API key not provided',
        error: 'MISSING_KEY',
      };
    }

    console.log('🔐 Calling Google Gemini');

    const result = await callGeminiLLM(context, prompt, apiKey);

    return {
      success: true,
      content: result,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('🚨 Gemini error:', errorMsg);

    return {
      success: false,
      content: 'Unable to get analysis from Google Gemini',
      error: errorMsg,
    };
  }
};