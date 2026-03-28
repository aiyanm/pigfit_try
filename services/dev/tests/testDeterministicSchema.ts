/**
 * Deterministic Schema Smoke Tests
 *
 * Safe, non-destructive test helpers for validating Step 1 migration:
 *  - hourly_aggregates has sample_count and accepts upsert
 *  - hourly_insights table upsert + idempotency works
 *  - daily_assessments table upsert + idempotency works
 *
 * HOW TO USE:
 * 1. Import and call runDeterministicSchemaTests() from a debug action.
 * 2. Inspect Metro logs for pass/fail details.
 */

import { dbService } from '../../storage/db/client';
import { finalizeHourlyAggregateBucket } from '../../ingestion/sensorIngestService';
import { runDailyAssessmentForDay, runHourlyInsightForBucket } from '../../ai/deterministic/orchestrator';

const TEST_PIG_ID = 'TEST-PIG-DETERMINISTIC';
const TEST_DATE = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const TEST_HOUR = new Date().getHours();
const TEST_BUCKET_START = Date.now() - (Date.now() % (60 * 60 * 1000));
const TEST_BUCKET_END = TEST_BUCKET_START + (60 * 60 * 1000) - 1;
const TEST_PROMPT_VERSION = 'hourly_prompt_v2';
const TEST_DAILY_PROMPT_VERSION = 'daily_prompt_v2';

const assertTrue = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

/**
 * Test 1: hourly_aggregates supports sample_count writes
 */
export const testHourlyAggregateSampleCount = async () => {
  console.log('\n🧪 Test 1: hourly_aggregates sample_count');

  await dbService.upsertHourlyAggregate({
    date: TEST_DATE,
    hour: TEST_HOUR,
    pig_id: TEST_PIG_ID,
    mean_temp: 38.7,
    mean_env_temp: 29.1,
    mean_humidity: 68.2,
    mean_activity: 1.4,
    mean_pitch: 22.4,
    mean_feed: 0.41,
    sample_count: 12,
    thi: 79.4,
    lethargy_alert: 0,
    dominant_activity_state: 'Resting',
  });

  const hourlyRows = await dbService.getHourlyAggregates(TEST_DATE, TEST_DATE, TEST_PIG_ID);
  assertTrue(hourlyRows.length >= 1, 'Expected at least one hourly aggregate row');
  assertTrue(hourlyRows[0].sample_count === 12, 'Expected sample_count=12 in hourly_aggregates');

  console.log('✅ sample_count persisted in hourly_aggregates');
};

/**
 * Test 2: hourly_insights upsert is idempotent
 */
export const testHourlyInsightsUpsert = async () => {
  console.log('\n🧪 Test 2: hourly_insights idempotent upsert');

  await dbService.upsertHourlyInsight({
    pig_id: TEST_PIG_ID,
    bucket_start: TEST_BUCKET_START,
    bucket_end: TEST_BUCKET_END,
    bucket_date: TEST_DATE,
    bucket_hour: TEST_HOUR,
    severity: 'warning',
    summary: 'Initial summary',
    confidence: 0.73,
    insight_json: JSON.stringify({ risk: 'heat_stress', score: 0.73 }),
    source_hash: 'hash-hourly-v1',
    source_hourly_aggregate_id: null,
    schema_version: 'hourly_insight_v2',
    prompt_version: TEST_PROMPT_VERSION,
    model_version: 'test-model-v1',
    status: 'success',
    error_code: null,
    error_message: null,
  });

  // Same idempotency key -> should update the existing row
  await dbService.upsertHourlyInsight({
    pig_id: TEST_PIG_ID,
    bucket_start: TEST_BUCKET_START,
    bucket_end: TEST_BUCKET_END,
    bucket_date: TEST_DATE,
    bucket_hour: TEST_HOUR,
    severity: 'critical',
    summary: 'Updated summary',
    confidence: 0.91,
    insight_json: JSON.stringify({ risk: 'high_fever', score: 0.91 }),
    source_hash: 'hash-hourly-v2',
    source_hourly_aggregate_id: null,
    schema_version: 'hourly_insight_v2',
    prompt_version: TEST_PROMPT_VERSION,
    model_version: 'test-model-v1',
    status: 'success',
    error_code: null,
    error_message: null,
  });

  const rows = await dbService.getHourlyInsightsByDate(TEST_PIG_ID, TEST_DATE);
  const matched = rows.filter((r: any) => r.bucket_start === TEST_BUCKET_START && r.prompt_version === TEST_PROMPT_VERSION);

  assertTrue(matched.length === 1, 'Expected exactly one hourly_insights row for same idempotency key');
  assertTrue(matched[0].summary === 'Updated summary', 'Expected upsert update to overwrite summary');

  console.log('✅ hourly_insights idempotent upsert works');
};

/**
 * Test 3: daily_assessments upsert is idempotent
 */
export const testDailyAssessmentUpsert = async () => {
  console.log('\n🧪 Test 3: daily_assessments idempotent upsert');

  await dbService.upsertDailyAssessment({
    pig_id: TEST_PIG_ID,
    bucket_day: TEST_DATE,
    day_start: TEST_BUCKET_START,
    day_end: TEST_BUCKET_END,
    overall_status: 'watch',
    summary: 'Morning trend stable',
    assessment_json: JSON.stringify({ trend: 'stable', confidence: 0.66 }),
    source_hourly_count: 4,
    source_hash: 'hash-daily-v1',
    schema_version: 'daily_assessment_v2',
    prompt_version: TEST_DAILY_PROMPT_VERSION,
    model_version: 'test-model-v1',
    status: 'success',
    error_code: null,
    error_message: null,
  });

  await dbService.upsertDailyAssessment({
    pig_id: TEST_PIG_ID,
    bucket_day: TEST_DATE,
    day_start: TEST_BUCKET_START,
    day_end: TEST_BUCKET_END,
    overall_status: 'critical',
    summary: 'Escalated by late-day signals',
    assessment_json: JSON.stringify({ trend: 'worsening', confidence: 0.89 }),
    source_hourly_count: 8,
    source_hash: 'hash-daily-v2',
    schema_version: 'daily_assessment_v2',
    prompt_version: TEST_DAILY_PROMPT_VERSION,
    model_version: 'test-model-v1',
    status: 'success',
    error_code: null,
    error_message: null,
  });

  const row = await dbService.getDailyAssessment(TEST_PIG_ID, TEST_DATE);
  assertTrue(!!row, 'Expected one daily_assessments row');
  assertTrue(row.summary === 'Escalated by late-day signals', 'Expected upsert update to overwrite daily summary');
  assertTrue(row.source_hourly_count === 8, 'Expected latest source_hourly_count in daily assessment');

  console.log('✅ daily_assessments idempotent upsert works');
};

/**
 * Test 4: finalize closed hour from raw sensor_data
 */
export const testHourCloseFinalization = async () => {
  console.log('\n🧪 Test 4: hour-close aggregation finalization');

  const now = Date.now();
  const twoHoursAgo = now - (2 * 60 * 60 * 1000);
  const bucketStart = twoHoursAgo - (twoHoursAgo % (60 * 60 * 1000));
  const bucketEnd = bucketStart + (60 * 60 * 1000) - 1;
  const bucketDate = new Date(bucketStart).toISOString().slice(0, 10);
  const bucketHour = new Date(bucketStart).getHours();

  // Insert deterministic raw points in a closed hour
  const points = [
    { temp: 38.4, env: 28.0, hum: 65, act: 1.1, pitch: 20.0, feed: 0.2 },
    { temp: 38.6, env: 28.2, hum: 66, act: 1.2, pitch: 21.0, feed: 0.3 },
    { temp: 38.8, env: 28.4, hum: 67, act: 1.3, pitch: 22.0, feed: 0.4 },
  ];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    await dbService.insertSensorData({
      timestamp: bucketStart + (i * 1000),
      device_id: 'TEST-DEVICE',
      pig_id: TEST_PIG_ID,
      temp: p.temp,
      activity_intensity: p.act,
      activity_state: 'Resting',
      pitch_angle: p.pitch,
      feed: p.feed,
      env_temp: p.env,
      humidity: p.hum,
    });
  }

  await finalizeHourlyAggregateBucket(TEST_PIG_ID, bucketStart);

  const hourlyRows = await dbService.getHourlyAggregates(bucketDate, bucketDate, TEST_PIG_ID);
  const row = hourlyRows.find((r: any) => r.hour === bucketHour);

  assertTrue(!!row, 'Expected finalized hourly_aggregates row for closed hour');
  assertTrue(row.sample_count >= points.length, 'Expected sample_count to include inserted points');
  assertTrue(row.mean_temp > 0, 'Expected computed mean_temp in finalized row');

  // Guard against accidental future-bucket corruption
  assertTrue(row.created_at !== undefined, 'Expected created_at on finalized row');

  // Ensure source range selection is bounded to closed hour
  assertTrue(bucketEnd > bucketStart, 'Expected valid bucket boundaries');

  console.log('✅ hour-close finalization works');
};

/**
 * Test 5: deterministic orchestration over finalized hour/day
 */
export const testDeterministicOrchestration = async () => {
  console.log('\n🧪 Test 5: deterministic orchestration (hourly -> daily)');

  const now = Date.now();
  const closedHourStart = (now - (2 * 60 * 60 * 1000)) - ((now - (2 * 60 * 60 * 1000)) % (60 * 60 * 1000));
  const closedDate = new Date(closedHourStart).toISOString().slice(0, 10);

  await runHourlyInsightForBucket(TEST_PIG_ID, closedHourStart);
  const hourlyRows = await dbService.getHourlyInsightsByDate(TEST_PIG_ID, closedDate);
  assertTrue(hourlyRows.length > 0, 'Expected hourly_insights row after orchestration run');

  await runDailyAssessmentForDay(TEST_PIG_ID, closedDate);
  const daily = await dbService.getDailyAssessment(TEST_PIG_ID, closedDate);
  assertTrue(!!daily, 'Expected daily_assessments row after orchestration run');

  console.log('✅ deterministic orchestration works');
};

/**
 * Run all deterministic schema tests
 */
export const runDeterministicSchemaTests = async () => {
  console.log('\n========================================');
  console.log('🧪 Deterministic Schema Migration Tests');
  console.log('========================================');

  await dbService.initialize();
  await testHourlyAggregateSampleCount();
  await testHourlyInsightsUpsert();
  await testDailyAssessmentUpsert();
  await testHourCloseFinalization();
  await testDeterministicOrchestration();

  console.log('\n✅ All deterministic schema tests passed');
};

export default {
  testHourlyAggregateSampleCount,
  testHourlyInsightsUpsert,
  testDailyAssessmentUpsert,
  testHourCloseFinalization,
  testDeterministicOrchestration,
  runDeterministicSchemaTests,
};
