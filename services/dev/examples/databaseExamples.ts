/**
 * Example usage of the SQL database service
 * This file demonstrates how to query the combined sensor data table
 */

import { dbService } from '../../storage/db/client';

/**
 * Example 1: Get All Sensor Data
 */
export const getAllSensorDataExample = async () => {
  // Get last 24 hours of all sensor data
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  const sensorData = await dbService.getSensorData(oneDayAgo, now, 'LIVE-PIG-01');
  
  console.log('📊 All Sensor Data (Environmental + Pig Data):');
  sensorData.forEach((record: any) => {
    console.log({
      timestamp: new Date(record.timestamp).toLocaleString(),
      // Environmental data
      envTemp: `${record.env_temp}°C`,
      humidity: `${record.humidity}%`,
      // Pig data
      pigTemp: `${record.temp}°C`,
      activityIntensity: record.activity_intensity.toFixed(2),
      pitchAngle: `${record.pitch_angle.toFixed(1)}°`,
      feed: `${record.feed} kg`,
    });
  });
  
  return sensorData;
};

/**
 * Example 2: Get Only Environmental Fields
 */
export const getEnvironmentalFieldsExample = async () => {
  const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
  const now = Date.now();
  
  const sensorData = await dbService.getSensorData(twelveHoursAgo, now, 'LIVE-PIG-01');
  
  // Filter to show only environmental fields
  console.log('🌡️ Environmental Data Only (from combined table):');
  sensorData.forEach((record: any) => {
    console.log({
      timestamp: new Date(record.timestamp).toLocaleString(),
      envTemp: `${record.env_temp}°C`,
      humidity: `${record.humidity}%`,
    });
  });
  
  return sensorData.map((r: any) => ({
    timestamp: r.timestamp,
    env_temp: r.env_temp,
    humidity: r.humidity,
  }));
};

/**
 * Example 3: Get Only Pig Sensor Fields
 */
export const getPigFieldsExample = async () => {
  const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
  const now = Date.now();
  
  const sensorData = await dbService.getSensorData(twelveHoursAgo, now, 'LIVE-PIG-01');
  
  // Filter to show only pig-specific fields
  console.log('🐷 Pig Data Only (from combined table):');
  sensorData.forEach((record: any) => {
    console.log({
      timestamp: new Date(record.timestamp).toLocaleString(),
      temperature: `${record.temp}°C`,
      activityIntensity: record.activity_intensity.toFixed(2),
      pitchAngle: `${record.pitch_angle.toFixed(1)}°`,
      feed: `${record.feed} kg`,
    });
  });
  
  return sensorData.map((r: any) => ({
    timestamp: r.timestamp,
    temp: r.temp,
    activity_intensity: r.activity_intensity,
    pitch_angle: r.pitch_angle,
    feed: r.feed,
  }));
};

/**
 * Example 4: Get Hourly Aggregates
 */
export const getHourlyAggregatesExample = async () => {
  const today = new Date();
  const startDate = today.toISOString().split('T')[0]; // Today's date
  const endDate = startDate;
  
  const aggregates = await dbService.getHourlyAggregates(startDate, endDate, 'LIVE-PIG-01');
  
  console.log('📈 Hourly Aggregates (Today):');
  aggregates.forEach((record: any) => {
    console.log({
      hour: `${record.hour}:00`,
      avgTemp: `${record.mean_temp?.toFixed(1)}°C`,
      avgEnvTemp: `${record.mean_env_temp?.toFixed(1)}°C`,
      avgHumidity: `${record.mean_humidity?.toFixed(1)}%`,
      avgActivity: record.mean_activity?.toFixed(2),
      thi: record.thi?.toFixed(1),
      lethargyAlert: record.lethargy_alert ? '🚨 YES' : '✅ NO',
    });
  });
  
  return aggregates;
};

/**
 * Example 5: Get Database Statistics
 */
export const getDatabaseStatsExample = async () => {
  const stats = await dbService.getStats();
  
  console.log('📊 Database Statistics:');
  console.log(`  - Sensor data records: ${stats.sensorDataCount}`);
  console.log(`  - Hourly aggregates: ${stats.aggregatesCount}`);
  console.log(`  - Total records: ${stats.sensorDataCount + stats.aggregatesCount}`);
  
  return stats;
};

/**
 * Example 6: Compare Environmental vs Pig Temperature
 */
export const compareTemperaturesExample = async () => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const now = Date.now();
  
  const sensorData = await dbService.getSensorData(oneHourAgo, now, 'LIVE-PIG-01');
  
  console.log('🌡️ Temperature Comparison (Last Hour):');
  console.log(`  Total Records: ${sensorData.length}`);
  
  if (sensorData.length > 0) {
    const avgEnvTemp = sensorData.reduce((sum: number, r: any) => sum + r.env_temp, 0) / sensorData.length;
    const avgPigTemp = sensorData.reduce((sum: number, r: any) => sum + r.temp, 0) / sensorData.length;
    
    console.log(`  Average Environmental Temp: ${avgEnvTemp.toFixed(1)}°C`);
    console.log(`  Average Pig Body Temp: ${avgPigTemp.toFixed(1)}°C`);
    console.log(`  Temperature Difference: ${(avgPigTemp - avgEnvTemp).toFixed(1)}°C`);
  }
};

/**
 * Example 7: Export All Data as CSV
 */
export const exportAllDataAsCSV = async () => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  const sensorData = await dbService.getSensorData(oneDayAgo, now);
  
  // CSV Header (all fields)
  let csv = 'Timestamp,Device ID,Pig ID,Pig Temp (°C),Activity,Pitch (°),Feed (kg),Env Temp (°C),Humidity (%)\n';
  
  // CSV Data
  sensorData.forEach((record: any) => {
    csv += `${new Date(record.timestamp).toISOString()},${record.device_id},${record.pig_id},${record.temp},${record.activity_intensity},${record.pitch_angle},${record.feed},${record.env_temp},${record.humidity}\n`;
  });
  
  console.log('📄 Complete Sensor Data CSV:');
  console.log(csv);
  
  return csv;
};

/**
 * Example 8: Export Only Environmental Data as CSV
 */
export const exportEnvironmentalDataAsCSV = async () => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  const sensorData = await dbService.getSensorData(oneDayAgo, now);
  
  // CSV Header (environmental fields only)
  let csv = 'Timestamp,Device ID,Pig ID,Environmental Temp (°C),Humidity (%)\\n';
  
  // CSV Data
  sensorData.forEach((record: any) => {
    csv += `${new Date(record.timestamp).toISOString()},${record.device_id},${record.pig_id},${record.env_temp},${record.humidity}\\n`;
  });
  
  console.log('📄 Environmental Data CSV:');
  console.log(csv);
  
  return csv;
};

/**
 * Example 9: Export Only Pig Data as CSV
 */
export const exportPigDataAsCSV = async () => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  const sensorData = await dbService.getSensorData(oneDayAgo, now);
  
  // CSV Header (pig fields only)
  let csv = 'Timestamp,Device ID,Pig ID,Body Temp (°C),Activity Intensity,Pitch Angle (°),Feed (kg)\n';
  
  // CSV Data
  sensorData.forEach((record: any) => {
    csv += `${new Date(record.timestamp).toISOString()},${record.device_id},${record.pig_id},${record.temp},${record.activity_intensity},${record.pitch_angle},${record.feed}\n`;
  });
  
  console.log('📄 Pig Data CSV:');
  console.log(csv);
  
  return csv;
};
