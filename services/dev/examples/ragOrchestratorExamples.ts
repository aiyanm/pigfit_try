/**
 * RAG Orchestration - Usage Examples (Groq Only)
 * Shows how to use the RAG orchestration layer
 */

import {
  analyzepigHealth,
  analyzepigHealthStream,
  analyzePigGroupHealth,
  clearOrchestratorCache,
  validateOrchestratorConfig,
  estimateCost,
} from '../../ai/analysis/analyzePigHealth';

import {
  initializeRAGConfig,
  getGroqApiKey,
  setGroqApiKey,
  getRAGConfig,
} from '../../core/config';

/**
 * EXAMPLE 1: Simple analysis
 */
export const example1_SimpleAnalysis = async (pigId: string) => {
  try {
    // Initialize once at app startup
    initializeRAGConfig({
      debug: true,
      timeWindow: 'last_24h',
    });

    // Set Groq API key (from env or parameter)
    setGroqApiKey(process.env.GROQ_API_KEY || 'your-groq-api-key');

    // Analyze pig
    const result = await analyzepigHealth(pigId);

    if (result.success) {
      console.log(`✅ Analysis for pig ${pigId}:`);
      console.log(result.analysis);
      console.log(`\nExecution time: ${result.executionTime}ms`);
      console.log(`Cost: $${estimateCost().toFixed(4)} (Groq is free!)`);
    } else {
      console.error(`❌ Analysis failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

/**
 * EXAMPLE 2: Different time windows
 */
export const example2_DifferentTimeWindows = async (pigId: string) => {
  try {
    const windows = ['last_hour' as const, 'last_24h' as const, 'last_7d' as const];

    for (const window of windows) {
      console.log(`\n🔍 Analyzing ${window}...`);
      const result = await analyzepigHealth(pigId, window);

      if (result.success) {
        console.log(`✅ ${window}: ${result.analysis.substring(0, 100)}...`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

/**
 * EXAMPLE 3: Streaming analysis
 */
export const example3_StreamingAnalysis = async (pigId: string) => {
  try {
    console.log(`🔄 Streaming analysis for pig ${pigId}...\n`);

    let fullContent = '';

    // Stream chunks as they arrive
    for await (const chunk of analyzepigHealthStream(pigId)) {
      process.stdout.write(chunk);
      fullContent += chunk;
    }

    console.log('\n\n✅ Streaming complete');
  } catch (error) {
    console.error('Streaming error:', error);
  }
};

/**
 * EXAMPLE 4: Batch analysis of multiple pigs
 */
export const example4_BatchAnalysis = async (pigIds: string[]) => {
  try {
    console.log(`🐷 Analyzing ${pigIds.length} pigs...`);

    const results = await analyzePigGroupHealth(pigIds);

    // Summary
    const successful = results.filter(r => r.success).length;
    const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);
    const totalTokens = results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);

    console.log(`\n📊 Batch Summary:`);
    console.log(`  - Successful: ${successful}/${results.length}`);
    console.log(`  - Total time: ${totalTime}ms`);
    console.log(`  - Total tokens: ${totalTokens}`);
    console.log(`  - Cost: $0.00 (Groq is free!)`);

    // Results breakdown
    results.forEach((result, index) => {
      console.log(`\n  [${index + 1}] Pig ${result.pigId}:`);
      console.log(`     Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
      if (!result.success) {
        console.log(`     Error: ${result.error}`);
      }
    });
  } catch (error) {
    console.error('Error:', error);
  }
};

/**
 * EXAMPLE 5: Error handling and validation
 */
export const example5_ErrorHandling = async (pigId: string) => {
  try {
    // Validate configuration before use
    const validation = validateOrchestratorConfig();
    if (!validation.valid) {
      console.log('❌ Validation failed:');
      validation.errors.forEach(err => console.log(`   - ${err}`));
      return;
    }

    const result = await analyzepigHealth(pigId);
    if (result.success) {
      console.log(result.analysis);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`🚨 Error: ${errorMsg}`);
  }
};

/**
 * EXAMPLE 6: Caching and cache management
 */
export const example6_CachingAndPerformance = async (pigId: string) => {
  try {
    console.log('🔄 First call (not cached)...');
    const start1 = Date.now();
    const result1 = await analyzepigHealth(pigId);
    const time1 = Date.now() - start1;
    console.log(
      `   Time: ${time1}ms, Cache hit: ${result1.cacheHit ? 'Yes' : 'No'}`
    );

    console.log('\n🔄 Second call (should hit cache)...');
    const start2 = Date.now();
    const result2 = await analyzepigHealth(pigId);
    const time2 = Date.now() - start2;
    console.log(
      `   Time: ${time2}ms, Cache hit: ${result2.cacheHit ? 'Yes' : 'No'}`
    );

    console.log(`\n   Speed improvement: ${((1 - time2 / time1) * 100).toFixed(0)}%`);

    // Clear cache for next run
    clearOrchestratorCache();
    console.log('\n🧹 Cache cleared');
  } catch (error) {
    console.error('Error:', error);
  }
};

/**
 * EXAMPLE 7: React Native Integration
 * Shows how to use in a React Native component
 */
export const example7_ReactNativeUsage = () => {
  // Pseudocode for React Native component
  const UseRAGAnalysis = () => {
    // const [analysis, setAnalysis] = useState('');
    // const [loading, setLoading] = useState(false);
    // const [error, setError] = useState('');

    // const handleAnalyze = async (pigId: string) => {
    //   setLoading(true);
    //   try {
    //     const result = await analyzepigHealth(pigId);

    //     if (result.success) {
    //       setAnalysis(result.analysis);
    //     } else {
    //       setError(result.error || 'Analysis failed');
    //     }
    //   } catch (err) {
    //     setError(err instanceof Error ? err.message : 'Unknown error');
    //   } finally {
    //     setLoading(false);
    //   }
    // };

    // return (
    //   <View>
    //     <Button title="Analyze" onPress={() => handleAnalyze('PIG_001')} />
    //     {loading && <Text>Analyzing...</Text>}
    //     {error && <Text style={{ color: 'red' }}>{error}</Text>}
    //     {analysis && <ScrollView><Text>{analysis}</Text></ScrollView>}
    //   </View>
    // );
  };

  return UseRAGAnalysis;
};

/**
 * EXAMPLE 8: Real-time streaming for UI
 * React Native component with real-time updates
 */
export const example8_StreamingWithUI = () => {
  // Pseudocode for streaming component
  const UseRAGStreamingAnalysis = () => {
    // const [streamContent, setStreamContent] = useState('');
    // const [streaming, setStreaming] = useState(false);

    // const handleAnalyzeStream = async (pigId: string) => {
    //   setStreaming(true);
    //   setStreamContent('');
    //   try {
    //     for await (const chunk of analyzepigHealthStream(pigId)) {
    //       setStreamContent(prev => prev + chunk);
    //     }
    //   } catch (err) {
    //     console.error('Streaming error:', err);
    //   } finally {
    //     setStreaming(false);
    //   }
    // };

    // return (
    //   <ScrollView>
    //     {streaming && <ActivityIndicator />}
    //     <Text>{streamContent}</Text>
    //   </ScrollView>
    // );
  };

  return UseRAGStreamingAnalysis;
};
