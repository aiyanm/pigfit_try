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

export interface HourlyInsightV2 {
  schema_version: 'hourly_insight_v2';
  severity: Severity;
  summary: string;
  confidence: number; // 0..1
  probable_issue: string;
  key_evidence: string[];
  differential_considerations: string[];
  immediate_actions: string[];
  escalation_triggers: string[];
  uncertainty_notes: string[];
}

export interface DailyAssessmentV2 {
  schema_version: 'daily_assessment_v2';
  overall_status: OverallStatus;
  summary: string;
  confidence: number; // 0..1
  probable_issue: string;
  key_evidence: string[];
  differential_considerations: string[];
  immediate_actions: string[];
  monitor_next_24h: string[];
  escalation_triggers: string[];
  uncertainty_notes: string[];
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

const ensureNonEmptyString = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
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

export const parseHourlyInsightV2 = (raw: any): HourlyInsightV2 | null => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schema_version !== 'hourly_insight_v2') return null;
  if (!['normal', 'warning', 'critical'].includes(raw.severity)) return null;
  if (typeof raw.summary !== 'string' || raw.summary.trim().length === 0) return null;
  if (typeof raw.probable_issue !== 'string' || raw.probable_issue.trim().length === 0) return null;

  return {
    schema_version: 'hourly_insight_v2',
    severity: raw.severity,
    summary: raw.summary.trim(),
    confidence: clampConfidence(raw.confidence),
    probable_issue: raw.probable_issue.trim(),
    key_evidence: ensureStringArray(raw.key_evidence),
    differential_considerations: ensureStringArray(raw.differential_considerations),
    immediate_actions: ensureStringArray(raw.immediate_actions),
    escalation_triggers: ensureStringArray(raw.escalation_triggers),
    uncertainty_notes: ensureStringArray(raw.uncertainty_notes),
  };
};

export const parseDailyAssessmentV2 = (raw: any): DailyAssessmentV2 | null => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schema_version !== 'daily_assessment_v2') return null;
  if (!['normal', 'watch', 'critical'].includes(raw.overall_status)) return null;
  if (typeof raw.summary !== 'string' || raw.summary.trim().length === 0) return null;
  if (typeof raw.probable_issue !== 'string' || raw.probable_issue.trim().length === 0) return null;

  return {
    schema_version: 'daily_assessment_v2',
    overall_status: raw.overall_status,
    summary: raw.summary.trim(),
    confidence: clampConfidence(raw.confidence),
    probable_issue: raw.probable_issue.trim(),
    key_evidence: ensureStringArray(raw.key_evidence),
    differential_considerations: ensureStringArray(raw.differential_considerations),
    immediate_actions: ensureStringArray(raw.immediate_actions),
    monitor_next_24h: ensureStringArray(raw.monitor_next_24h),
    escalation_triggers: ensureStringArray(raw.escalation_triggers),
    uncertainty_notes: ensureStringArray(raw.uncertainty_notes),
  };
};

export const parseHourlyInsight = (raw: any): HourlyInsightV2 | HourlyInsightV1 | null =>
  parseHourlyInsightV2(raw) ?? parseHourlyInsightV1(raw);

export const parseDailyAssessment = (raw: any): DailyAssessmentV2 | DailyAssessmentV1 | null =>
  parseDailyAssessmentV2(raw) ?? parseDailyAssessmentV1(raw);

export interface InsightDisplayData {
  status: 'normal' | 'warning' | 'watch' | 'critical';
  confidence: number | null;
  probableIssue: string;
  evidence: string[];
  actions: string[];
  escalation: string;
}

export const toHourlyInsightDisplayData = (
  insight: HourlyInsightV2 | HourlyInsightV1 | null,
  fallback?: Partial<InsightDisplayData>
): InsightDisplayData => {
  if (insight?.schema_version === 'hourly_insight_v2') {
    return {
      status: insight.severity,
      confidence: insight.confidence,
      probableIssue: ensureNonEmptyString(insight.probable_issue, fallback?.probableIssue ?? 'Assessment pending'),
      evidence: insight.key_evidence.slice(0, 3),
      actions: insight.immediate_actions.slice(0, 3),
      escalation: ensureNonEmptyString(insight.escalation_triggers[0], fallback?.escalation ?? 'Continue monitoring'),
    };
  }

  if (insight?.schema_version === 'hourly_insight_v1') {
    return {
      status: insight.severity,
      confidence: insight.confidence,
      probableIssue: ensureNonEmptyString(fallback?.probableIssue, 'Assessment pending'),
      evidence: (insight.key_signals.length > 0 ? insight.key_signals : fallback?.evidence ?? []).slice(0, 3),
      actions: (fallback?.actions ?? []).slice(0, 3),
      escalation: ensureNonEmptyString(fallback?.escalation, 'Continue monitoring'),
    };
  }

  return {
    status: fallback?.status ?? 'warning',
    confidence: fallback?.confidence ?? null,
    probableIssue: ensureNonEmptyString(fallback?.probableIssue, 'Assessment pending'),
    evidence: (fallback?.evidence ?? []).slice(0, 3),
    actions: (fallback?.actions ?? []).slice(0, 3),
    escalation: ensureNonEmptyString(fallback?.escalation, 'Continue monitoring'),
  };
};

export const toDailyAssessmentDisplayData = (
  assessment: DailyAssessmentV2 | DailyAssessmentV1 | null,
  fallback?: Partial<InsightDisplayData>
): InsightDisplayData => {
  if (assessment?.schema_version === 'daily_assessment_v2') {
    return {
      status: assessment.overall_status,
      confidence: assessment.confidence,
      probableIssue: ensureNonEmptyString(assessment.probable_issue, fallback?.probableIssue ?? 'Assessment pending'),
      evidence: assessment.key_evidence.slice(0, 3),
      actions: assessment.immediate_actions.slice(0, 3),
      escalation: ensureNonEmptyString(assessment.escalation_triggers[0], fallback?.escalation ?? 'Continue monitoring'),
    };
  }

  if (assessment?.schema_version === 'daily_assessment_v1') {
    return {
      status: assessment.overall_status,
      confidence: assessment.confidence,
      probableIssue: ensureNonEmptyString(fallback?.probableIssue, 'Assessment pending'),
      evidence: (assessment.key_observations.length > 0 ? assessment.key_observations : fallback?.evidence ?? []).slice(0, 3),
      actions: (fallback?.actions ?? []).slice(0, 3),
      escalation: ensureNonEmptyString(fallback?.escalation, 'Continue monitoring'),
    };
  }

  return {
    status: fallback?.status ?? 'watch',
    confidence: fallback?.confidence ?? null,
    probableIssue: ensureNonEmptyString(fallback?.probableIssue, 'Assessment pending'),
    evidence: (fallback?.evidence ?? []).slice(0, 3),
    actions: (fallback?.actions ?? []).slice(0, 3),
    escalation: ensureNonEmptyString(fallback?.escalation, 'Continue monitoring'),
  };
};

