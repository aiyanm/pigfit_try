export type Severity = 'normal' | 'warning' | 'critical';
export type OverallStatus = 'normal' | 'watch' | 'critical';
export type RowStatus = 'success' | 'failed';

export interface HourlyInsightV1 {
  schema_version: 'hourly_insight_v1';
  severity: Severity;
  summary: string;
  confidence: number; // 0..1
  key_signals: string[];
}

export interface DailyAssessmentV1 {
  schema_version: 'daily_assessment_v1';
  overall_status: OverallStatus;
  summary: string;
  confidence: number; // 0..1
  key_observations: string[];
}

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export const clampConfidence = (n: unknown): number => {
  if (!isFiniteNumber(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 100) / 100;
};

const ensureStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string').slice(0, 8);
};

export const parseHourlyInsightV1 = (raw: any): HourlyInsightV1 | null => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schema_version !== 'hourly_insight_v1') return null;
  if (!['normal', 'warning', 'critical'].includes(raw.severity)) return null;
  if (typeof raw.summary !== 'string' || raw.summary.trim().length === 0) return null;

  return {
    schema_version: 'hourly_insight_v1',
    severity: raw.severity,
    summary: raw.summary.trim(),
    confidence: clampConfidence(raw.confidence),
    key_signals: ensureStringArray(raw.key_signals),
  };
};

export const parseDailyAssessmentV1 = (raw: any): DailyAssessmentV1 | null => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schema_version !== 'daily_assessment_v1') return null;
  if (!['normal', 'watch', 'critical'].includes(raw.overall_status)) return null;
  if (typeof raw.summary !== 'string' || raw.summary.trim().length === 0) return null;

  return {
    schema_version: 'daily_assessment_v1',
    overall_status: raw.overall_status,
    summary: raw.summary.trim(),
    confidence: clampConfidence(raw.confidence),
    key_observations: ensureStringArray(raw.key_observations),
  };
};

