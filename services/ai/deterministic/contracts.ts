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
  status: 'normal' | 'watch' | 'critical';
  summary: string;
  observedPattern: string;
  keyEvidence: string[];
  recommendedAction: string[];
  escalationNote: string;
  monitorNext?: string[];
  dataQualityNote?: string;
}

const normalizeInsightStatus = (status: unknown): InsightDisplayData['status'] => {
  if (status === 'critical') return 'critical';
  if (status === 'warning' || status === 'watch') return 'watch';
  return 'normal';
};

const deriveDataQualityNote = (
  parsedValue: HourlyInsightV2 | HourlyInsightV1 | DailyAssessmentV2 | DailyAssessmentV1 | null,
  fallback?: Partial<InsightDisplayData>
): string | undefined => {
  if (!parsedValue) {
    return fallback?.dataQualityNote ?? 'Assessment unavailable for this period';
  }

  if ('uncertainty_notes' in parsedValue && parsedValue.uncertainty_notes.length > 0) {
    return parsedValue.uncertainty_notes[0];
  }

  return fallback?.dataQualityNote;
};

export const toHourlyInsightDisplayData = (
  insight: HourlyInsightV2 | HourlyInsightV1 | null,
  fallback?: Partial<InsightDisplayData>
): InsightDisplayData => {
  if (insight?.schema_version === 'hourly_insight_v2') {
    return {
      status: normalizeInsightStatus(insight.severity),
      summary: ensureNonEmptyString(insight.summary, fallback?.summary ?? 'Assessment pending'),
      observedPattern: ensureNonEmptyString(insight.probable_issue, fallback?.observedPattern ?? 'Assessment pending'),
      keyEvidence: insight.key_evidence.slice(0, 3),
      recommendedAction: insight.immediate_actions.slice(0, 3),
      escalationNote: ensureNonEmptyString(
        insight.escalation_triggers[0],
        fallback?.escalationNote ?? 'Continue monitoring'
      ),
      dataQualityNote: deriveDataQualityNote(insight, fallback),
    };
  }

  if (insight?.schema_version === 'hourly_insight_v1') {
    return {
      status: normalizeInsightStatus(insight.severity),
      summary: ensureNonEmptyString(insight.summary, fallback?.summary ?? 'Assessment pending'),
      observedPattern: ensureNonEmptyString(fallback?.observedPattern, 'Assessment pending'),
      keyEvidence: (insight.key_signals.length > 0 ? insight.key_signals : fallback?.keyEvidence ?? []).slice(0, 3),
      recommendedAction: (fallback?.recommendedAction ?? []).slice(0, 3),
      escalationNote: ensureNonEmptyString(fallback?.escalationNote, 'Continue monitoring'),
      dataQualityNote: deriveDataQualityNote(insight, fallback),
    };
  }

  return {
    status: normalizeInsightStatus(fallback?.status),
    summary: ensureNonEmptyString(fallback?.summary, 'Assessment pending'),
    observedPattern: ensureNonEmptyString(fallback?.observedPattern, 'Assessment pending'),
    keyEvidence: (fallback?.keyEvidence ?? []).slice(0, 3),
    recommendedAction: (fallback?.recommendedAction ?? []).slice(0, 3),
    escalationNote: ensureNonEmptyString(fallback?.escalationNote, 'Continue monitoring'),
    dataQualityNote: deriveDataQualityNote(insight, fallback),
  };
};

export const toDailyAssessmentDisplayData = (
  assessment: DailyAssessmentV2 | DailyAssessmentV1 | null,
  fallback?: Partial<InsightDisplayData>
): InsightDisplayData => {
  if (assessment?.schema_version === 'daily_assessment_v2') {
    return {
      status: normalizeInsightStatus(assessment.overall_status),
      summary: ensureNonEmptyString(assessment.summary, fallback?.summary ?? 'Assessment pending'),
      observedPattern: ensureNonEmptyString(assessment.probable_issue, fallback?.observedPattern ?? 'Assessment pending'),
      keyEvidence: assessment.key_evidence.slice(0, 3),
      recommendedAction: assessment.immediate_actions.slice(0, 3),
      escalationNote: ensureNonEmptyString(
        assessment.escalation_triggers[0],
        fallback?.escalationNote ?? 'Continue monitoring'
      ),
      monitorNext: assessment.monitor_next_24h.slice(0, 3),
      dataQualityNote: deriveDataQualityNote(assessment, fallback),
    };
  }

  if (assessment?.schema_version === 'daily_assessment_v1') {
    return {
      status: normalizeInsightStatus(assessment.overall_status),
      summary: ensureNonEmptyString(assessment.summary, fallback?.summary ?? 'Assessment pending'),
      observedPattern: ensureNonEmptyString(fallback?.observedPattern, 'Assessment pending'),
      keyEvidence: (assessment.key_observations.length > 0 ? assessment.key_observations : fallback?.keyEvidence ?? []).slice(0, 3),
      recommendedAction: (fallback?.recommendedAction ?? []).slice(0, 3),
      escalationNote: ensureNonEmptyString(fallback?.escalationNote, 'Continue monitoring'),
      monitorNext: (fallback?.monitorNext ?? []).slice(0, 3),
      dataQualityNote: deriveDataQualityNote(assessment, fallback),
    };
  }

  return {
    status: normalizeInsightStatus(fallback?.status ?? 'watch'),
    summary: ensureNonEmptyString(fallback?.summary, 'Assessment pending'),
    observedPattern: ensureNonEmptyString(fallback?.observedPattern, 'Assessment pending'),
    keyEvidence: (fallback?.keyEvidence ?? []).slice(0, 3),
    recommendedAction: (fallback?.recommendedAction ?? []).slice(0, 3),
    escalationNote: ensureNonEmptyString(fallback?.escalationNote, 'Continue monitoring'),
    monitorNext: (fallback?.monitorNext ?? []).slice(0, 3),
    dataQualityNote: deriveDataQualityNote(assessment, fallback),
  };
};

