import { dbService } from '../storage/db/client';
import * as analysis from '../ai/analysis/analyzePigHealth';
import * as ingestion from '../ingestion/sensorIngestService';

export const serviceContainer = {
  dbService,
  analysis,
  ingestion,
};
