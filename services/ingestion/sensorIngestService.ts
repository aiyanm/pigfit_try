import {
  DEFAULT_FEEDING_SCHEDULE,
  calculateTHI,
  classifyActivityState,
  tagSensorDataPoint,
} from '../diagnostics/metricsService';
import { dbService } from '../storage/db/client';
import type {
  FeedingSchedule,
  HourlyAnalyticsSummary,
  SensorDataPoint,
  TrendPeriod,
} from '../core/types';

export type { SensorDataPoint, TrendPeriod };

let currentPigId = 'LIVE-PIG-01';
const lastSeenHourByPig = new Map<string, number>();
const lastPeriodRefreshAtByPig = new Map<string, number>();
const periodRefreshInFlightByPig = new Set<string>();
const HOUR_MS = 60 * 60 * 1000;
const PERIOD_AGG_REFRESH_THROTTLE_MS = 20 * 1000;
type PeriodRefreshSource = 'ingest' | 'timer';

const PERIOD_DURATION_MS: Record<TrendPeriod, number> = {
  '30m': 30 * 60 * 1000,
  '1h': 1 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
};

const PERIOD_BUCKET_MS: Record<TrendPeriod, number> = {
  '30m': 5 * 60 * 1000,
  '1h': 10 * 60 * 1000,
  '4h': 30 * 60 * 1000,
  '12h': 60 * 60 * 1000,
};

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

const getFeedingScheduleForPig = async (pigId: string): Promise<FeedingSchedule> => {
  const stored = await dbService.getFeedingSchedule(pigId);
  if (stored) {
    return {
      pigId,
      feedingsPerDay: Number(stored.feedings_per_day ?? DEFAULT_FEEDING_SCHEDULE.feedingsPerDay),
      feedingTimes: JSON.parse(String(stored.feeding_times ?? '[]')),
      feedingWindowBeforeMinutes: Number(
        stored.feeding_window_before_minutes ?? DEFAULT_FEEDING_SCHEDULE.feedingWindowBeforeMinutes
      ),
      feedingWindowAfterMinutes: Number(
        stored.feeding_window_after_minutes ?? DEFAULT_FEEDING_SCHEDULE.feedingWindowAfterMinutes
      ),
    };
  }

  await dbService.upsertFeedingSchedule({
    pig_id: pigId,
    feedings_per_day: DEFAULT_FEEDING_SCHEDULE.feedingsPerDay,
    feeding_times: JSON.stringify(DEFAULT_FEEDING_SCHEDULE.feedingTimes),
    feeding_window_before_minutes: DEFAULT_FEEDING_SCHEDULE.feedingWindowBeforeMinutes,
    feeding_window_after_minutes: DEFAULT_FEEDING_SCHEDULE.feedingWindowAfterMinutes,
  });

  return {
    ...DEFAULT_FEEDING_SCHEDULE,
    pigId,
  };
};

const toStoredSensorRow = async (data: SensorDataPoint, deviceId: string, pigId: string) => {
  const tagged = tagSensorDataPoint(data, await getFeedingScheduleForPig(pigId));
  return {
    timestamp: tagged.timestamp,
    device_id: deviceId,
    pig_id: pigId,
    temp: tagged.temp,
    activity_intensity: tagged.activityIntensity,
    activity_state: tagged.activityState,
    pitch_angle: tagged.pitchAngle,
    feeding_posture_detected: tagged.feedingPostureDetected ? 1 : 0,
    env_temp: tagged.envTemp,
    humidity: tagged.humidity,
    thi: tagged.thi ?? null,
    fever_flag: tagged.feverFlag ? 1 : 0,
    lethargy_flag: tagged.lethargyFlag ? 1 : 0,
    heat_stress_flag: tagged.heatStressFlag ? 1 : 0,
    severe_heat_flag: tagged.severeHeatFlag ? 1 : 0,
    within_feeding_window: tagged.withinFeedingWindow ? 1 : 0,
    true_eating_event: tagged.trueEatingEvent ? 1 : 0,
    raw_risk_label: tagged.rawRiskLabel ?? 'normal',
  };
};

const buildHourlyAnalyticsSummaryFromRows = (
  pigId: string,
  bucketStartMs: number,
  rawRows: any[]
): HourlyAnalyticsSummary | null => {
  if (rawRows.length === 0) return null;

  const totals = rawRows.reduce(
    (acc: any, row: any) => ({
      temp: acc.temp + Number(row.temp ?? 0),
      envTemp: acc.envTemp + Number(row.env_temp ?? 0),
      humidity: acc.humidity + Number(row.humidity ?? 0),
      activity: acc.activity + Number(row.activity_intensity ?? 0),
      pitch: acc.pitch + Number(row.pitch_angle ?? 0),
      thi: acc.thi + Number(row.thi ?? calculateTHI(Number(row.env_temp ?? 0), Number(row.humidity ?? 0))),
      fever: acc.fever + Number(row.fever_flag ?? 0),
      heat: acc.heat + Number(row.heat_stress_flag ?? 0),
      severeHeat: acc.severeHeat + Number(row.severe_heat_flag ?? 0),
      lethargy: acc.lethargy + Number(row.lethargy_flag ?? 0),
      eating: acc.eating + Number(row.true_eating_event ?? 0),
      resting: acc.resting + (String(row.activity_state ?? '') === 'Resting/Lethargy' ? 1 : 0),
      standing: acc.standing + (String(row.activity_state ?? '') === 'Standing/Minor Movement' ? 1 : 0),
      distress: acc.distress + (String(row.activity_state ?? '') === 'High Activity/Distress' ? 1 : 0),
    }),
    {
      temp: 0,
      envTemp: 0,
      humidity: 0,
      activity: 0,
      pitch: 0,
      thi: 0,
      fever: 0,
      heat: 0,
      severeHeat: 0,
      lethargy: 0,
      eating: 0,
      resting: 0,
      standing: 0,
      distress: 0,
    }
  );

  const n = rawRows.length;
  const maxTemp = Math.max(...rawRows.map((row) => Number(row.temp ?? 0)));
  const maxTHI = Math.max(
    ...rawRows.map((row) => Number(row.thi ?? calculateTHI(Number(row.env_temp ?? 0), Number(row.humidity ?? 0))))
  );
  const dominantActivityState =
    totals.distress >= totals.standing && totals.distress >= totals.resting
      ? 'High Activity/Distress'
      : totals.standing >= totals.resting
        ? 'Standing/Minor Movement'
        : 'Resting/Lethargy';

  return {
    date: toLocalDateString(bucketStartMs),
    hour: new Date(bucketStartMs).getHours(),
    pigId,
    meanTemp: Math.round((totals.temp / n) * 100) / 100,
    maxTemp: Math.round(maxTemp * 100) / 100,
    meanEnvTemp: Math.round((totals.envTemp / n) * 100) / 100,
    meanHumidity: Math.round((totals.humidity / n) * 100) / 100,
    meanActivity: Math.round((totals.activity / n) * 100) / 100,
    meanPitch: Math.round((totals.pitch / n) * 100) / 100,
    avgTHI: Math.round((totals.thi / n) * 10) / 10,
    maxTHI: Math.round(maxTHI * 10) / 10,
    sampleCount: n,
    feverEventCount: totals.fever,
    heatStressEventCount: totals.heat,
    severeHeatEventCount: totals.severeHeat,
    lethargyEventCount: totals.lethargy,
    trueEatingEventCount: totals.eating,
    restingRatio: Math.round((totals.resting / n) * 100) / 100,
    standingRatio: Math.round((totals.standing / n) * 100) / 100,
    distressRatio: Math.round((totals.distress / n) * 100) / 100,
    dominantActivityState: dominantActivityState as HourlyAnalyticsSummary['dominantActivityState'],
    feedingScheduleAdherence: Math.round((totals.eating / n) * 100) / 100,
    highRiskHourFlag: totals.severeHeat > 0 || totals.fever > 0,
  };
};

export const finalizeHourlyAggregateBucket = async (pigId: string, bucketStartMs: number): Promise<void> => {
  try {
    const rawRows = await dbService.getSensorData(bucketStartMs, bucketStartMs + HOUR_MS - 1, pigId);
    const summary = buildHourlyAnalyticsSummaryFromRows(pigId, bucketStartMs, rawRows);
    if (!summary) return;

    await dbService.upsertHourlyAggregate({
      date: summary.date,
      hour: summary.hour,
      pig_id: pigId,
      mean_temp: summary.meanTemp,
      mean_env_temp: summary.meanEnvTemp,
      mean_humidity: summary.meanHumidity,
      mean_activity: summary.meanActivity,
      mean_pitch: summary.meanPitch,
      sample_count: summary.sampleCount,
      thi: summary.avgTHI,
      lethargy_alert: summary.lethargyEventCount > 0 ? 1 : 0,
      dominant_activity_state: summary.dominantActivityState,
      max_temp: summary.maxTemp,
      max_thi: summary.maxTHI,
      fever_event_count: summary.feverEventCount,
      heat_stress_event_count: summary.heatStressEventCount,
      severe_heat_event_count: summary.severeHeatEventCount,
      true_eating_event_count: summary.trueEatingEventCount,
      resting_ratio: summary.restingRatio,
      standing_ratio: summary.standingRatio,
      distress_ratio: summary.distressRatio,
      feeding_schedule_adherence: summary.feedingScheduleAdherence,
      high_risk_hour_flag: summary.highRiskHourFlag ? 1 : 0,
    });
  } catch (error) {
    console.error('❌ Error finalizing hourly analytics bucket:', error);
  }
};

export const initializeLogger = async (): Promise<void> => {
  try {
    await dbService.initialize();
    console.log('✅ Logger initialized - analytics-first storage is ready');
  } catch (error) {
    console.error('❌ Error initializing logger:', error);
  }
};

export const logSensorData = async (
  data: SensorDataPoint,
  deviceId = 'PigFit_Device',
  pigId = 'LIVE-PIG-01'
): Promise<void> => {
  try {
    currentPigId = pigId;
    const stored = await toStoredSensorRow(data, deviceId, pigId);
    await dbService.insertSensorData(stored);

    const currentHourStart = getHourStartMs(data.timestamp);
    const previousHourStart = currentHourStart - HOUR_MS;
    const lastSeenHourStart = lastSeenHourByPig.get(pigId);

    if (lastSeenHourStart === undefined) {
      await finalizeHourlyAggregateBucket(pigId, previousHourStart);
      lastSeenHourByPig.set(pigId, currentHourStart);
    } else if (currentHourStart > lastSeenHourStart) {
      await finalizeHourlyAggregateBucket(pigId, lastSeenHourStart);
      lastSeenHourByPig.set(pigId, currentHourStart);
    } else if (currentHourStart < lastSeenHourStart) {
      lastSeenHourByPig.set(pigId, currentHourStart);
    }

  } catch (error) {
    console.error('❌ Error logging sensor data:', error);
  }
};

export const loadSensorData = async (periodHours: number, pigId?: string): Promise<SensorDataPoint[]> => {
  try {
    const now = Date.now();
    const sqlData = await dbService.getSensorData(now - periodHours * HOUR_MS, now, pigId);
    return sqlData.map((record: any) => ({
      timestamp: Number(record.timestamp),
      temp: Number(record.temp),
      envTemp: Number(record.env_temp),
      humidity: Number(record.humidity),
      activityIntensity: Number(record.activity_intensity),
      pitchAngle: Number(record.pitch_angle),
      feedingPostureDetected: Number(record.feeding_posture_detected ?? 0) === 1,
      thi: record.thi == null ? undefined : Number(record.thi),
      feverFlag: Number(record.fever_flag ?? 0) === 1,
      lethargyFlag: Number(record.lethargy_flag ?? 0) === 1,
      heatStressFlag: Number(record.heat_stress_flag ?? 0) === 1,
      severeHeatFlag: Number(record.severe_heat_flag ?? 0) === 1,
      withinFeedingWindow: Number(record.within_feeding_window ?? 0) === 1,
      trueEatingEvent: Number(record.true_eating_event ?? 0) === 1,
      activityState: record.activity_state ?? classifyActivityState(Number(record.activity_intensity ?? 0)),
      rawRiskLabel: record.raw_risk_label ?? 'normal',
    }));
  } catch (error) {
    console.error('❌ Error loading sensor data:', error);
    return [];
  }
};

export const cleanupOldLogs = async (daysToKeep = 30): Promise<void> => {
  try {
    await dbService.deleteOldData(daysToKeep);
  } catch (error) {
    console.error('❌ Error cleaning up old data:', error);
  }
};

export const getLogStats = async (): Promise<{ fileCount: number; totalPoints: number }> => {
  const stats = await dbService.getStats();
  return { fileCount: 1, totalPoints: stats.sensorDataCount };
};

export const getDatabaseStats = async () => {
  try {
    const rawData = await loadSensorData(24);
    const hourlyStats = await dbService.getStats();
    return {
      rawSensorRecords: rawData.length,
      hourlyAggregates: hourlyStats.aggregatesCount || 0,
      latestRecord: rawData.length > 0 ? rawData[rawData.length - 1] : null,
      timestamp: new Date().toLocaleTimeString(),
    };
  } catch (error) {
    console.error('❌ Error getting DB stats:', error);
    return null;
  }
};

export const getCurrentHourlyAnalytics = async (pigId: string, bucketDay?: string) => {
  const day = bucketDay ?? toLocalDateString(Date.now());
  const rows = await dbService.getHourlyAggregates(day, day, pigId);
  return rows[rows.length - 1] ?? null;
};

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

export const loadTrendData = async (periodType: TrendPeriod, pigId: string): Promise<SensorDataPoint[]> => {
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
        feedingPostureDetected: false,
      }));
    }

    const periodHoursMap: Record<TrendPeriod, number> = {
      '30m': 0.5,
      '1h': 1,
      '4h': 4,
      '12h': 12,
    };

    return loadSensorData(periodHoursMap[periodType], pigId);
  } catch (error) {
    console.error('❌ Error loading trend data:', error);
    return [];
  }
};

export const getCurrentIngestionPigId = (): string => currentPigId;

export const triggerPeriodAggregateRefresh = (
  pigId: string,
  source: PeriodRefreshSource = 'ingest',
  force = false
): void => {
  const now = Date.now();
  const lastRun = lastPeriodRefreshAtByPig.get(pigId) ?? 0;

  if (periodRefreshInFlightByPig.has(pigId)) return;
  if (!force && now - lastRun < PERIOD_AGG_REFRESH_THROTTLE_MS) return;

  periodRefreshInFlightByPig.add(pigId);
  lastPeriodRefreshAtByPig.set(pigId, now);

  void (async () => {
    try {
      await refreshAllPeriodAggregates(pigId);
    } catch (error) {
      console.error(`❌ Period refresh failed (${source}) for ${pigId}:`, error);
    } finally {
      periodRefreshInFlightByPig.delete(pigId);
    }
  })();
};

export const computeAndStorePeriodAggregates = async (
  pigId: string,
  periodType: TrendPeriod
): Promise<void> => {
  try {
    const now = Date.now();
    const periodStart = now - PERIOD_DURATION_MS[periodType];
    const bucketMs = PERIOD_BUCKET_MS[periodType];
    const rawRows = await dbService.getSensorData(periodStart, now, pigId);
    if (rawRows.length === 0) return;

    const bucketCount = Math.ceil(PERIOD_DURATION_MS[periodType] / bucketMs);
    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = periodStart + i * bucketMs;
      const bucketEnd = bucketStart + bucketMs;
      const points = rawRows.filter((row: any) => row.timestamp >= bucketStart && row.timestamp < bucketEnd);
      if (points.length === 0) continue;

      const summary = buildHourlyAnalyticsSummaryFromRows(pigId, bucketStart, points);
      if (!summary) continue;

      await dbService.upsertPeriodAggregate({
        period_type: periodType,
        bucket_start: bucketStart,
        bucket_end: bucketEnd,
        pig_id: pigId,
        mean_temp: summary.meanTemp,
        mean_env_temp: summary.meanEnvTemp,
        mean_humidity: summary.meanHumidity,
        mean_activity: summary.meanActivity,
        mean_pitch: summary.meanPitch,
        thi: summary.avgTHI,
        lethargy_alert: summary.lethargyEventCount > 0 ? 1 : 0,
        dominant_activity_state: summary.dominantActivityState,
        sample_count: summary.sampleCount,
        max_temp: summary.maxTemp,
        max_thi: summary.maxTHI,
        fever_event_count: summary.feverEventCount,
        heat_stress_event_count: summary.heatStressEventCount,
        severe_heat_event_count: summary.severeHeatEventCount,
        true_eating_event_count: summary.trueEatingEventCount,
        resting_ratio: summary.restingRatio,
        standing_ratio: summary.standingRatio,
        distress_ratio: summary.distressRatio,
      });
    }
  } catch (error) {
    console.error(`❌ Error computing period aggregates for ${pigId} [${periodType}]:`, error);
  }
};

export const refreshAllPeriodAggregates = async (pigId: string): Promise<void> => {
  const periods: TrendPeriod[] = ['30m', '1h', '4h', '12h'];
  for (const period of periods) {
    await computeAndStorePeriodAggregates(pigId, period);
  }
};
