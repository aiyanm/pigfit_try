import type { ActivityState, FeedingSchedule, SensorDataPoint } from '../core/types';

export const FEVER_THRESHOLD_C = 39.5;
export const HEAT_STRESS_THRESHOLD = 75;
export const SEVERE_HEAT_THRESHOLD = 79;
const MINUTES_PER_DAY = 24 * 60;

export const ACTIVITY_THRESHOLDS = {
  LETHARGY_MAX: 1.05,
  DISTRESS_MIN: 2.0,
} as const;

export const DEFAULT_FEEDING_SCHEDULE: FeedingSchedule = {
  pigId: 'default',
  feedingsPerDay: 2,
  feedingTimes: ['06:00', '16:00'],
  feedingWindowBeforeMinutes: 20,
  feedingWindowAfterMinutes: 45,
};

export const isValidScheduleTime = (value: string): boolean => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

export const normalizeScheduleTime = (value: string): string => {
  const [hours, minutes] = value.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
};

const normalizeMinutesOfDay = (value: number): number => {
  const normalized = value % MINUTES_PER_DAY;
  return normalized < 0 ? normalized + MINUTES_PER_DAY : normalized;
};

const isMinuteWithinWindow = (targetMinute: number, startMinute: number, endMinute: number): boolean => {
  const normalizedTarget = normalizeMinutesOfDay(targetMinute);
  const normalizedStart = normalizeMinutesOfDay(startMinute);
  const normalizedEnd = normalizeMinutesOfDay(endMinute);

  if (normalizedStart <= normalizedEnd) {
    return normalizedTarget >= normalizedStart && normalizedTarget <= normalizedEnd;
  }

  return normalizedTarget >= normalizedStart || normalizedTarget <= normalizedEnd;
};

export const parseStoredFeedingSchedule = (
  stored: any | null,
  pigId: string,
  fallback: FeedingSchedule = DEFAULT_FEEDING_SCHEDULE
): FeedingSchedule => {
  let feedingTimes = fallback.feedingTimes;

  try {
    const rawTimes = JSON.parse(String(stored?.feeding_times ?? '[]'));
    if (
      Array.isArray(rawTimes) &&
      rawTimes.length > 0 &&
      rawTimes.every((value) => typeof value === 'string' && isValidScheduleTime(normalizeScheduleTime(value.trim())))
    ) {
      feedingTimes = rawTimes.map((value) => normalizeScheduleTime(value.trim())).sort();
    }
  } catch {
    feedingTimes = fallback.feedingTimes;
  }

  return {
    pigId,
    feedingsPerDay: Number(stored?.feedings_per_day ?? fallback.feedingsPerDay),
    feedingTimes,
    feedingWindowBeforeMinutes: Number(
      stored?.feeding_window_before_minutes ?? fallback.feedingWindowBeforeMinutes
    ),
    feedingWindowAfterMinutes: Number(
      stored?.feeding_window_after_minutes ?? fallback.feedingWindowAfterMinutes
    ),
  };
};

export const calculateTHI = (tempC: number, humidity: number): number => {
  const tempF = (tempC * 9) / 5 + 32;
  const thi = tempF - (0.55 - (0.55 * humidity) / 100) * (tempF - 58);
  return Math.round(thi * 10) / 10;
};

export const classifyActivityState = (amag: number): ActivityState => {
  if (amag >= ACTIVITY_THRESHOLDS.DISTRESS_MIN) return 'High Activity/Distress';
  if (amag >= ACTIVITY_THRESHOLDS.LETHARGY_MAX) return 'Standing/Minor Movement';
  return 'Resting/Lethargy';
};

const toMinutesOfDay = (ts: number): number => {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
};

const parseScheduleTime = (value: string): number => {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return -1;
  return hours * 60 + minutes;
};

export const isWithinFeedingWindow = (
  timestamp: number,
  schedule: FeedingSchedule = DEFAULT_FEEDING_SCHEDULE
): boolean => {
  const targetMinute = toMinutesOfDay(timestamp);
  return schedule.feedingTimes.some((slot) => {
    const scheduledMinute = parseScheduleTime(slot);
    if (scheduledMinute < 0) return false;
    const windowStart = scheduledMinute - schedule.feedingWindowBeforeMinutes;
    const windowEnd = scheduledMinute + schedule.feedingWindowAfterMinutes;
    return isMinuteWithinWindow(targetMinute, windowStart, windowEnd);
  });
};

export const buildRawRiskLabel = (point: Pick<
  SensorDataPoint,
  'temp' | 'activityIntensity' | 'humidity' | 'envTemp'
> & {
  trueEatingEvent: boolean;
}): string => {
  const thi = calculateTHI(point.envTemp, point.humidity);
  if (thi > SEVERE_HEAT_THRESHOLD) return 'severe_heat';
  if (thi >= HEAT_STRESS_THRESHOLD) return 'heat_stress';
  if (point.temp > FEVER_THRESHOLD_C) return 'fever';
  if (point.activityIntensity < ACTIVITY_THRESHOLDS.LETHARGY_MAX) return 'lethargy';
  if (point.trueEatingEvent) return 'feeding_posture';
  return 'normal';
};

export const tagSensorDataPoint = (
  point: SensorDataPoint,
  schedule: FeedingSchedule = DEFAULT_FEEDING_SCHEDULE
): SensorDataPoint => {
  const thi = calculateTHI(point.envTemp, point.humidity);
  const withinFeedingWindow = isWithinFeedingWindow(point.timestamp, schedule);
  const activityState = classifyActivityState(point.activityIntensity);
  const trueEatingEvent = point.feedingPostureDetected && withinFeedingWindow;

  return {
    ...point,
    thi,
    feverFlag: point.temp > FEVER_THRESHOLD_C,
    activityState,
    lethargyFlag: point.activityIntensity < ACTIVITY_THRESHOLDS.LETHARGY_MAX,
    heatStressFlag: thi >= HEAT_STRESS_THRESHOLD,
    severeHeatFlag: thi > SEVERE_HEAT_THRESHOLD,
    withinFeedingWindow,
    trueEatingEvent,
    rawRiskLabel: buildRawRiskLabel({
      ...point,
      trueEatingEvent,
    }),
  };
};
