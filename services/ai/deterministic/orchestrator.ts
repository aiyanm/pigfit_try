import { getGroqApiKey } from '../../core/config';
import { safeCallGroq } from '../providers/groqProvider';
import { dbService } from '../../storage/db/client';
import {
  buildDailyPrompt,
  buildFallbackHourlyInsight,
  buildHourlyPrompt,
  DETERMINISTIC_VERSIONS,
} from './promptBuilder';
import {
  parseDailyAssessmentV1,
  parseHourlyInsightV1,
  type DailyAssessmentV1,
  type HourlyInsightV1,
} from './contracts';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const getLocalDateString = (ts: number): string => {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseJsonFromModel = (raw: string): any | null => {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const hashString = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
};

const runDeterministicGroq = async (system: string, user: string, context: string): Promise<string> => {
  const apiKey = getGroqApiKey();
  const result = await safeCallGroq(system, user, context, apiKey, {
    model: 'llama-3.1-8b-instant',
    temperature: 0.1,
    maxTokens: 220,
  });
  if (!result.success) {
    throw new Error(result.error || 'Groq deterministic call failed');
  }
  return result.content;
};

export const runHourlyInsightForBucket = async (pigId: string, bucketStartMs: number): Promise<void> => {
  const bucketDate = getLocalDateString(bucketStartMs);
  const bucketHour = new Date(bucketStartMs).getHours();
  const hourlyRows = await dbService.getHourlyAggregates(bucketDate, bucketDate, pigId);
  const aggregate = hourlyRows.find((r: any) => Number(r.hour) === bucketHour);

  if (!aggregate) return;

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
    })
  );

  try {
    const { system, user, context } = buildHourlyPrompt(aggregate);
    let parsed: HourlyInsightV1 | null = null;

    try {
      const modelText = await runDeterministicGroq(system, user, context);
      parsed = parseHourlyInsightV1(parseJsonFromModel(modelText));
    } catch {
      // fall through to local deterministic fallback
    }

    if (!parsed) {
      parsed = buildFallbackHourlyInsight(aggregate);
    }

    await dbService.upsertHourlyInsight({
      pig_id: pigId,
      bucket_start: bucketStartMs,
      bucket_end: bucketStartMs + HOUR_MS - 1,
      bucket_date: bucketDate,
      bucket_hour: bucketHour,
      severity: parsed.severity,
      summary: parsed.summary,
      confidence: parsed.confidence,
      insight_json: JSON.stringify(parsed),
      source_hash: sourceHash,
      source_hourly_aggregate_id: aggregate.id ?? null,
      schema_version: DETERMINISTIC_VERSIONS.HOURLY_SCHEMA,
      prompt_version: DETERMINISTIC_VERSIONS.HOURLY_PROMPT,
      model_version: DETERMINISTIC_VERSIONS.MODEL,
      status: 'success',
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
      insight_json: JSON.stringify({ schema_version: 'hourly_insight_v1', error: errorMsg }),
      source_hash: sourceHash,
      source_hourly_aggregate_id: aggregate.id ?? null,
      schema_version: DETERMINISTIC_VERSIONS.HOURLY_SCHEMA,
      prompt_version: DETERMINISTIC_VERSIONS.HOURLY_PROMPT,
      model_version: DETERMINISTIC_VERSIONS.MODEL,
      status: 'failed',
      error_code: 'HOURLY_PIPELINE_ERROR',
      error_message: errorMsg,
    });
  }
};

export const runDailyAssessmentForDay = async (pigId: string, bucketDay: string): Promise<void> => {
  const hourlyRows = await dbService.getHourlyInsightsByDate(pigId, bucketDay);
  const successful = hourlyRows.filter((row: any) => row.status === 'success');

  if (successful.length === 0) return;

  const sourceHash = hashString(
    JSON.stringify(
      successful.map((row: any) => ({
        id: row.id,
        hour: row.bucket_hour,
        severity: row.severity,
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
      summary: row.summary,
      confidence: row.confidence ?? 0.5,
    }));
    const { system, user, context } = buildDailyPrompt(pigId, bucketDay, compactRows);

    let parsed: DailyAssessmentV1 | null = null;

    try {
      const modelText = await runDeterministicGroq(system, user, context);
      parsed = parseDailyAssessmentV1(parseJsonFromModel(modelText));
    } catch {
      // fallback to rule-based daily
    }

    if (!parsed) {
      const criticalCount = successful.filter((r: any) => r.severity === 'critical').length;
      const warningCount = successful.filter((r: any) => r.severity === 'warning').length;
      const overall_status = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'watch' : 'normal';
      parsed = {
        schema_version: 'daily_assessment_v1',
        overall_status,
        summary:
          overall_status === 'critical'
            ? 'Daily assessment: critical events were observed.'
            : overall_status === 'watch'
              ? 'Daily assessment: warnings observed; continue close monitoring.'
              : 'Daily assessment: stable day with no major anomalies.',
        confidence: 0.76,
        key_observations: [
          `success_hours=${successful.length}`,
          `critical_hours=${criticalCount}`,
          `warning_hours=${warningCount}`,
        ],
      };
    }

    await dbService.upsertDailyAssessment({
      pig_id: pigId,
      bucket_day: bucketDay,
      day_start: dayStart,
      day_end: dayEnd,
      overall_status: parsed.overall_status,
      summary: parsed.summary,
      assessment_json: JSON.stringify(parsed),
      source_hourly_count: successful.length,
      source_hash: sourceHash,
      schema_version: DETERMINISTIC_VERSIONS.DAILY_SCHEMA,
      prompt_version: DETERMINISTIC_VERSIONS.DAILY_PROMPT,
      model_version: DETERMINISTIC_VERSIONS.MODEL,
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
      assessment_json: JSON.stringify({ schema_version: 'daily_assessment_v1', error: errorMsg }),
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
