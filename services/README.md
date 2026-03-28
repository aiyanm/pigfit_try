# Services Architecture

This folder uses a layered structure focused on readability and clear ownership.

## Layers

- `core/`: shared domain types and cross-cutting primitives.
- `ingestion/`: raw observation logging and analytics retrieval.
- `diagnostics/`: deterministic threshold tagging and metric formulas.
- `ai/`: analytics-grounded prompt building, provider orchestration, and insight contracts.
- `storage/`: SQLite client and repository helpers.
- `app/`: startup/bootstrap wiring.

## Public Imports

For app/screen code, prefer the root barrel:

```ts
import {
  backfillDeterministicInsightsV2,
  getCurrentHourlyAnalytics,
  getDeterministicInsights,
  loadSensorData,
  runDailyAssessmentForDay,
} from '../services';
```

This keeps UI modules decoupled from internal file paths.

## Root File Policy

Keep root-level files minimal and intentional:

- Runtime entry: `index.ts`, `notificationService.ts`
- No legacy facades in root `services/*.ts`
- Non-runtime code: place examples/tests under `dev/examples` and `dev/tests`

## AI Architecture

- The runtime AI path is deterministic insights built from aggregated analytics, not free-form RAG analysis.
- Groq is the only configured deterministic provider.
- Public AI exports are limited to deterministic contracts and orchestrator helpers.

## Runtime Flow

- BLE ingestion stores raw observations only.
- Threshold tagging converts raw observations into deterministic analytics facts.
- Hourly and period summaries are the source of truth for charts and farmer-facing summaries.
- AI reads analytics summaries and historical patterns, not live packets directly.
