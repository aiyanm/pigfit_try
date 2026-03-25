import type { HourlyInsightV1 } from './contracts';

export const DETERMINISTIC_VERSIONS = {
  HOURLY_SCHEMA: 'hourly_insight_v1',
  DAILY_SCHEMA: 'daily_assessment_v1',
  HOURLY_PROMPT: 'hourly_prompt_v1',
  DAILY_PROMPT: 'daily_prompt_v1',
  MODEL: 'llama-3.1-8b-instant',
} as const;

export const buildHourlyPrompt = (aggregate: any): { system: string; user: string; context: string } => {
  const system = [
    'You are a deterministic farm analytics engine.',
    'Return JSON only, no markdown.',
    'Follow schema exactly.',
  ].join(' ');

  const user = `Return exactly this JSON schema:
{
  "schema_version":"hourly_insight_v1",
  "severity":"normal|warning|critical",
  "summary":"string",
  "confidence":0.0,
  "key_signals":["string"]
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
      mean_feed: aggregate.mean_feed,
      sample_count: aggregate.sample_count ?? 0,
      thi: aggregate.thi ?? null,
      lethargy_alert: aggregate.lethargy_alert ?? 0,
      dominant_activity_state: aggregate.dominant_activity_state ?? 'Resting',
    },
    rules: [
      'critical if extreme heat stress or severe lethargy signals',
      'warning if mild/moderate anomalies',
      'normal if stable ranges',
    ],
  });

  return { system, user, context };
};

export const buildDailyPrompt = (
  pigId: string,
  bucketDay: string,
  hourlyInsights: Array<{ bucket_hour: number; severity: string; summary: string; confidence: number }>
): { system: string; user: string; context: string } => {
  const system = [
    'You are a deterministic farm analytics engine.',
    'Return JSON only, no markdown.',
    'Follow schema exactly.',
  ].join(' ');

  const user = `Return exactly this JSON schema:
{
  "schema_version":"daily_assessment_v1",
  "overall_status":"normal|watch|critical",
  "summary":"string",
  "confidence":0.0,
  "key_observations":["string"]
}`;

  const context = JSON.stringify({
    pig_id: pigId,
    bucket_day: bucketDay,
    hourly_insights: hourlyInsights,
    aggregation_rule: 'Daily assessment summarizes same-day hourly insights only.',
  });

  return { system, user, context };
};

export const buildFallbackHourlyInsight = (aggregate: any): HourlyInsightV1 => {
  const severeHeat = (aggregate.thi ?? 0) >= 84;
  const warningHeat = (aggregate.thi ?? 0) >= 79;
  const lethargy = Number(aggregate.lethargy_alert ?? 0) === 1;

  let severity: HourlyInsightV1['severity'] = 'normal';
  if (severeHeat || (warningHeat && lethargy)) severity = 'critical';
  else if (warningHeat || lethargy) severity = 'warning';

  const summary =
    severity === 'critical'
      ? 'Critical hour: combined stress signals detected.'
      : severity === 'warning'
        ? 'Warning hour: early stress indicators detected.'
        : 'Stable hour: no strong stress indicators.';

  return {
    schema_version: 'hourly_insight_v1',
    severity,
    summary,
    confidence: severity === 'normal' ? 0.72 : 0.78,
    key_signals: [
      `THI=${aggregate.thi ?? 'n/a'}`,
      `Activity=${aggregate.mean_activity ?? 'n/a'}`,
      `State=${aggregate.dominant_activity_state ?? 'n/a'}`,
    ],
  };
};
