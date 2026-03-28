import type {
  DailyAssessmentV2,
  HourlyInsightV2,
  OverallStatus,
  Severity,
} from './contracts';

interface HourlyRuleContext {
  label: string;
  severity: Severity;
  title: string;
  description: string;
}

interface HourlyAggregateLike {
  date: string;
  hour: number;
  pig_id: string;
  mean_temp?: number | null;
  mean_env_temp?: number | null;
  mean_humidity?: number | null;
  mean_activity?: number | null;
  mean_pitch?: number | null;
  sample_count?: number | null;
  thi?: number | null;
  lethargy_alert?: number | null;
  dominant_activity_state?: string | null;
  max_temp?: number | null;
  max_thi?: number | null;
  fever_event_count?: number | null;
  heat_stress_event_count?: number | null;
  severe_heat_event_count?: number | null;
  true_eating_event_count?: number | null;
  resting_ratio?: number | null;
  standing_ratio?: number | null;
  distress_ratio?: number | null;
  feeding_schedule_adherence?: number | null;
  high_risk_hour_flag?: number | null;
}

interface DailySourceRow {
  bucket_hour: number;
  severity: Severity;
  rule_severity?: Severity;
  summary: string;
  confidence: number;
  insight_json?: string | null;
}

export const DETERMINISTIC_VERSIONS = {
  HOURLY_SCHEMA: 'hourly_insight_v2',
  DAILY_SCHEMA: 'daily_assessment_v2',
  HOURLY_PROMPT: 'hourly_prompt_v2',
  DAILY_PROMPT: 'daily_prompt_v2',
  MODEL: 'provider-managed',
} as const;

const round = (value: number): number => Math.round(value * 100) / 100;

const formatNumber = (value: unknown, digits = 2): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
};

const getHourlyProbableIssue = (
  aggregate: HourlyAggregateLike,
  severity: Severity,
  rule: HourlyRuleContext
): string => {
  const thi = Number(aggregate.thi ?? 0);
  const lethargy = Number(aggregate.lethargy_alert ?? 0) === 1;
  const activity = Number(aggregate.mean_activity ?? 0);

  if (severity === 'critical') {
    if (thi >= 80 && lethargy) return 'Heat stress with lethargy risk';
    if (thi >= 80) return 'Severe heat stress';
    if (lethargy || activity < 1.05) return 'Marked lethargy risk';
    return `${rule.title} requiring urgent review`;
  }

  if (severity === 'warning') {
    if (thi >= 75) return 'Early heat stress';
    if (lethargy || activity < 1.05) return 'Low activity with lethargy risk';
    return `${rule.title} requiring close monitoring`;
  }

  return 'No clear health concern detected';
};

const buildHourlyEvidence = (aggregate: HourlyAggregateLike, rule: HourlyRuleContext): string[] => {
  const evidence: string[] = [];
  if (typeof aggregate.thi === 'number') {
    evidence.push(`thi=${formatNumber(aggregate.thi, 1)} indicates ${aggregate.thi >= 80 ? 'severe' : aggregate.thi >= 75 ? 'moderate' : aggregate.thi >= 70 ? 'mild' : 'low'} heat load`);
  }
  if (typeof aggregate.mean_activity === 'number') {
    evidence.push(`mean_activity=${formatNumber(aggregate.mean_activity, 2)} with state=${aggregate.dominant_activity_state ?? 'unknown'}`);
  }
  if (typeof aggregate.mean_temp === 'number') {
    evidence.push(`mean_temp=${formatNumber(aggregate.mean_temp, 1)}C body temperature signal`);
  }
  if (typeof aggregate.mean_env_temp === 'number' && typeof aggregate.mean_humidity === 'number') {
    evidence.push(
      `mean_env_temp=${formatNumber(aggregate.mean_env_temp, 1)}C and mean_humidity=${formatNumber(aggregate.mean_humidity, 1)}% environmental load`
    );
  }
  if (Number(aggregate.lethargy_alert ?? 0) === 1) {
    evidence.push('lethargy_alert=1 supports reduced activity concern');
  }
  if (typeof aggregate.sample_count === 'number') {
    evidence.push(`sample_count=${aggregate.sample_count} observations support this hour`);
  }
  if (typeof aggregate.max_temp === 'number') {
    evidence.push(`max_temp=${formatNumber(aggregate.max_temp, 1)}C peak temperature this hour`);
  }
  if (typeof aggregate.fever_event_count === 'number') {
    evidence.push(`fever_event_count=${aggregate.fever_event_count}`);
  }
  if (typeof aggregate.heat_stress_event_count === 'number') {
    evidence.push(`heat_stress_event_count=${aggregate.heat_stress_event_count}`);
  }
  if (typeof aggregate.true_eating_event_count === 'number') {
    evidence.push(`true_eating_event_count=${aggregate.true_eating_event_count}`);
  }
  evidence.push(`analytics_label=${rule.label} (${rule.description})`);
  return evidence.slice(0, 5);
};

const buildHourlyDifferentials = (aggregate: HourlyAggregateLike, severity: Severity): string[] => {
  const candidates: string[] = [];
  if (severity !== 'normal') {
    candidates.push('Temporary environmental stress spike cannot be excluded');
  }
  if (Number(aggregate.mean_activity ?? 0) < 1.05) {
    candidates.push('Non-specific illness causing low movement cannot be ruled out');
  }
  if (Number(aggregate.thi ?? 0) >= 75) {
    candidates.push('Dehydration risk may be contributing to reduced resilience');
  }
  if (severity === 'normal') {
    candidates.push('Continue observing for any shift during hotter hours');
  }
  return candidates.slice(0, 3);
};

const buildHourlyActions = (severity: Severity): string[] => {
  if (severity === 'critical') {
    return [
      'Move the pig to the coolest available area now',
      'Improve airflow and water access immediately',
      'Recheck activity, temperature, and breathing within 1 hour',
    ];
  }
  if (severity === 'warning') {
    return [
      'Monitor this pig more closely during the next hour',
      'Reduce heat exposure and confirm water access',
      'Recheck activity and temperature on the next scheduled pass',
    ];
  }
  return [
    'Continue routine monitoring',
    'Keep ventilation and water access stable',
  ];
};

const buildHourlyEscalation = (severity: Severity): string[] => {
  if (severity === 'critical') {
    return [
      'Call the vet now if the pig becomes non-responsive, cannot stand, or develops labored breathing',
      'Call the vet today if severe stress indicators persist after cooling and recheck',
    ];
  }
  if (severity === 'warning') {
    return [
      'Call the vet today if warning signs persist across repeated checks or worsen',
      'Continue monitoring if the pig returns to baseline on the next check',
    ];
  }
  return ['Continue monitoring and call the vet if a new warning pattern appears'];
};

const buildHourlyUncertainty = (aggregate: HourlyAggregateLike): string[] => {
  const notes: string[] = [];
  const sampleCount = Number(aggregate.sample_count ?? 0);
  if (sampleCount > 0 && sampleCount < 6) {
    notes.push(`Confidence reduced because sample_count=${sampleCount} is limited for this hour`);
  }
  if (aggregate.thi == null) {
    notes.push('THI is missing, so heat stress certainty is reduced');
  }
  if (aggregate.mean_temp == null) {
    notes.push('Body temperature signal is missing, so temperature confirmation is limited');
  }
  return notes.slice(0, 3);
};

export const buildResolvedHourlyInsight = (
  aggregate: HourlyAggregateLike,
  severity: Severity,
  rule: HourlyRuleContext,
  base?: Partial<HourlyInsightV2>
): HourlyInsightV2 => {
  const confidenceFloor = severity === 'critical' ? 0.84 : severity === 'warning' ? 0.77 : 0.72;
  const confidence = Math.max(base?.confidence ?? 0, confidenceFloor);
  const probableIssue = base?.probable_issue?.trim() || getHourlyProbableIssue(aggregate, severity, rule);

  return {
    schema_version: 'hourly_insight_v2',
    severity,
    summary:
      severity === 'critical'
        ? `Critical hour: ${probableIssue.toLowerCase()} detected.`
        : severity === 'warning'
          ? `Warning hour: ${probableIssue.toLowerCase()} needs close monitoring.`
          : 'Stable hour: no strong stress indicators detected.',
    confidence: round(confidence),
    probable_issue: probableIssue,
    key_evidence: (base?.key_evidence && base.key_evidence.length > 0 ? base.key_evidence : buildHourlyEvidence(aggregate, rule)).slice(0, 5),
    differential_considerations:
      (base?.differential_considerations && base.differential_considerations.length > 0
        ? base.differential_considerations
        : buildHourlyDifferentials(aggregate, severity)
      ).slice(0, 3),
    immediate_actions: (base?.immediate_actions && base.immediate_actions.length > 0 ? base.immediate_actions : buildHourlyActions(severity)).slice(0, 3),
    escalation_triggers:
      (base?.escalation_triggers && base.escalation_triggers.length > 0 ? base.escalation_triggers : buildHourlyEscalation(severity)).slice(0, 3),
    uncertainty_notes:
      (base?.uncertainty_notes && base.uncertainty_notes.length > 0 ? base.uncertainty_notes : buildHourlyUncertainty(aggregate)).slice(0, 3),
  };
};

const inferDailyProbableIssue = (hourlyInsights: DailySourceRow[], status: OverallStatus): string => {
  const criticalHours = hourlyInsights.filter((row) => (row.rule_severity ?? row.severity) === 'critical').length;
  const warningHours = hourlyInsights.filter((row) => (row.rule_severity ?? row.severity) === 'warning').length;

  if (status === 'critical') {
    return criticalHours > 1 ? 'Repeated critical stress periods' : 'Critical stress period observed';
  }
  if (status === 'watch') {
    return warningHours > 1 ? 'Recurring daytime stress pattern' : 'Intermittent warning signals';
  }
  return 'No clear daily health concern detected';
};

const buildDailyEvidence = (hourlyInsights: DailySourceRow[], status: OverallStatus): string[] => {
  const criticalHours = hourlyInsights.filter((row) => (row.rule_severity ?? row.severity) === 'critical').length;
  const warningHours = hourlyInsights.filter((row) => (row.rule_severity ?? row.severity) === 'warning').length;
  const sorted = [...hourlyInsights].sort((a, b) => b.bucket_hour - a.bucket_hour);

  const evidence = [
    `successful_hourly_insights=${hourlyInsights.length}`,
    `critical_hours=${criticalHours}`,
    `warning_hours=${warningHours}`,
  ];

  for (const row of sorted.slice(0, 2)) {
    evidence.push(`hour_${row.bucket_hour}:00 ${row.summary}`);
  }

  if (status === 'normal') {
    evidence.push('No rule-backed critical periods were observed during this day');
  }

  return evidence.slice(0, 5);
};

const buildDailyDifferentials = (status: OverallStatus): string[] => {
  if (status === 'critical') {
    return [
      'Stress may be recurring rather than isolated to one hour',
      'Recovery between hot periods may be incomplete',
    ];
  }
  if (status === 'watch') {
    return [
      'Short-lived environmental spikes may explain some warning periods',
      'The pattern could worsen if the next hot period is unmanaged',
    ];
  }
  return ['Continue watching for any new stress pattern tomorrow'];
};

const buildDailyActions = (status: OverallStatus): string[] => {
  if (status === 'critical') {
    return [
      'Review cooling and ventilation immediately',
      'Increase observation frequency during the next hot period',
      'Prepare for same-day veterinary escalation if another critical period occurs',
    ];
  }
  if (status === 'watch') {
    return [
      'Monitor this pig more closely during peak heat hours',
      'Confirm cooling, airflow, and water access remain stable',
      'Repeat the daily assessment after additional hourly data is collected',
    ];
  }
  return [
    'Continue standard monitoring tomorrow',
    'Keep environmental controls stable during hotter hours',
  ];
};

const buildDailyMonitor = (status: OverallStatus): string[] => {
  if (status === 'critical') {
    return ['Another critical hour', 'Persistent low activity', 'Breathing distress during hot periods'];
  }
  if (status === 'watch') {
    return ['Repeated warning hours', 'More lethargy indicators', 'Worsening activity during expected active periods'];
  }
  return ['Any new warning hour', 'Reduced movement during active periods'];
};

const buildDailyEscalation = (status: OverallStatus): string[] => {
  if (status === 'critical') {
    return [
      'Call the vet now if another critical period occurs with weakness, collapse, or breathing difficulty',
      'Call the vet today if critical signs persist despite cooling and rest',
    ];
  }
  if (status === 'watch') {
    return [
      'Call the vet today if warning periods repeat or escalate to critical',
      'Continue monitoring if the pig returns to a stable hourly pattern',
    ];
  }
  return ['Continue monitoring and call the vet if a warning or critical pattern appears tomorrow'];
};

const buildDailyUncertainty = (hourlyInsights: DailySourceRow[]): string[] => {
  const notes: string[] = [];
  if (hourlyInsights.length < 8) {
    notes.push(`Confidence reduced because only ${hourlyInsights.length} hourly insights were available for this day`);
  }
  if (hourlyInsights.some((row) => row.confidence < 0.65)) {
    notes.push('Some hourly inputs had lower confidence, which weakens the day-level assessment');
  }
  return notes.slice(0, 3);
};

export const buildResolvedDailyAssessment = (
  bucketDay: string,
  hourlyInsights: DailySourceRow[],
  status: OverallStatus,
  base?: Partial<DailyAssessmentV2>
): DailyAssessmentV2 => {
  const confidenceFloor = status === 'critical' ? 0.84 : status === 'watch' ? 0.78 : 0.73;
  const averageConfidence =
    hourlyInsights.length > 0
      ? hourlyInsights.reduce((sum, row) => sum + (Number.isFinite(row.confidence) ? row.confidence : 0.5), 0) / hourlyInsights.length
      : confidenceFloor;
  const probableIssue = base?.probable_issue?.trim() || inferDailyProbableIssue(hourlyInsights, status);

  return {
    schema_version: 'daily_assessment_v2',
    overall_status: status,
    summary:
      status === 'critical'
        ? `Daily assessment for ${bucketDay}: ${probableIssue.toLowerCase()} observed.`
        : status === 'watch'
          ? `Daily assessment for ${bucketDay}: ${probableIssue.toLowerCase()} needs close monitoring.`
          : `Daily assessment for ${bucketDay}: stable day with no major anomalies.`,
    confidence: round(Math.max(base?.confidence ?? 0, averageConfidence, confidenceFloor)),
    probable_issue: probableIssue,
    key_evidence: (base?.key_evidence && base.key_evidence.length > 0 ? base.key_evidence : buildDailyEvidence(hourlyInsights, status)).slice(0, 5),
    differential_considerations:
      (base?.differential_considerations && base.differential_considerations.length > 0
        ? base.differential_considerations
        : buildDailyDifferentials(status)
      ).slice(0, 3),
    immediate_actions: (base?.immediate_actions && base.immediate_actions.length > 0 ? base.immediate_actions : buildDailyActions(status)).slice(0, 3),
    monitor_next_24h: (base?.monitor_next_24h && base.monitor_next_24h.length > 0 ? base.monitor_next_24h : buildDailyMonitor(status)).slice(0, 4),
    escalation_triggers:
      (base?.escalation_triggers && base.escalation_triggers.length > 0 ? base.escalation_triggers : buildDailyEscalation(status)).slice(0, 3),
    uncertainty_notes:
      (base?.uncertainty_notes && base.uncertainty_notes.length > 0 ? base.uncertainty_notes : buildDailyUncertainty(hourlyInsights)).slice(0, 3),
  };
};

export const buildHourlyPrompt = (
  aggregate: HourlyAggregateLike,
  rule: HourlyRuleContext
): { system: string; user: string; context: string } => {
  const system = [
    'You are a deterministic pig health assessment engine.',
    'Return JSON only with no markdown.',
    'Use only the provided fields and never invent unsupported diagnoses.',
    'Every major conclusion must be tied to actual input values.',
  ].join(' ');

  const user = `Return exactly this JSON schema:
{
  "schema_version":"hourly_insight_v2",
  "severity":"normal|warning|critical",
  "summary":"string",
  "confidence":0.0,
  "probable_issue":"string",
  "key_evidence":["string"],
  "differential_considerations":["string"],
  "immediate_actions":["string"],
  "escalation_triggers":["string"],
  "uncertainty_notes":["string"]
}`;

  const context = JSON.stringify({
    bucket: {
      date: aggregate.date,
      hour: aggregate.hour,
      pig_id: aggregate.pig_id,
    },
    aggregate: {
      mean_temp: aggregate.mean_temp,
      mean_env_temp: aggregate.mean_env_temp,
      mean_humidity: aggregate.mean_humidity,
      mean_activity: aggregate.mean_activity,
      mean_pitch: aggregate.mean_pitch,
      sample_count: aggregate.sample_count ?? 0,
      thi: aggregate.thi ?? null,
      lethargy_alert: aggregate.lethargy_alert ?? 0,
      dominant_activity_state: aggregate.dominant_activity_state ?? 'Resting',
      max_temp: aggregate.max_temp ?? null,
      max_thi: aggregate.max_thi ?? null,
      fever_event_count: aggregate.fever_event_count ?? 0,
      heat_stress_event_count: aggregate.heat_stress_event_count ?? 0,
      severe_heat_event_count: aggregate.severe_heat_event_count ?? 0,
      true_eating_event_count: aggregate.true_eating_event_count ?? 0,
      resting_ratio: aggregate.resting_ratio ?? 0,
      standing_ratio: aggregate.standing_ratio ?? 0,
      distress_ratio: aggregate.distress_ratio ?? 0,
      feeding_schedule_adherence: aggregate.feeding_schedule_adherence ?? 0,
      high_risk_hour_flag: aggregate.high_risk_hour_flag ?? 0,
    },
    rules: [
      'Base your judgment on analytics counts, ratios, THI, and temperature peaks.',
      'critical if the hour shows severe heat stress, fever spikes, or repeated high-risk events.',
      'warning if the hour shows mild/moderate anomalies or elevated event counts.',
      'normal if the hour is stable with low-risk metrics.',
      'Never downgrade below the provided analytics severity.',
    ],
    rule,
  });

  return { system, user, context };
};

export const buildDailyPrompt = (
  pigId: string,
  bucketDay: string,
  hourlyInsights: DailySourceRow[]
): { system: string; user: string; context: string } => {
  const system = [
    'You are a deterministic pig health assessment engine.',
    'Return JSON only with no markdown.',
    'Use the hourly inputs as evidence and do not invent unsupported conditions.',
    'The daily assessment must align with the strongest hourly severity.',
  ].join(' ');

  const user = `Return exactly this JSON schema:
{
  "schema_version":"daily_assessment_v2",
  "overall_status":"normal|watch|critical",
  "summary":"string",
  "confidence":0.0,
  "probable_issue":"string",
  "key_evidence":["string"],
  "differential_considerations":["string"],
  "immediate_actions":["string"],
  "monitor_next_24h":["string"],
  "escalation_triggers":["string"],
  "uncertainty_notes":["string"]
}`;

  const context = JSON.stringify({
    pig_id: pigId,
    bucket_day: bucketDay,
    hourly_insights: hourlyInsights,
    aggregation_rule: 'Daily assessment prioritizes the strongest hourly analytics severity and explains the day-level pattern.',
  });

  return { system, user, context };
};

export const buildFallbackHourlyInsight = (
  aggregate: HourlyAggregateLike,
  rule: HourlyRuleContext
): HourlyInsightV2 => {
  const severeHeat = Number(aggregate.thi ?? 0) >= 84;
  const warningHeat = Number(aggregate.thi ?? 0) >= 79;
  const lethargy = Number(aggregate.lethargy_alert ?? 0) === 1;

  let severity: Severity = 'normal';
  if (severeHeat || (warningHeat && lethargy)) severity = 'critical';
  else if (warningHeat || lethargy) severity = 'warning';

  return buildResolvedHourlyInsight(aggregate, severity, rule);
};
