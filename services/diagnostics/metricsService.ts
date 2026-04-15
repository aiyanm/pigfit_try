import type { ActivityState, FeedingSchedule, SensorDataPoint } from '../core/types';

export const FEVER_THRESHOLD_C = 39.5;
export const HEAT_STRESS_THRESHOLD = 75;
export const SEVERE_HEAT_THRESHOLD = 79;

export const ACTIVITY_THRESHOLDS = {
  LETHARGY_MAX: 1.05,
  DISTRESS_MIN: 2.0,
} as const;

export const FEEDING_WINDOW_MINUTES = 5;

export const DEFAULT_FEEDING_SCHEDULE: FeedingSchedule = {
  pigId: 'default',
  feedingsPerDay: 2,
  feedingTimes: ['06:00', '16:00'],
  feedingWindowBeforeMinutes: 20,
  feedingWindowAfterMinutes: 45,
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
    const windowStart = scheduledMinute;
    const windowEnd = scheduledMinute + FEEDING_WINDOW_MINUTES;
    return targetMinute >= windowStart && targetMinute < windowEnd;
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
