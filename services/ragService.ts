import { dbService } from './database';
import { calculateTHI, checkLethargy, CIRCADIAN_BASELINE } from './diagnostics';
import { getRAGConfig } from './ragConfig';
import { TrendPeriod } from './dataLogger';

/**
 * RAG (Retrieval-Augmented Generation) Service - OPTIMIZED
 * Retrieves and formats pig health data from SQLite for LLM context
 */

// All supported time windows (short = period_aggregates, long = hourly_aggregates)
export type TimeWindow = TrendPeriod | 'last_hour' | 'last_24h' | 'last_7d';

export interface RAGContext {
  pigId: string;
  timeWindow: 'last_hour' | 'last_24h' | 'last_7d';
  dataPoints: number;
  formattedText: string;
  statistics: HealthStatistics;
}

export interface HealthStatistics {
  avgTemp: number;
  minTemp: number;
  maxTemp: number;
  avgHR: number;
  avgActivity: number;
  avgTHI: number;
  avgCircadianDelta: number;
  lethargyAlerts: number;
  dataQuality: string;
}

// Simple cache for repeated queries
interface CacheEntry {
  context: string;
  timestamp: number;
}
const contextCache = new Map<string, CacheEntry>();
const CACHE_DURATION_MS = 300000; // 5 minutes

/**
 * Estimate token count using simple heuristic
 * OpenAI/Groq models typically use ~1.3 tokens per word on average
 */
const estimateContextTokens = (text: string): number => {
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words * 1.3) + 4; // +4 for formatting overhead
};

/**
 * Sanitize context to prevent prompt injection
 * Escapes markdown special characters
 */
const sanitizeForPrompt = (text: string): string => {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
};

/**
 * Truncate context to fit within token limit
 * Keeps summary stats, removes oldest records
 */
const truncateContextToTokenLimit = (context: string, maxTokens: number): string => {
  const tokens = estimateContextTokens(context);
  
  if (tokens <= maxTokens) {
    return context;
  }

  // Split by sections: keep header + stats, drop old records
  const sections = context.split('## Data Breakdown');
  if (sections.length < 2) {
    // Fallback: just truncate lines
    const lines = context.split('\n');
    return lines.slice(0, Math.floor(lines.length * 0.6)).join('\n') + '\n\n...[truncated]...';
  }

  const header = sections[0];
  const recordSection = sections[1];
  
  // Try to keep last 24 hours of records
  const recordLines = recordSection.split('\n');
  const dataRowStart = recordLines.findIndex(l => l.startsWith('|') && l.includes('Timestamp'));
  
  if (dataRowStart === -1) {
    return header + '\n\n[Data truncated for size]';
  }

  // Keep header + last 12 records + interpretation reference
  const truncated = [
    header,
    recordLines.slice(0, dataRowStart + 1).join('\n'),
    recordLines.slice(Math.max(dataRowStart + 1, recordLines.length - 14)).join('\n'),
  ].join('\n');

  return truncated;
};

/**
 * Auto-cleanup expired cache entries
 */
const cleanupCache = (duration: number = CACHE_DURATION_MS): void => {
  const now = Date.now();
  let removed = 0;
  
  for (const [key, entry] of contextCache.entries()) {
    if (now - entry.timestamp > duration * 2) {
      contextCache.delete(key);
      removed++;
    }
  }
  
  if (removed > 0) {
    console.log(`🧹 RAG cache cleanup: removed ${removed} expired entries`);
  }
};

/**
 * Start periodic cache cleanup (call once on app init)
 */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export const startCacheCleanup = (interval = 600000): void => {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    cleanupCache();
  }, interval);
  
  console.log('🔄 RAG cache cleanup scheduled');
};

export const stopCacheCleanup = (): void => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('⏹️ RAG cache cleanup stopped');
  }
};

/**
 * Calculate time range in days based on window (used for hourly_aggregates path only)
 */
const getTimeWindowDays = (window: 'last_hour' | 'last_24h' | 'last_7d'): number => {
  const windows = {
    'last_hour': 1 / 24,
    'last_24h': 1,
    'last_7d': 7,
  };
  return windows[window];
};

/**
 * Execute query with exponential backoff retry
 */
const queryWithRetry = async <T>(
  query: () => Promise<T>,
  maxRetries: number = 3,
  backoffMs: number = 1000
): Promise<T> => {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await query();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        console.error(`❌ Query failed after ${maxRetries} attempts:`, error);
        throw error;
      }

      const delay = Math.pow(2, attempt - 1) * backoffMs;
      console.warn(
        `⚠️ Query attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`,
        error
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Query failed unexpectedly');
};

/** Short windows use period_aggregates */
const SHORT_WINDOWS: TrendPeriod[] = ['30m', '1h', '4h', '12h'];
const isShortWindow = (w: TimeWindow): w is TrendPeriod =>
  (SHORT_WINDOWS as string[]).includes(w as string);

/**
 * Get formatted date string (YYYY-MM-DD)
 */
const getFormattedDate = (daysBack: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().split('T')[0];
};

/**
 * Format number to 2 decimal places
 */
const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return Number(value).toFixed(2);
};

/**
 * Format THI value with interpretation (cached results)
 */
const thiInterpretations = {
  normal: '(Normal - No stress)',
  alert: '(Alert - Mild heat stress)',
  concern: '(Concern - Moderate heat stress)',
  critical: '(Critical - Severe heat stress)',
};

const formatTHIWithContext = (thi: number): string => {
  let interpretation = thiInterpretations.normal;
  if (thi >= 70 && thi < 75) {
    interpretation = thiInterpretations.alert;
  } else if (thi >= 75 && thi < 80) {
    interpretation = thiInterpretations.concern;
  } else if (thi >= 80) {
    interpretation = thiInterpretations.critical;
  }
  return `${formatNumber(thi)} ${interpretation}`;
};

/**
 * Pre-compute circadian baseline delta for a single record.
 * baseline = midpoint of the expected range for that hour.
 * delta = actual_activity - baseline  (negative = below expected, positive = above)
 */
const getCircadianDelta = (
  activity: number,
  hour: number
): { baseline: number; delta: number; label: string } => {
  const slot = CIRCADIAN_BASELINE[hour] ?? { min: 0, max: 2 };
  const baseline = (slot.min + slot.max) / 2;
  const delta = Math.round((activity - baseline) * 100) / 100;
  let label: string;
  if (delta <= -2)      label = '⬇ Well below (lethargy risk)';
  else if (delta < 0)  label = '↓ Below baseline';
  else if (delta >= 2) label = '⬆ Well above (distress risk)';
  else                 label = '↑ Above baseline';
  return { baseline: Math.round(baseline * 100) / 100, delta, label };
};

/**
 * Format activity using the stored state label from DB (falls back to number-based if absent)
 */
const formatActivityWithContext = (activity: number, activityState?: string): string => {
  if (activityState) {
    return `${formatNumber(activity)}g - ${activityState}`;
  }
  // Fallback: derive label from number using thresholds
  if (activity >= 2.0) return `${formatNumber(activity)}g - High Activity/Distress`;
  if (activity >= 1.05) return `${formatNumber(activity)}g - Standing/Minor Movement`;
  return `${formatNumber(activity)}g - Resting`;
};

/**
 * Validate a single sensor record for data integrity
 * Returns true if record is usable, false if invalid/corrupted
 */
const isValidRecord = (record: any): boolean => {
  // Check temperature: -50°C to 50°C (reasonable range for pig monitoring)
  if (
    record.mean_temp !== null &&
    record.mean_temp !== undefined &&
    (isNaN(record.mean_temp) || record.mean_temp < -50 || record.mean_temp > 50)
  ) {
    return false;
  }

  // Check heart rate: 0-200 bpm (reasonable range)
  if (
    record.mean_hr !== null &&
    record.mean_hr !== undefined &&
    (isNaN(record.mean_hr) || record.mean_hr < 0 || record.mean_hr > 200)
  ) {
    return false;
  }

  // Check activity: 0-3g (reasonable range for accelerometer)
  if (
    record.mean_activity !== null &&
    record.mean_activity !== undefined &&
    (isNaN(record.mean_activity) || record.mean_activity < 0 || record.mean_activity > 3)
  ) {
    return false;
  }

  // Check humidity: 0-100%
  if (
    record.mean_humidity !== null &&
    record.mean_humidity !== undefined &&
    (isNaN(record.mean_humidity) || record.mean_humidity < 0 || record.mean_humidity > 100)
  ) {
    return false;
  }

  // Check THI: 0-100 (Temperature-Humidity Index)
  if (
    record.thi !== null &&
    record.thi !== undefined &&
    (isNaN(record.thi) || record.thi < 0 || record.thi > 100)
  ) {
    return false;
  }

  // Check environment temperature
  if (
    record.mean_env_temp !== null &&
    record.mean_env_temp !== undefined &&
    (isNaN(record.mean_env_temp) || record.mean_env_temp < -50 || record.mean_env_temp > 50)
  ) {
    return false;
  }

  return true;
};

/**
 * OPTIMIZED: Calculate statistics in single pass through data
 * Filters invalid records before processing
 */
const calculateStatistics = (aggregates: any[]): { stats: HealthStatistics; dataQuality: string; validRecords: any[] } => {
  // Validate records upfront and filter out corrupted data
  const validRecords = aggregates.filter((record, index) => {
    const valid = isValidRecord(record);
    if (!valid) {
      console.warn(`⚠️ Skipping invalid record at index ${index}:`, {
        temp: record.mean_temp,
        hr: record.mean_hr,
        activity: record.mean_activity,
        thi: record.thi,
      });
    }
    return valid;
  });

  if (validRecords.length === 0) {
    console.warn(`⚠️ No valid records found! All ${aggregates.length} records were invalid.`);
  } else if (validRecords.length < aggregates.length) {
    const discarded = aggregates.length - validRecords.length;
    console.log(
      `✅ Data validation: kept ${validRecords.length}/${aggregates.length} records (discarded ${discarded} invalid)`
    );
  }

  const fieldsToCheck = ['mean_temp', 'mean_env_temp', 'mean_humidity', 'mean_activity', 'thi'];
  
  // Single pass through validated data
  const result = validRecords.reduce(
    (acc, record) => {
      // Collect values
      if (record.mean_temp !== null && record.mean_temp !== undefined) {
        acc.temps.push(record.mean_temp);
      }
      if (record.mean_activity !== null && record.mean_activity !== undefined) {
        acc.activities.push(record.mean_activity);
      }
      if (record.thi !== null && record.thi !== undefined) {
        acc.thiBatches.push(record.thi);
      }
      if (record.lethargy_alert === 1) {
        acc.lethargyAlerts++;
      }

      // Track HR for averaging
      acc.hrSum += record.mean_hr || 0;

      // Pre-compute circadian delta (activity - expected midpoint for that hour)
      const recordHour: number =
        record.hour !== undefined && record.hour !== null
          ? Number(record.hour)
          : record.bucket_start
            ? new Date(record.bucket_start).getHours()
            : -1;
      if (recordHour >= 0 && record.mean_activity !== null && record.mean_activity !== undefined) {
        const slot = CIRCADIAN_BASELINE[recordHour] ?? { min: 0, max: 2 };
        const baseline = (slot.min + slot.max) / 2;
        acc.deltaSum += record.mean_activity - baseline;
        acc.deltaCount++;
      }

      // Count data quality (during same pass)
      fieldsToCheck.forEach(field => {
        acc.totalFields++;
        if (record[field] !== null && record[field] !== undefined) {
          acc.filledFields++;
        }
      });

      return acc;
    },
    {
      temps: [] as number[],
      activities: [] as number[],
      thiBatches: [] as number[],
      lethargyAlerts: 0,
      hrSum: 0,
      deltaSum: 0,
      deltaCount: 0,
      totalFields: 0,
      filledFields: 0,
    }
  );

  // Calculate averages/min/max
  const avgTemp = result.temps.length > 0 ? result.temps.reduce((a: number, b: number) => a + b, 0) / result.temps.length : 0;
  const avgActivity = result.activities.length > 0 ? result.activities.reduce((a: number, b: number) => a + b, 0) / result.activities.length : 0;
  const avgTHI = result.thiBatches.length > 0 ? result.thiBatches.reduce((a: number, b: number) => a + b, 0) / result.thiBatches.length : 0;
  const minTemp = result.temps.length > 0 ? Math.min(...result.temps) : 0;
  const maxTemp = result.temps.length > 0 ? Math.max(...result.temps) : 0;
  const avgHR = validRecords.length > 0 ? Math.round(result.hrSum / validRecords.length) : 0;
  const avgCircadianDelta = result.deltaCount > 0
    ? Math.round((result.deltaSum / result.deltaCount) * 100) / 100
    : 0;

  // Calculate data quality percentage
  const qualityPercent = result.totalFields > 0 ? (result.filledFields / result.totalFields) * 100 : 0;
  let dataQuality = 'Poor (<60%)';
  if (qualityPercent >= 95) dataQuality = 'Excellent (95%+)';
  else if (qualityPercent >= 80) dataQuality = 'Good (80-95%)';
  else if (qualityPercent >= 60) dataQuality = 'Fair (60-80%)';

  const stats: HealthStatistics = {
    avgTemp: Math.round(avgTemp * 10) / 10,
    minTemp: Math.round(minTemp * 10) / 10,
    maxTemp: Math.round(maxTemp * 10) / 10,
    avgHR,
    avgActivity: Math.round(avgActivity * 10) / 10,
    avgTHI: Math.round(avgTHI * 10) / 10,
    avgCircadianDelta,
    lethargyAlerts: result.lethargyAlerts,
    dataQuality,
  };

  return { stats, dataQuality, validRecords };
};

/**
 * OPTIMIZED: Format aggregated data as Markdown for LLM consumption
 */
const formatContextForLLM = (
  pigId: string,
  timeWindow: string,
  aggregates: any[],
  stats: HealthStatistics
): string => {
  const lines: string[] = [];

  // --- Header ---
  lines.push('# Pig Health Monitoring Report');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| **Pig ID** | ${pigId} |`);
  lines.push(`| **Time Window** | ${timeWindow} |`);
  lines.push(`| **Data Points** | ${aggregates.length} records |`);
  lines.push(`| **Data Quality** | ${stats.dataQuality} |`);
  lines.push('');

  // --- Summary Statistics ---
  lines.push('## Aggregate Statistics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| **Body Temperature (avg)** | ${formatNumber(stats.avgTemp)}°C |`);
  lines.push(`| **Body Temperature (range)** | ${formatNumber(stats.minTemp)}°C – ${formatNumber(stats.maxTemp)}°C |`);
  lines.push(`| **Heart Rate (avg)** | ${stats.avgHR} bpm |`);
  lines.push(`| **Activity Level (avg)** | ${formatActivityWithContext(stats.avgActivity)} |`);
  lines.push(`| **THI (avg)** | ${formatTHIWithContext(stats.avgTHI)} |`);
  lines.push(`| **Lethargy Alerts** | ${stats.lethargyAlerts} instance(s) |`);
  const deltaSign = stats.avgCircadianDelta >= 0 ? '+' : '';
  lines.push(`| **Avg Circadian Delta** | ${deltaSign}${stats.avgCircadianDelta}g vs expected baseline |`);
  lines.push('');

  // --- Per-Record Breakdown ---
  lines.push(`## Data Breakdown (${aggregates.length} records)`);
  lines.push('');
  lines.push('| # | Timestamp | Temp (°C) | Humidity (%) | Heart Rate | Activity | Circadian Δ | THI | Status |');
  lines.push('|---|---|---|---|---|---|---|---|---|');

  aggregates.forEach((record, index) => {
    const timestamp = record.date
      ? `${record.date} ${String(record.hour ?? record.bucket_start ?? '?').padStart(2, '0')}:00`
      : record.bucket_start
        ? new Date(record.bucket_start).toISOString().replace('T', ' ').slice(0, 16)
        : 'Unknown';
    const temp     = formatNumber(record.mean_temp);
    const humidity = formatNumber(record.mean_humidity);
    const hr       = record.mean_hr ? `${Math.round(record.mean_hr)} bpm` : 'N/A';
    const activity = formatActivityWithContext(record.mean_activity, record.dominant_activity_state);
    const thi      = record.thi ? formatTHIWithContext(record.thi) : 'N/A';
    const status   = record.lethargy_alert ? '⚠️ Lethargy' : '✅ Normal';

    // Pre-compute circadian delta per record
    const recordHour: number =
      record.hour !== undefined && record.hour !== null
        ? Number(record.hour)
        : record.bucket_start
          ? new Date(record.bucket_start).getHours()
          : -1;
    const circDelta = recordHour >= 0
      ? (() => {
          const { baseline, delta, label } = getCircadianDelta(record.mean_activity ?? 0, recordHour);
          const sign = delta >= 0 ? '+' : '';
          return `${sign}${delta}g vs ${baseline}g (${label})`;
        })()
      : 'N/A';

    lines.push(`| ${index + 1} | ${timestamp} | ${temp} | ${humidity} | ${hr} | ${activity} | ${circDelta} | ${thi} | ${status} |`);
  });

  lines.push('');

  // --- Interpretation Notes ---
  lines.push('## Interpretation Reference');
  lines.push('');
  lines.push('**THI (Temperature-Humidity Index) scale:**');
  lines.push('- < 70 → Normal (no heat stress)');
  lines.push('- 70–74 → Mild heat stress');
  lines.push('- 75–79 → Moderate heat stress');
  lines.push('- ≥ 80 → Severe heat stress');
  lines.push('');
  lines.push('**Activity state thresholds:**');
  lines.push('- < 1.05g → Resting');
  lines.push('- 1.05–1.99g → Standing / Minor Movement');
  lines.push('- ≥ 2.0g → High Activity / Distress');
  lines.push('');
  lines.push('**Circadian Delta (Δ)** = actual activity − expected midpoint for that hour of day. Negative = below expected (lethargy risk), positive = above expected (distress/excitement risk).');
  lines.push('');
  lines.push('**Lethargy alerts** are triggered when activity falls below the expected circadian baseline for the recorded hour.');

  return lines.join('\n');
};

/**
 * OPTIMIZED: Main function with caching, retry logic, token limiting, and sanitization
 */
export const prepareRAGContext = async (
  pigId: string,
  timeWindow: TimeWindow
): Promise<string> => {
  const config = getRAGConfig();
  const cacheKey = `${pigId}:${timeWindow}`;

  // Check cache first
  const cached = contextCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    if (config.debug) {
      console.log(`✅ Cache hit for ${cacheKey}`);
    }
    return cached.context;
  }

  try {
    if (config.debug) {
      console.log(`🔍 Retrieving RAG context for pig ${pigId}, window: ${timeWindow}`);
    }

    let aggregates: any[];

    // Fetch with retry logic
    if (isShortWindow(timeWindow)) {
      // ─ Short windows: query pre-bucketed period_aggregates ─
      aggregates = await queryWithRetry(
        () => dbService.getPeriodAggregates(timeWindow, pigId),
        config.maxRetries,
        config.retryBackoffMs
      );
    } else {
      // ─ Long windows: query daily hourly_aggregates ─
      const windowDays = getTimeWindowDays(timeWindow);
      const endDate = getFormattedDate(0);
      const startDate = getFormattedDate(windowDays);
      aggregates = await queryWithRetry(
        () => dbService.getHourlyAggregates(startDate, endDate, pigId),
        config.maxRetries,
        config.retryBackoffMs
      );
    }

    if (!aggregates || aggregates.length === 0) {
      if (config.debug) {
        console.warn(`⚠️ No data found for pig ${pigId}`);
      }
      return formatEmptyContextMessage(pigId, timeWindow);
    }

    if (config.debug) {
      console.log(`📊 Retrieved ${aggregates.length} records for pig ${pigId}`);
    }

    // Calculate statistics and format (validates records internally)
    const { stats, dataQuality, validRecords } = calculateStatistics(aggregates);
    let formattedContext = formatContextForLLM(pigId, timeWindow, validRecords, stats);

    // Check token count and truncate if needed
    const tokenCount = estimateContextTokens(formattedContext);
    if (config.debug) {
      console.log(`📈 Context token estimate: ${tokenCount}/${config.contextTokenLimit}`);
    }

    if (tokenCount > (config.contextTokenLimit || 3500)) {
      console.warn(
        `⚠️ Context exceeds token limit (${tokenCount} > ${config.contextTokenLimit}), truncating...`
      );
      formattedContext = truncateContextToTokenLimit(
        formattedContext,
        config.contextTokenLimit || 3500
      );

      const newTokenCount = estimateContextTokens(formattedContext);
      if (config.debug) {
        console.log(
          `✅ Truncated to ${newTokenCount} tokens (from ${tokenCount})`
        );
      }
    }

    // Sanitize to prevent prompt injection
    const sanitizedContext = sanitizeForPrompt(formattedContext);

    // Cache result
    contextCache.set(cacheKey, { context: sanitizedContext, timestamp: Date.now() });

    return sanitizedContext;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to retrieve RAG context for pig ${pigId}:`, errorMsg);
    throw error;
  }
};

/**
 * Clear cache (call periodically or on manual refresh)
 */
export const clearRAGCache = (): void => {
  contextCache.clear();
  console.log('🧹 RAG cache cleared');
};

/**
 * Format message when no data is available
 */
const formatEmptyContextMessage = (pigId: string, timeWindow: string): string => {
  return `# Pig Health Monitoring Report

| Field | Value |
|---|---|
| **Pig ID** | ${pigId} |
| **Time Window** | ${timeWindow} |
| **Data Quality** | Poor — No data available |

> ⚠️ No health data found for this pig in the specified time window. The pig may not have been connected yet, or data has not been collected for this period.
This may indicate:
1. The pig has not been monitored yet
2. The monitoring period is too recent
3. Data retrieval failed

Please ensure sensors are properly connected and data has been collected.`;
};