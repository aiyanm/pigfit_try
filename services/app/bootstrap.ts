import { dbService } from '../storage/db/client';
import { initializeAIConfig } from '../core/config';
import { logger } from '../core/logger';
import { getDeterministicProviderOrder } from '../ai/providers/providerFactory';

export const initializeAppServices = async (): Promise<void> => {
  await dbService.initialize();
  initializeAIConfig({
    deterministicPrimaryProvider: 'groq',
    deterministicFallbackProviders: [],
  });
  const providerOrder = getDeterministicProviderOrder();
  logger.info(`Deterministic providers active: ${providerOrder.join(' -> ') || 'none'}`);
  logger.info('Service bootstrap complete');
};
