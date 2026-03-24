import { dbService } from '../db/client';

export const aggregateRepository = {
  upsertHourly: dbService.upsertHourlyAggregate.bind(dbService),
  upsertPeriod: dbService.upsertPeriodAggregate.bind(dbService),
  getHourly: dbService.getHourlyAggregates.bind(dbService),
  getPeriod: dbService.getPeriodAggregates.bind(dbService),
};
