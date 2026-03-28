/**
 * Groq Setup Verification Test
 *
 * Validates that:
 * - GROQ_API_KEY environment variable is set
 * - Config initializes with the API key
 * - Groq provider can be instantiated
 * - API call works with simple request
 *
 * HOW TO USE:
 * From project root:
 *   node -r ts-node/register services/dev/tests/testGroqSetup.ts
 *
 * Or with dotenv:
 *   node -r dotenv/config -r ts-node/register services/dev/tests/testGroqSetup.ts
 */

import { initializeAIConfig, getGroqApiKey, getAIConfig } from '../../core/config';
import { GroqDeterministicProvider } from '../../ai/providers/groqDeterministicProvider';
import type { StructuredOutputRequest } from '../../ai/providers/contracts';

const log = (message: string, icon: string = '📋') => {
  console.log(`${icon} ${message}`);
};

const success = (message: string) => {
  console.log(`✅ ${message}`);
};

const error = (message: string) => {
  console.error(`❌ ${message}`);
};

const info = (message: string) => {
  console.log(`ℹ️  ${message}`);
};

export const testGroqSetup = async (): Promise<void> => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Groq Setup Verification Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Step 1: Check environment variable
    log('Step 1: Checking GROQ_API_KEY environment variable...');
    const groqKeyRaw = process.env.GROQ_API_KEY;

    if (!groqKeyRaw) {
      error('GROQ_API_KEY not found in environment');
      error('Please set it in your .env file or as an environment variable');
      error('Get a key at: https://console.groq.com/keys');
      process.exit(1);
    }

    const keyPreview = groqKeyRaw.substring(0, 10) + '...' + groqKeyRaw.substring(groqKeyRaw.length - 4);
    success(`Found GROQ_API_KEY: ${keyPreview}`);

    // Step 2: Initialize config
    log('\nStep 2: Initializing AI config...');
    const config = initializeAIConfig();
    success('Config initialized');

    // Step 3: Verify config has Groq key
    log('\nStep 3: Verifying Groq API key in config...');
    const groqKey = getGroqApiKey();
    success('Groq API key loaded in config');

    // Step 4: Check provider configuration
    log('\nStep 4: Checking provider configuration...');
    const aiConfig = getAIConfig();
    info(`Primary provider: ${aiConfig.deterministicPrimaryProvider}`);
    info(`Fallback providers: ${aiConfig.deterministicFallbackProviders.join(', ') || '(none)'}`);
    info(`Groq model: ${aiConfig.deterministicModelByProvider?.groq}`);

    if (aiConfig.deterministicPrimaryProvider !== 'groq') {
      error('Groq is not configured as the primary provider!');
      process.exit(1);
    }
    success('Groq is properly configured as the active provider');

    // Step 5: Test provider instantiation
    log('\nStep 5: Creating Groq provider instance...');
    const provider = new GroqDeterministicProvider();
    success(`Provider created: ${provider.name}`);

    // Step 6: Test API call
    log('\nStep 6: Testing API call (simple health check)...');
    log('Making a test request to Groq API...');

    const testRequest: StructuredOutputRequest = {
      model: 'llama-3.3-70b-versatile',
      system: 'You are a helpful assistant that responds with valid JSON only.',
      context: 'Test context',
      user: 'Return {"status": "ok", "test": true} and nothing else.',
      schemaName: 'groq_setup_test_v1',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string' },
          test: { type: 'boolean' },
        },
        required: ['status', 'test'],
      },
      temperature: 0.1,
      maxTokens: 100,
    };

    const result = await provider.generateStructured(testRequest);

    success('API call successful!');
    info(`Raw response: ${result.rawText.substring(0, 100)}...`);

    if (result.parsed) {
      success('JSON parsing successful');
      info(`Parsed data: ${JSON.stringify(result.parsed).substring(0, 100)}...`);
    } else {
      info('Note: JSON parsing returned undefined (response might not be valid JSON)');
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Groq Setup Verification Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🎯 Next steps:');
    console.log('   1. Replace placeholder API key in .env with your actual Groq key');
    console.log('   2. Run: npm start (to restart with new environment variables)');
    console.log('   3. Groq will be used for deterministic insights\n');

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    error(`Test failed: ${errorMsg}`);

    if (errorMsg.includes('Groq API key not configured')) {
      error('GROQ_API_KEY environment variable is set but not loaded properly.');
      error('Make sure your .env file is in the project root and contains:');
      error('  GROQ_API_KEY=gsk_your_key_here');
    }

    process.exit(1);
  }
};

// Run test if called directly
if (require.main === module) {
  testGroqSetup().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}

export default testGroqSetup;
