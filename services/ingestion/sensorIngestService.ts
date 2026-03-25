import { generateContextualInputs, classifyActivityState, calculateTHI, checkLethargy } from '../diagnostics/metricsService';
import { dbService } from '../storage/db/client';
import { runDailyAssessmentForDay, runHourlyInsightForBucket } from '../ai/deterministic/orchestrator';
import { isDeterministicEnabled } from '../core/config';
import type { SensorDataPoint, TrendPeriod } from '../core/types';

// Re-export shared domain types for backward compatibility with legacy imports.
export type { SensorDataPoint, TrendPeriod };

// Current device and pig IDs
let currentDeviceId: string = 'PigFit_Device';
let currentPigId: string = 'LIVE-PIG-01';
const lastSeenHourByPig = new Map<string, number>();
const HOUR_MS = 60 * 60 * 1000;

const toLocalDateString = (ms: number): string => {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getHourStartMs = (ts: number): number => {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime();
};

const buildHourlyAggregateFromRows = (pigId: string, bucketStartMs: number, rawRows: any[]) => {
  if (rawRows.length === 0) return null;

  const sums = rawRows.reduce(
    (acc: any, row: any) => ({
      temp: acc.temp + (row.temp ?? 0),
      envTemp: acc.envTemp + (row.env_temp ?? 0),
      humidity: acc.humidity + (row.humidity ?? 0),
      activity: acc.activity + (row.activity_intensity ?? 0),
      pitch: acc.pitch + (row.pitch_angle ?? 0),
      feed: acc.feed + (row.feed ?? 0),
    }),
    { temp: 0, envTemp: 0, humidity: 0, activity: 0, pitch: 0, feed: 0 }
  );

  const n = rawRows.length;
  const meanTemp = sums.temp / n;
  const meanEnvTemp = sums.envTemp / n;
  const meanHumidity = sums.humidity / n;
  const meanActivity = sums.activity / n;
  const meanPitch = sums.pitch / n;
  const meanFeed = sums.feed / n;
  const hour = new Date(bucketStartMs).getHours();

  return {
    date: toLocalDateString(bucketStartMs),
    hour,
    pig_id: pigId,
    mean_temp: Math.round(meanTemp * 100) / 100,
    mean_env_temp: Math.round(meanEnvTemp * 100) / 100,
    mean_humidity: Math.round(meanHumidity * 100) / 100,
    mean_activity: Math.round(meanActivity * 100) / 100,
    mean_pitch: Math.round(meanPitch * 100) / 100,
    mean_feed: Math.round(meanFeed * 100) / 100,
    sample_count: n,
    thi: Math.round(calculateTHI(meanEnvTemp, meanHumidity) * 10) / 10,
    lethargy_alert: checkLethargy(meanActivity, hour) ? 1 : 0,
    dominant_activity_state: classifyActivityState(meanActivity),
  };
};

/**
 * Finalize and upsert one closed hourly bucket from raw sensor_data.
 * Exported for deterministic pipeline and test helpers.
 */
export const finalizeHourlyAggregateBucket = async (pigId: string, bucketStartMs: number): Promise<void> => {
  try {
    const bucketEndMs = bucketStartMs + HOUR_MS - 1;
    const rawRows = await dbService.getSensorData(bucketStartMs, bucketEndMs, pigId);
    const aggregate = buildHourlyAggregateFromRows(pigId, bucketStartMs, rawRows);

    if (!aggregate) {
      return;
    }

    await dbService.upsertHourlyAggregate(aggregate);
    console.log(`✅ Finalized hourly aggregate for ${pigId} @ ${aggregate.date} ${aggregate.hour}:00 (${aggregate.sample_count} samples)`);
  } catch (error) {
    console.error('❌ Error finalizing hourly aggregate bucket:', error);
  }
};

const runDeterministicForClosedHour = async (pigId: string, closedHourStartMs: number): Promise<void> => {
  if (!isDeterministicEnabled()) return;
  try {
    await runHourlyInsightForBucket(pigId, closedHourStartMs);
    await runDailyAssessmentForDay(pigId, toLocalDateString(closedHourStartMs));
  } catch (error) {
    console.error('❌ Error running deterministic pipeline for closed hour:', error);
  }
};

/**
 * Initialize the logging system (database only)
 * All data is stored in SQLite on Android internal storage
 */
export const initializeLogger = async (): Promise<void> => {
  try {
    // Initialize SQL database (stores data on Android internal storage)
    await dbService.initialize();
    console.log('✅ Logger initialized - Data will be stored on Android device');
  } catch (error) {
    console.error('❌ Error initializing logger:', error);
    // Don't throw - allow app to continue, will retry on next data insert
  }
};

/**
 * Log a new sensor data point to the database
 * Stores ALL individual readings for detailed analysis
 */
export const logSensorData = async (
  data: SensorDataPoint,
  deviceId: string = 'PigFit_Device',
  pigId: string = 'LIVE-PIG-01'
): Promise<void> => {
  try {
    // Update current device and pig IDs
    currentDeviceId = deviceId;
    currentPigId = pigId;

    // === DATABASE LOGGING (ALL INDIVIDUAL READINGS) ===
    // Store every single reading in SQLite database on Android device
    await dbService.insertSensorData({
      timestamp: data.timestamp,
      device_id: deviceId,
      pig_id: pigId,
      temp: data.temp,
      activity_intensity: data.activityIntensity,
      activity_state: classifyActivityState(data.activityIntensity),
      pitch_angle: data.pitchAngle,
      feed: data.feed,
      env_temp: data.envTemp,
      humidity: data.humidity,
    });

    // Hour-close finalization:
    // when we enter a new hour, finalize the previous hour's bucket for this pig.
    const currentHourStart = getHourStartMs(data.timestamp);
    const previousHourStart = currentHourStart - HOUR_MS;
    const lastSeenHourStart = lastSeenHourByPig.get(pigId);

    if (lastSeenHourStart === undefined) {
      // Best-effort catch-up on app restart: finalize prior closed hour once.
      await finalizeHourlyAggregateBucket(pigId, previousHourStart);
      await runDeterministicForClosedHour(pigId, previousHourStart);
      lastSeenHourByPig.set(pigId, currentHourStart);
    } else if (currentHourStart > lastSeenHourStart) {
      await finalizeHourlyAggregateBucket(pigId, lastSeenHourStart);
      await runDeterministicForClosedHour(pigId, lastSeenHourStart);
      lastSeenHourByPig.set(pigId, currentHourStart);
    } else if (currentHourStart < lastSeenHourStart) {
      // Handle clock skew or out-of-order packets by moving marker backward.
      lastSeenHourByPig.set(pigId, currentHourStart);
    }

    console.log('✅ Sensor data stored in database');
    
  } catch (error) {
    console.error('❌ Error logging sensor data:', error);
  }
};

/**
 * Stage 2: Temporal Aggregation
 * Calculates hourly means for all variables from sensor data points
 */
const summarizeHourlyData = (hour: number, dataPoints: SensorDataPoint[]) => {
  if (dataPoints.length === 0) return undefined;

  const sum = dataPoints.reduce((acc, p) => ({
    temp: acc.temp + p.temp,
    envTemp: acc.envTemp + p.envTemp,
    humidity: acc.humidity + p.humidity,
    activity: acc.activity + p.activityIntensity,
    pitch: acc.pitch + p.pitchAngle,
    feed: acc.feed + p.feed,
  }), { temp: 0, envTemp: 0, humidity: 0, activity: 0, pitch: 0, feed: 0 });

  const count = dataPoints.length;
  const means = {
    meanTemp: sum.temp / count,
    meanEnvTemp: sum.envTemp / count,
    meanHumidity: sum.humidity / count,
    meanActivity: sum.activity / count,
    meanPitch: sum.pitch / count,
    meanFeed: sum.feed / count,
  };

  // Stage 3: Contextual Input Generation
  const contextual = generateContextualInputs(
    hour, 
    means.meanTemp, 
    means.meanEnvTemp, 
    means.meanHumidity, 
    means.meanActivity
  );

  // Classify the hourly mean activity into a behavioral state
  const dominantActivityState = classifyActivityState(means.meanActivity);

  return {
    ...means,
    ...contextual,
    dominantActivityState,
  };
};

/**
 * Load sensor data for a specific time period
 * Loads all individual readings from the SQL database
 */
export const loadSensorData = async (
  periodHours: number,
  pigId?: string
): Promise<SensorDataPoint[]> => {
  try {
    const now = Date.now();
    const startTime = now - (periodHours * 60 * 60 * 1000);
    
    // Load from SQL database (has all individual readings)
    const sqlData = await dbService.getSensorData(startTime, now, pigId);
    
    // Convert SQL format to SensorDataPoint format
    const dataPoints: SensorDataPoint[] = sqlData.map((record: any) => ({
      timestamp: record.timestamp,
      temp: record.temp,
      envTemp: record.env_temp,
      humidity: record.humidity,
      activityIntensity: record.activity_intensity,
      pitchAngle: record.pitch_angle,
      feed: record.feed,
    }));
    
    console.log(`📊 Loaded ${dataPoints.length} sensor data points from the last ${periodHours} hours`);
    return dataPoints;
  } catch (error) {
    console.error('❌ Error loading sensor data:', error);
    return [];
  }
};

/**
 * Delete old sensor data from database
 */
export const cleanupOldLogs = async (daysToKeep: number = 30): Promise<void> => {
  try {
    const deletedCount = await dbService.deleteOldData(daysToKeep);
    console.log(`🗑️ Deleted ${deletedCount} old sensor records (older than ${daysToKeep} days)`);
  } catch (error) {
    console.error('❌ Error cleaning up old data:', error);
  }
};

/**
 * Get database statistics
 */
export const getLogStats = async (): Promise<{ fileCount: number; totalPoints: number }> => {
  try {
    const stats = await dbService.getStats();
    console.log(`📊 Database Stats: ${stats.sensorDataCount} sensor readings, ${stats.aggregatesCount} hourly aggregates`);
    return { fileCount: 1, totalPoints: stats.sensorDataCount }; // Return combined stats
  } catch (error) {
    console.error('❌ Error getting log stats:', error);
    return { fileCount: 0, totalPoints: 0 };
  }
};

/**
 * Get real-time database statistics for debug panel
 */
export const getDatabaseStats = async () => {
  try {
    // Get raw sensor records from last 24 hours
    const rawData = await loadSensorData(24);
    
    // Get hourly aggregates count
    const hourlyStats = await dbService.getStats();
    
    const stats = {
      rawSensorRecords: rawData.length,
      hourlyAggregates: hourlyStats.aggregatesCount || 0,
      latestRecord: rawData.length > 0 ? rawData[rawData.length - 1] : null,
      timestamp: new Date().toLocaleTimeString(),
    };
    
    console.log('📊 DB STATS:', stats);
    return stats;
  } catch (error) {
    console.error('❌ Error getting DB stats:', error);
    return null;
  }
};

/**
 * Get deterministic outputs for UI consumption.
 */
export const getDeterministicInsights = async (pigId: string, bucketDay?: string) => {
  try {
    const day = bucketDay ?? toLocalDateString(Date.now());
    const [hourly, daily] = await Promise.all([
      dbService.getHourlyInsightsByDate(pigId, day),
      dbService.getDailyAssessment(pigId, day),
    ]);

    return {
      bucketDay: day,
      hourlyInsights: hourly,
      dailyAssessment: daily,
    };
  } catch (error) {
    console.error('❌ Error getting deterministic insights:', error);
    return {
      bucketDay: bucketDay ?? toLocalDateString(Date.now()),
      hourlyInsights: [],
      dailyAssessment: null,
    };
  }
};

// ─── Period Aggregate Config ─────────────────────────────────────────────────────

/**
 * Duration of the full window (ms) per timeframe
 */
const PERIOD_DURATION_MS: Record<TrendPeriod, number> = {
  '30m': 30 * 60 * 1000,
  '1h':   1 * 60 * 60 * 1000,
  '4h':   4 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
};

/**
 * Bucket size (ms) per timeframe — controls chart resolution:
 *   30m  → 5-min buckets  → 6 data points
 *   1h   → 10-min buckets → 6 data points
 *   4h   → 30-min buckets → 8 data points
 *   12h  → 60-min buckets → 12 data points
 */
const PERIOD_BUCKET_MS: Record<TrendPeriod, number> = {
  '30m':  5 * 60 * 1000,
  '1h':  10 * 60 * 1000,
  '4h':  30 * 60 * 1000,
  '12h': 60 * 60 * 1000,
};

/**
 * Load chart-ready trend points.
 * Prefers pre-bucketed period_aggregates; falls back to raw sensor_data if empty.
 */
export const loadTrendData = async (
  periodType: TrendPeriod,
  pigId: string
): Promise<SensorDataPoint[]> => {
  try {
    const now = Date.now();
    const periodStart = now - PERIOD_DURATION_MS[periodType];
    const aggregateRows = await dbService.getPeriodAggregates(periodType, pigId);
    const windowRows = aggregateRows.filter((row: any) => row.bucket_start >= periodStart);

    if (windowRows.length > 0) {
      return windowRows.map((row: any) => ({
        timestamp: row.bucket_start,
        temp: row.mean_temp ?? 0,
        envTemp: row.mean_env_temp ?? 0,
        humidity: row.mean_humidity ?? 0,
        activityIntensity: row.mean_activity ?? 0,
        pitchAngle: row.mean_pitch ?? 0,
        feed: row.mean_feed ?? 0,
      }));
    }

    const periodHoursMap: Record<TrendPeriod, number> = {
      '30m': 0.5,
      '1h': 1,
      '4h': 4,
      '12h': 12,
    };

    console.log(`⚠️ No period aggregates for ${pigId} [${periodType}], using raw fallback`);
    return loadSensorData(periodHoursMap[periodType], pigId);
  } catch (error) {
    console.error('❌ Error loading trend data:', error);
    return [];
  }
};

/**
 * Compute and store period aggregates for a specific pig and timeframe.
 *
 * Flow:
 *   1. Load raw sensor_data for the full period window
 *   2. Split into fixed-size buckets
 *   3. Compute means + classify activity state per bucket
 *   4. Upsert each bucket into period_aggregates
 *
 * Call this after each BLE reading OR on a timer (e.g. every 5 minutes).
 */
export const computeAndStorePeriodAggregates = async (
  pigId: string,
  periodType: TrendPeriod
): Promise<void> => {
  try {
    const now = Date.now();
    const windowMs = PERIOD_DURATION_MS[periodType];
    const bucketMs = PERIOD_BUCKET_MS[periodType];
    const periodStart = now - windowMs;

    // Load ALL raw sensor readings for this pig inside the window
    const rawRows = await dbService.getSensorData(periodStart, now, pigId);

    if (rawRows.length === 0) {
      console.log(`⚠️ No raw data for pig ${pigId} in ${periodType} window`);
      return;
    }

    // Build bucket boundaries (oldest → newest)
    const bucketCount = Math.ceil(windowMs / bucketMs);

    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = periodStart + i * bucketMs;
      const bucketEnd   = bucketStart + bucketMs;

      // Filter readings that fall inside this bucket
      const points = rawRows.filter(
        (r: any) => r.timestamp >= bucketStart && r.timestamp < bucketEnd
      );

      if (points.length === 0) continue; // skip empty buckets

      // Compute means in a single pass
      const sums = points.reduce(
        (acc: any, p: any) => ({
          temp:     acc.temp     + (p.temp               ?? 0),
          envTemp:  acc.envTemp  + (p.env_temp           ?? 0),
          humidity: acc.humidity + (p.humidity           ?? 0),
          activity: acc.activity + (p.activity_intensity ?? 0),
          pitch:    acc.pitch    + (p.pitch_angle        ?? 0),
          feed:     acc.feed     + (p.feed               ?? 0),
        }),
        { temp: 0, envTemp: 0, humidity: 0, activity: 0, pitch: 0, feed: 0 }
      );

      const n = points.length;
      const meanTemp     = sums.temp     / n;
      const meanEnvTemp  = sums.envTemp  / n;
      const meanHumidity = sums.humidity / n;
      const meanActivity = sums.activity / n;
      const meanPitch    = sums.pitch    / n;
      const meanFeed     = sums.feed     / n;

      // Derive health indicators from the bucket
      const thi          = calculateTHI(meanEnvTemp, meanHumidity);
      const bucketHour   = new Date(bucketStart).getHours();
      const lethargyFlag = checkLethargy(meanActivity, bucketHour) ? 1 : 0;
      const actState     = classifyActivityState(meanActivity);

      await dbService.upsertPeriodAggregate({
        period_type:             periodType,
        bucket_start:            bucketStart,
        bucket_end:              bucketEnd,
        pig_id:                  pigId,
        mean_temp:               Math.round(meanTemp     * 100) / 100,
        mean_env_temp:           Math.round(meanEnvTemp  * 100) / 100,
        mean_humidity:           Math.round(meanHumidity * 100) / 100,
        mean_activity:           Math.round(meanActivity * 100) / 100,
        mean_pitch:              Math.round(meanPitch    * 100) / 100,
        mean_feed:               Math.round(meanFeed     * 100) / 100,
        thi:                     Math.round(thi * 10) / 10,
        lethargy_alert:          lethargyFlag,
        dominant_activity_state: actState,
        sample_count:            n,
      });
    }

    console.log(`✅ Period aggregates updated for pig ${pigId} [${periodType}]`);
  } catch (error) {
    console.error(`❌ Error computing period aggregates for ${pigId} [${periodType}]:`, error);
  }
};

/**
 * Convenience: recompute all 4 timeframes for a pig at once.
 * Call after receiving a new BLE reading.
 */
export const refreshAllPeriodAggregates = async (pigId: string): Promise<void> => {
  const periods: TrendPeriod[] = ['30m', '1h', '4h', '12h'];
  for (const period of periods) {
    await computeAndStorePeriodAggregates(pigId, period);
  }
};
