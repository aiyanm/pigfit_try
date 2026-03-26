import { dbService } from '../storage/db/client';
import { initializeAIConfig } from '../core/config';
import { logger } from '../core/logger';

export const initializeAppServices = async (): Promise<void> => {
  await dbService.initialize();
  initializeAIConfig({
    deterministicPrimaryProvider: 'groq',
    deterministicFallbackProviders: [],
  });
  logger.info('Service bootstrap complete');
};
