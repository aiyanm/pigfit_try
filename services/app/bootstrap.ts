import { dbService } from '../storage/db/client';
import { initializeRAGConfig } from '../core/config';
import { logger } from '../core/logger';

export const initializeAppServices = async (): Promise<void> => {
  await dbService.initialize();
  initializeRAGConfig();
  logger.info('Service bootstrap complete');
};
