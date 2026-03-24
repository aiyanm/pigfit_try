export type PigId = 'LIVE-PIG-01' | 'LIVE-PIG-02' | 'LIVE-PIG-03';

export type AnalysisWindow = 'last_hour' | 'last_24h' | 'last_7d';

export type TrendPeriod = '30m' | '1h' | '4h' | '12h';

export interface SensorDataPoint {
  timestamp: number;
  temp: number;
  envTemp: number;
  humidity: number;
  activityIntensity: number;
  pitchAngle: number;
  feed: number;
}

export interface ServiceHealth {
  ready: boolean;
  details?: string;
}
