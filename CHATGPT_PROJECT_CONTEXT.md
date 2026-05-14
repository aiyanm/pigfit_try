# PigFit ChatGPT Project Context

Use this file as the main project context for ChatGPT conversations about PigFit.
It describes the current implementation, data schema, analysis pipeline, and deterministic insight generation flow.

## Project Overview

PigFit is an Expo React Native app for monitoring a BLE-enabled pig wearable. The app connects to a device named `PigFit_Device`, decodes telemetry packets, stores observations locally in SQLite, builds analytics summaries, and generates farmer-facing health insights.

The product is local-first. Raw sensor data, aggregate analytics, device metadata, feeding settings, and generated insight rows are persisted in the app database. AI output is not generated from free-form chat history. It is generated from structured analytics rows and validated against fixed JSON schemas.

## Tech Stack

- Expo 54
- React Native 0.81
- React 19
- TypeScript
- React Navigation bottom tabs
- `react-native-ble-plx` for Bluetooth Low Energy device scanning and connection
- `expo-sqlite` for local persistence
- `expo-notifications` for local notifications
- `nativewind` for utility styling
- Groq API for deterministic structured insight generation

## Data Collection Flow

1. `App.tsx` initializes app services, including the local database and notifications.
2. `useBLE.ts` scans for the BLE peripheral named `PigFit_Device`.
3. After connection, `useBLE.ts` decodes incoming binary telemetry packets into sensor readings.
4. Decoded readings are passed to `logSensorData()` in `services/ingestion/sensorIngestService.ts`.
5. `logSensorData()` tags each reading with deterministic health flags using `services/diagnostics/metricsService.ts`.
6. Tagged readings are inserted into the local SQLite database through `dbService` in `services/storage/db/client.ts`.
7. When an hour closes, the app finalizes the hourly aggregate, generates an hourly insight, and may generate or refresh the daily assessment.

The default live pig ID is currently `LIVE-PIG-01`.

## SQLite Database Schema

The app opens a local SQLite database named `pigfit_data.db` using `expo-sqlite`. The schema is created in `services/storage/db/client.ts`.

### `sensor_data`

Source table for raw BLE telemetry plus derived deterministic flags.

Important fields:

- `id`: auto-increment primary key
- `timestamp`: observation timestamp in milliseconds
- `device_id`: source device identifier
- `pig_id`: pig identifier
- `temp`: pig body temperature signal
- `activity_intensity`: motion/activity magnitude
- `activity_state`: derived activity classification
- `pitch_angle`: posture angle
- `accel_x`, `accel_y`, `accel_z`: accelerometer readings
- `gyro_x`, `gyro_y`, `gyro_z`: gyroscope readings
- `feeding_posture_detected`: raw feeding posture signal
- `env_temp`: environmental temperature
- `humidity`: environmental humidity
- `thi`: temperature-humidity index
- `fever_flag`: deterministic fever flag
- `lethargy_flag`: deterministic low-activity flag
- `heat_stress_flag`: deterministic heat stress flag
- `severe_heat_flag`: deterministic severe heat flag
- `within_feeding_window`: whether a feeding confirmation window applies
- `true_eating_event`: operator-confirmed eating event
- `raw_risk_label`: compact rule label such as `normal`, `fever`, `heat_stress`, `severe_heat`, `lethargy`, or `feeding_posture`
- `created_at`: database insert timestamp

### `hourly_aggregates`

Per-hour analytics summaries used for charts and hourly insight generation.

Important fields:

- `date`: local date string
- `hour`: local hour number
- `pig_id`: pig identifier
- `mean_temp`, `mean_env_temp`, `mean_humidity`, `mean_activity`, `mean_pitch`: hourly averages
- `max_temp`, `max_thi`: hourly peak values
- `sample_count`: number of raw observations in the hour
- `thi`: average THI for the hour
- `lethargy_alert`: whether lethargy was observed in the hour
- `dominant_activity_state`: dominant activity class
- `fever_event_count`: count of fever-flagged observations
- `heat_stress_event_count`: count of heat-stress observations
- `severe_heat_event_count`: count of severe heat observations
- `true_eating_event_count`: count of operator-confirmed feeding events
- `resting_ratio`, `standing_ratio`, `distress_ratio`: activity-state ratios
- `feeding_schedule_adherence`: ratio based on confirmed feeding events
- `high_risk_hour_flag`: whether fever or severe heat was present

Uniqueness is enforced by `(date, hour, pig_id)`.

### `period_aggregates`

Pre-bucketed trend data for Analyze screen chart windows.

Supported periods:

- `30m`
- `1h`
- `4h`
- `12h`

Important fields:

- `period_type`
- `bucket_start`
- `bucket_end`
- `pig_id`
- average fields for temperature, environment, humidity, activity, and pitch
- peak fields such as `max_temp` and `max_thi`
- event counts and activity ratios
- `dominant_activity_state`
- `sample_count`

Uniqueness is enforced by `(period_type, bucket_start, pig_id)`.

### `hourly_insights`

Stores deterministic hourly AI/rule outputs.

Important fields:

- `pig_id`
- `bucket_start`
- `bucket_end`
- `bucket_date`
- `bucket_hour`
- `severity`: `normal`, `warning`, or `critical`
- `summary`
- `confidence`
- `insight_json`: full structured insight JSON
- `source_hash`: hash of the aggregate inputs used to generate the row
- `source_hourly_aggregate_id`
- `schema_version`
- `prompt_version`
- `model_version`
- `status`: `success` or `failed`
- `rule_case`
- `rule_severity`
- `rule_reasoning_json`
- `error_code`
- `error_message`

Uniqueness is enforced by `(pig_id, bucket_start, prompt_version)`.

### `daily_assessments`

Stores deterministic day-level assessments generated from hourly insights.

Important fields:

- `pig_id`
- `bucket_day`
- `day_start`
- `day_end`
- `overall_status`: `normal`, `watch`, or `critical`
- `summary`
- `assessment_json`: full structured daily assessment JSON
- `source_hourly_count`
- `source_hash`
- `schema_version`
- `prompt_version`
- `model_version`
- `status`: `success` or `failed`
- `error_code`
- `error_message`

Uniqueness is enforced by `(pig_id, bucket_day, prompt_version)`.

### Other Tables

- `devices`: paired device metadata, including device ID, MAC, name, pairing time, and last connection time.
- `feeding_schedules`: feeding schedule settings per pig.
- `user_profile`: single-row farmer/farm profile.

## Data Analysis Pipeline

The analysis flow is deterministic before any AI provider is called.

### 1. Raw Reading Tagging

`tagSensorDataPoint()` in `services/diagnostics/metricsService.ts` enriches each reading with:

- THI
- fever flag
- heat stress flag
- severe heat flag
- lethargy flag
- activity state
- feeding confirmation fields
- raw risk label

### 2. Hourly Aggregation

`finalizeHourlyAggregateBucket()` loads all `sensor_data` rows for a pig and one hour, then computes:

- mean body temperature
- max body temperature
- mean environmental temperature
- mean humidity
- mean activity
- mean pitch
- average THI
- max THI
- event counts for fever, heat stress, severe heat, lethargy, and eating
- activity-state ratios
- dominant activity state
- feeding adherence estimate
- high-risk hour flag

The result is upserted into `hourly_aggregates`.

### 3. Period Aggregation

`refreshAllPeriodAggregates()` and `computeAndStorePeriodAggregates()` build chart-ready buckets for `30m`, `1h`, `4h`, and `12h` windows. These are stored in `period_aggregates`.

Short windows (`30m` and `1h`) prefer fresh raw observations so the Analyze screen does not show stale rollups.

### 4. Insight Storage

Hourly and daily insight outputs are stored in dedicated tables. The app keeps both display fields, such as severity and summary, and the full JSON body in `insight_json` or `assessment_json`.

## Deterministic Insight Generation

The deterministic insight pipeline lives in `services/ai/deterministic/orchestrator.ts` and `services/ai/deterministic/promptBuilder.ts`.

Important behavior:

- Hourly insights are generated from `hourly_aggregates`, not directly from raw BLE packets.
- Daily assessments are generated from successful hourly insight rows, not directly from raw packets.
- Groq is the configured provider for structured generation.
- The Groq call asks for JSON only and sends a compact structured context.
- Provider output is parsed and validated against TypeScript parsers in `services/ai/deterministic/contracts.ts`.
- If the provider fails or returns invalid output, local deterministic fallback builders generate the insight.
- Rule-based severity is always respected. The final output cannot downgrade below the analytics-derived rule severity.
- The app stores source hashes so unchanged inputs can be detected.

Current deterministic versions:

- Hourly schema: `hourly_insight_v2`
- Daily schema: `daily_assessment_v2`
- Hourly prompt: `hourly_prompt_v2`
- Daily prompt: `daily_prompt_v2`

Daily generation has a threshold helper:

- `MIN_SUCCESSFUL_HOURLY_INSIGHTS_FOR_DAILY = 8`

`maybeRunDailyAssessmentForDay()` skips generation until enough successful hourly insights exist. Manual/backfill paths can call `runDailyAssessmentForDay()` directly.

## Hourly Insight JSON Schema

Schema version: `hourly_insight_v2`

```json
{
  "schema_version": "hourly_insight_v2",
  "severity": "normal|warning|critical",
  "summary": "string",
  "confidence": 0.0,
  "probable_issue": "string",
  "key_evidence": ["string"],
  "differential_considerations": ["string"],
  "immediate_actions": ["string"],
  "escalation_triggers": ["string"],
  "uncertainty_notes": ["string"]
}
```

Field meanings:

- `severity`: hour-level status.
- `summary`: farmer-facing one-sentence summary.
- `confidence`: number from `0` to `1`, clamped by parser logic.
- `probable_issue`: best supported issue based only on provided analytics.
- `key_evidence`: concrete metrics supporting the conclusion.
- `differential_considerations`: alternate explanations or unresolved possibilities.
- `immediate_actions`: practical next steps.
- `escalation_triggers`: conditions that should trigger veterinary escalation.
- `uncertainty_notes`: data quality or confidence limitations.

## Daily Assessment JSON Schema

Schema version: `daily_assessment_v2`

```json
{
  "schema_version": "daily_assessment_v2",
  "overall_status": "normal|watch|critical",
  "summary": "string",
  "confidence": 0.0,
  "probable_issue": "string",
  "key_evidence": ["string"],
  "differential_considerations": ["string"],
  "immediate_actions": ["string"],
  "monitor_next_24h": ["string"],
  "escalation_triggers": ["string"],
  "uncertainty_notes": ["string"]
}
```

Field meanings:

- `overall_status`: day-level status.
- `summary`: farmer-facing day summary.
- `confidence`: number from `0` to `1`, clamped by parser logic.
- `probable_issue`: strongest day-level issue supported by hourly evidence.
- `key_evidence`: compact references to hourly insight counts and strongest hours.
- `differential_considerations`: possible explanations or unresolved causes.
- `immediate_actions`: practical day-level actions.
- `monitor_next_24h`: what to watch during the next day.
- `escalation_triggers`: conditions that should trigger veterinary escalation.
- `uncertainty_notes`: data quality or coverage limitations.

## Health Rules and Thresholds

Defined in `services/diagnostics/metricsService.ts`.

### THI

THI is calculated from environmental temperature and humidity:

```text
tempF = tempC * 9 / 5 + 32
thi = tempF - (0.55 - 0.55 * humidity / 100) * (tempF - 58)
```

The result is rounded to one decimal place.

### Temperature Rules

- Fever flag: body temperature greater than `39.5 C`.

### Heat Rules

- Heat stress flag: THI greater than or equal to `75`.
- Severe heat flag: THI greater than `79`.

### Activity Rules

- `Resting/Lethargy`: activity intensity below `1.05`.
- `Standing/Minor Movement`: activity intensity from `1.05` up to below `2.0`.
- `High Activity/Distress`: activity intensity greater than or equal to `2.0`.

### Raw Risk Label Priority

`buildRawRiskLabel()` assigns the first matching label in this priority:

1. `severe_heat`
2. `heat_stress`
3. `fever`
4. `lethargy`
5. `feeding_posture`
6. `normal`

### Hourly Rule Severity

The hourly orchestrator infers analytics severity from aggregate values:

- `critical` if severe heat is present, `max_thi` is above `79`, or fever and heat stress occur together.
- `warning` if fever, heat stress, or lethargy is present.
- `normal` if no major warning indicators are present.

Model output can add detail, but the final stored insight uses the maximum of model severity and rule severity.

## Important Files

- `App.tsx`: app bootstrap and providers.
- `useBLE.ts`: BLE scanning, connection, packet decoding, and live ingestion trigger.
- `screens/Analyze.tsx`: trend charts, insight display, backfill/debug actions.
- `services/storage/db/client.ts`: SQLite initialization, schema, migrations, and database operations.
- `services/ingestion/sensorIngestService.ts`: sensor logging, hourly aggregation, period aggregation, and insight triggers.
- `services/diagnostics/metricsService.ts`: THI calculation, thresholds, activity classification, and raw risk tagging.
- `services/ai/deterministic/orchestrator.ts`: hourly and daily deterministic insight orchestration.
- `services/ai/deterministic/promptBuilder.ts`: prompt/context construction and deterministic fallback output builders.
- `services/ai/deterministic/contracts.ts`: TypeScript contracts, parsers, and display normalization.
- `services/ai/providers/groqDeterministicProvider.ts`: Groq structured generation provider.
- `services/core/types.ts`: shared domain types.

## Current Assumptions and Limitations

- The BLE peripheral name is hardcoded as `PigFit_Device`.
- Live ingestion defaults to pig ID `LIVE-PIG-01`.
- The app is local-first and uses SQLite as the source of truth.
- The deterministic AI path depends on `GROQ_API_KEY` being available for provider-backed generation.
- If Groq is unavailable or returns invalid JSON, local fallback builders still produce structured output.
- Generated insights are decision-support summaries, not veterinary diagnoses.
- Feeding events are treated as operator-confirmed windows in the current tagging flow.
- The Analyze screen reads stored aggregates and deterministic insight rows.
- The schema supports multiple pigs, but current live ingestion is centered on the default live pig ID unless another ID is passed.
