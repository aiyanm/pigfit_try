export type PigId = 'LIVE-PIG-01' | 'LIVE-PIG-02' | 'LIVE-PIG-03';

export type AnalysisWindow = 'last_hour' | 'last_24h' | 'last_7d';

export type TrendPeriod = '30m' | '1h' | '4h' | '12h';

export type ActivityState = 'Resting/Lethargy' | 'Standing/Minor Movement' | 'High Activity/Distress';

export interface SensorDataPoint {
  timestamp: number;
  temp: number;
  envTemp: number;
  humidity: number;
  activityIntensity: number;
  pitchAngle: number;
  accelX?: number;
  accelY?: number;
  accelZ?: number;
  gyroX?: number;
  gyroY?: number;
  gyroZ?: number;
  feedingPostureDetected: boolean;
  thi?: number;
  feverFlag?: boolean;
  lethargyFlag?: boolean;
  heatStressFlag?: boolean;
  severeHeatFlag?: boolean;
  withinFeedingWindow?: boolean;
  trueEatingEvent?: boolean;
  activityState?: ActivityState;
  rawRiskLabel?: string;
}

export interface FeedingSchedule {
  pigId: string;
  feedingsPerDay: number;
  feedingTimes: string[];
  feedingWindowBeforeMinutes: number;
  feedingWindowAfterMinutes: number;
}

export interface HourlyAnalyticsSummary {
  date: string;
  hour: number;
  pigId: string;
  meanTemp: number;
  maxTemp: number;
  meanEnvTemp: number;
  meanHumidity: number;
  meanActivity: number;
  meanPitch: number;
  avgTHI: number;
  maxTHI: number;
  sampleCount: number;
  feverEventCount: number;
  heatStressEventCount: number;
  severeHeatEventCount: number;
  lethargyEventCount: number;
  trueEatingEventCount: number;
  restingRatio: number;
  standingRatio: number;
  distressRatio: number;
  dominantActivityState: ActivityState;
  feedingScheduleAdherence: number;
  highRiskHourFlag: boolean;
}

export interface ServiceHealth {
  ready: boolean;
  details?: string;
}
