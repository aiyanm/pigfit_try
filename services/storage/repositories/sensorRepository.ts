import { dbService } from '../db/client';

export const sensorRepository = {
  insert: dbService.insertSensorData.bind(dbService),
  getRange: dbService.getSensorData.bind(dbService),
  deleteOld: dbService.deleteOldData.bind(dbService),
};
