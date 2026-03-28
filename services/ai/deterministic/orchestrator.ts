import type { AIProviderName } from '../../core/config';
import { dbService } from '../../storage/db/client';
import {
  evaluateDiagnosticHierarchy,
  evaluateDiagnosticHierarchyFromHourlyAggregate,
  type DiagnosticResult,
} from '../../diagnostics/decisionTreeService';
import type { SensorDataPoint } from '../../core/types';
import {
  buildDailyPrompt,
  buildFallbackHourlyInsight,
  buildHourlyPrompt,
  buildResolvedDailyAssessment,
  buildResolvedHourlyInsight,
  DETERMINISTIC_VERSIONS,
} from './promptBuilder';
import {
  parseDailyAssessmentV2,
  parseHourlyInsightV2,
  type DailyAssessmentV2,
  type HourlyInsightV2,
} from './contracts';
import { getDeterministicModelForProvider, getDeterministicProviderChain } from '../providers/providerFactory';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const getLocalDateString = (ts: number): string => {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const hashString = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
};

const severityRank: Record<'normal' | 'warning' | 'critical', number> = {
  normal: 0,
  warning: 1,
  critical: 2,
};

const mapRuleSeverity = (result: DiagnosticResult): 'normal' | 'warning' | 'critical' => {
  if (result.severity === 'alert') return 'critical';
  if (result.severity === 'warning') return 'warning';
  return 'normal';
};

const maxSeverity = (
  a: 'normal' | 'warning' | 'critical',
  b: 'normal' | 'warning' | 'critical'
): 'normal' | 'warning' | 'critical' => (severityRank[a] >= severityRank[b] ? a : b);

const statusRank: Record<'normal' | 'watch' | 'critical', number> = {
  normal: 0,
  watch: 1,
  critical: 2,
};

const maxOverallStatus = (
  a: 'normal' | 'watch' | 'critical',
  b: 'normal' | 'watch' | 'critical'
): 'normal' | 'watch' | 'critical' => (statusRank[a] >= statusRank[b] ? a : b);

const toSensorDataPoints = (rows: any[]): SensorDataPoint[] =>
  rows.map((row: any) => ({
    timestamp: Number(row.timestamp ?? Date.now()),
    temp: Number(row.temp ?? 0),
    envTemp: Number(row.env_temp ?? 0),
    humidity: Number(row.humidity ?? 0),
    activityIntensity: Number(row.activity_intensity ?? 0),
    pitchAngle: Number(row.pitch_angle ?? 0),
    feed: Number(row.feed ?? 0),
  }));

interface ProviderCallResult {
  parsed: unknown | null;
  provider: AIProviderName;
  model: string;
}

const runDeterministicStructured = async (
  system: string,
  user: string,
  context: string,
  schemaName: string,
  schema: Record<string, unknown>
): Promise<ProviderCallResult> => {
  const providers = getDeterministicProviderChain();
  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      const model = getDeterministicModelForProvider(provider.name);
      const result = await provider.generateStructured({
        system,
        user,
        context,
        schemaName,
        schema,
        model,
        temperature: 0.1,
        maxTokens: 420,
      });
      return {
        parsed: result.parsed,
        provider: result.provider,
        model: result.model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown provider error');
      console.warn(`⚠️ Deterministic provider failed (${provider.name}): ${lastError.message}`);
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('No deterministic provider available');
};

const HOURLY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema_version: { type: 'string', const: 'hourly_insight_v2' },
    severity: { type: 'string', enum: ['normal', 'warning', 'critical'] },
    summary: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    probable_issue: { type: 'string' },
    key_evidence: { type: 'array', items: { type: 'string' } },
    differential_considerations: { type: 'array', items: { type: 'string' } },
    immediate_actions: { type: 'array', items: { type: 'string' } },
    escalation_triggers: { type: 'array', items: { type: 'string' } },
    uncertainty_notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'schema_version',
    'severity',
    'summary',
    'confidence',
    'probable_issue',
    'key_evidence',
    'differential_considerations',
    'immediate_actions',
    'escalation_triggers',
    'uncertainty_notes',
  ],
};

const DAILY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema_version: { type: 'string', const: 'daily_assessment_v2' },
    overall_status: { type: 'string', enum: ['normal', 'watch', 'critical'] },
    summary: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    probable_issue: { type: 'string' },
    key_evidence: { type: 'array', items: { type: 'string' } },
    differential_considerations: { type: 'array', items: { type: 'string' } },
    immediate_actions: { type: 'array', items: { type: 'string' } },
    monitor_next_24h: { type: 'array', items: { type: 'string' } },
    escalation_triggers: { type: 'array', items: { type: 'string' } },
    uncertainty_notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'schema_version',
    'overall_status',
    'summary',
    'confidence',
    'probable_issue',
    'key_evidence',
    'differential_considerations',
    'immediate_actions',
    'monitor_next_24h',
    'escalation_triggers',
    'uncertainty_notes',
  ],
};

export interface BackfillDeterministicV2Result {
  pigId: string;
  startDate: string;
  endDate: string;
  hourlyBucketsProcessed: number;
  dailyDaysProcessed: number;
}

export interface BackfillDeterministicV2Progress {
  stage: 'hourly' | 'daily' | 'complete';
  current: number;
  total: number;
  label: string;
}

export const runHourlyInsightForBucket = async (pigId: string, bucketStartMs: number): Promise<void> => {
  const bucketDate = getLocalDateString(bucketStartMs);
  const bucketHour = new Date(bucketStartMs).getHours();
  const hourlyRows = await dbService.getHourlyAggregates(bucketDate, bucketDate, pigId);
  const aggregate = hourlyRows.find((r: any) => Number(r.hour) === bucketHour);

  if (!aggregate) return;

  const bucketEndMs = bucketStartMs + HOUR_MS - 1;
  const rawRows = await dbService.getSensorData(bucketStartMs, bucketEndMs, pigId);
  const rawPoints = toSensorDataPoints(rawRows);
  const ruleResult =
    rawPoints.length > 0
      ? evaluateDiagnosticHierarchy(rawPoints)
      : evaluateDiagnosticHierarchyFromHourlyAggregate(aggregate);
  const ruleSeverity = mapRuleSeverity(ruleResult);
  const ruleContext = {
    case: ruleResult.case,
    severity: ruleSeverity,
    title: ruleResult.title,
    description: ruleResult.description,
  };

  const sourceHash = hashString(
    JSON.stringify({
      pig_id: pigId,
      date: aggregate.date,
      hour: aggregate.hour,
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
      rule_case: ruleResult.case,
      rule_severity: ruleSeverity,
    })
  );

  try {
    const { system, user, context } = buildHourlyPrompt(aggregate, ruleContext);
    let parsed: HourlyInsightV2 | null = null;
    let providerModelVersion: string = DETERMINISTIC_VERSIONS.MODEL;

    try {
      const modelResult = await runDeterministicStructured(
        system,
        user,
        context,
        DETERMINISTIC_VERSIONS.HOURLY_SCHEMA,
        HOURLY_SCHEMA
      );
      parsed = parseHourlyInsightV2(modelResult.parsed);
      providerModelVersion = `${modelResult.provider}:${modelResult.model}`;
    } catch {
      // fall through to local deterministic fallback
    }

    if (!parsed) {
      parsed = buildFallbackHourlyInsight(aggregate, ruleContext);
    }

    const resolvedSeverity = maxSeverity(ruleSeverity, parsed.severity);
    const finalInsight = buildResolvedHourlyInsight(aggregate, resolvedSeverity, ruleContext, parsed);

    await dbService.upsertHourlyInsight({
      pig_id: pigId,
      bucket_start: bucketStartMs,
      bucket_end: bucketStartMs + HOUR_MS - 1,
      bucket_date: bucketDate,
      bucket_hour: bucketHour,
      severity: finalInsight.severity,
      summary: finalInsight.summary,
      confidence: finalInsight.confidence,
      insight_json: JSON.stringify({
        ...finalInsight,
        rule_case: ruleResult.case,
        rule_severity: ruleSeverity,
      }),
      source_hash: sourceHash,
      source_hourly_aggregate_id: aggregate.id ?? null,
      schema_version: DETERMINISTIC_VERSIONS.HOURLY_SCHEMA,
      prompt_version: DETERMINISTIC_VERSIONS.HOURLY_PROMPT,
      model_version: providerModelVersion,
      status: 'success',
      rule_case: ruleResult.case,
      rule_severity: ruleSeverity,
      rule_reasoning_json: JSON.stringify(ruleResult.reasoning),
      error_code: null,
      error_message: null,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown hourly deterministic error';
    await dbService.upsertHourlyInsight({
      pig_id: pigId,
      bucket_start: bucketStartMs,
      bucket_end: bucketStartMs + HOUR_MS - 1,
      bucket_date: bucketDate,
      bucket_hour: bucketHour,
      severity: 'warning',
      summary: 'Failed to generate hourly deterministic insight.',
      confidence: null,
      insight_json: JSON.stringify({ schema_version: 'hourly_insight_v2', error: errorMsg }),
      source_hash: sourceHash,
      source_hourly_aggregate_id: aggregate.id ?? null,
      schema_version: DETERMINISTIC_VERSIONS.HOURLY_SCHEMA,
      prompt_version: DETERMINISTIC_VERSIONS.HOURLY_PROMPT,
      model_version: DETERMINISTIC_VERSIONS.MODEL,
      status: 'failed',
      rule_case: ruleResult.case,
      rule_severity: ruleSeverity,
      rule_reasoning_json: JSON.stringify(ruleResult.reasoning),
      error_code: 'HOURLY_PIPELINE_ERROR',
      error_message: errorMsg,
    });
  }
};

export const runDailyAssessmentForDay = async (pigId: string, bucketDay: string): Promise<void> => {
  const hourlyRows = await dbService.getHourlyInsightsByDate(pigId, bucketDay);
  const successful = hourlyRows.filter((row: any) => row.status === 'success');
  const ruleSeverities = successful.map((r: any) => r.rule_severity ?? r.severity);
  const ruleCriticalCount = ruleSeverities.filter((s: string) => s === 'critical').length;
  const ruleWarningCount = ruleSeverities.filter((s: string) => s === 'warning').length;
  const baselineOverallStatus: 'normal' | 'watch' | 'critical' =
    ruleCriticalCount > 0 ? 'critical' : ruleWarningCount > 0 ? 'watch' : 'normal';

  if (successful.length === 0) return;

  const sourceHash = hashString(
    JSON.stringify(
      successful.map((row: any) => ({
        id: row.id,
        hour: row.bucket_hour,
        severity: row.severity,
        rule_severity: row.rule_severity ?? row.severity,
        summary: row.summary,
      }))
    )
  );

  const dayStart = new Date(`${bucketDay}T00:00:00`).getTime();
  const dayEnd = dayStart + DAY_MS - 1;

  try {
    const compactRows = successful.map((row: any) => ({
      bucket_hour: row.bucket_hour,
      severity: row.severity,
      rule_severity: row.rule_severity ?? row.severity,
      summary: row.summary,
      confidence: row.confidence ?? 0.5,
      insight_json: row.insight_json ?? null,
    }));
    const { system, user, context } = buildDailyPrompt(pigId, bucketDay, compactRows);

    let parsed: DailyAssessmentV2 | null = null;
    let providerModelVersion: string = DETERMINISTIC_VERSIONS.MODEL;

    try {
      const modelResult = await runDeterministicStructured(
        system,
        user,
        context,
        DETERMINISTIC_VERSIONS.DAILY_SCHEMA,
        DAILY_SCHEMA
      );
      parsed = parseDailyAssessmentV2(modelResult.parsed);
      providerModelVersion = `${modelResult.provider}:${modelResult.model}`;
    } catch {
      // fallback to rule-based daily
    }

    if (!parsed) {
      parsed = buildResolvedDailyAssessment(bucketDay, compactRows, baselineOverallStatus);
    }

    const finalStatus = maxOverallStatus(parsed.overall_status, baselineOverallStatus);
    const finalAssessment = buildResolvedDailyAssessment(bucketDay, compactRows, finalStatus, parsed);

    await dbService.upsertDailyAssessment({
      pig_id: pigId,
      bucket_day: bucketDay,
      day_start: dayStart,
      day_end: dayEnd,
      overall_status: finalAssessment.overall_status,
      summary: finalAssessment.summary,
      assessment_json: JSON.stringify(finalAssessment),
      source_hourly_count: successful.length,
      source_hash: sourceHash,
      schema_version: DETERMINISTIC_VERSIONS.DAILY_SCHEMA,
      prompt_version: DETERMINISTIC_VERSIONS.DAILY_PROMPT,
      model_version: providerModelVersion,
      status: 'success',
      error_code: null,
      error_message: null,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown daily deterministic error';
    await dbService.upsertDailyAssessment({
      pig_id: pigId,
      bucket_day: bucketDay,
      day_start: dayStart,
      day_end: dayEnd,
      overall_status: 'watch',
      summary: 'Failed to generate daily deterministic assessment.',
      assessment_json: JSON.stringify({ schema_version: 'daily_assessment_v2', error: errorMsg }),
      source_hourly_count: successful.length,
      source_hash: sourceHash,
      schema_version: DETERMINISTIC_VERSIONS.DAILY_SCHEMA,
      prompt_version: DETERMINISTIC_VERSIONS.DAILY_PROMPT,
      model_version: DETERMINISTIC_VERSIONS.MODEL,
      status: 'failed',
      error_code: 'DAILY_PIPELINE_ERROR',
      error_message: errorMsg,
    });
  }
};

export const backfillDeterministicInsightsV2 = async (
  pigId: string,
  startDate = '1970-01-01',
  endDate = '9999-12-31',
  onProgress?: (progress: BackfillDeterministicV2Progress) => void
): Promise<BackfillDeterministicV2Result> => {
  const aggregates = await dbService.getHourlyAggregates(startDate, endDate, pigId);
  const uniqueHours = new Map<string, { date: string; hour: number }>();

  for (const row of aggregates) {
    const date = String(row?.date ?? '');
    const hour = Number(row?.hour ?? NaN);
    if (!date || !Number.isFinite(hour)) continue;
    uniqueHours.set(`${date}-${hour}`, { date, hour });
  }

  const orderedHours = [...uniqueHours.values()].sort((a, b) =>
    `${a.date}-${String(a.hour).padStart(2, '0')}`.localeCompare(`${b.date}-${String(b.hour).padStart(2, '0')}`)
  );

  for (let index = 0; index < orderedHours.length; index++) {
    const item = orderedHours[index];
    onProgress?.({
      stage: 'hourly',
      current: index + 1,
      total: orderedHours.length,
      label: `${item.date} ${String(item.hour).padStart(2, '0')}:00`,
    });
    const bucketStartMs = new Date(`${item.date}T00:00:00`).getTime() + (item.hour * HOUR_MS);
    await runHourlyInsightForBucket(pigId, bucketStartMs);
  }

  const uniqueDays = [...new Set(orderedHours.map((item) => item.date))].sort((a, b) => a.localeCompare(b));
  for (let index = 0; index < uniqueDays.length; index++) {
    const day = uniqueDays[index];
    onProgress?.({
      stage: 'daily',
      current: index + 1,
      total: uniqueDays.length,
      label: day,
    });
    await runDailyAssessmentForDay(pigId, day);
  }

  onProgress?.({
    stage: 'complete',
    current: uniqueDays.length,
    total: uniqueDays.length,
    label: `${pigId} ${startDate} to ${endDate}`,
  });

  return {
    pigId,
    startDate,
    endDate,
    hourlyBucketsProcessed: orderedHours.length,
    dailyDaysProcessed: uniqueDays.length,
  };
};
