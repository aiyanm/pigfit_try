# Services Architecture

This folder uses a layered structure focused on readability and clear ownership.

## Layers

- `core/`: shared domain types and cross-cutting primitives.
- `ingestion/`: sensor logging, retrieval, and aggregate refresh flows.
- `diagnostics/`: deterministic health metrics and decision tree rules.
- `ai/`: deterministic prompt building, provider orchestration, and insight contracts.
- `storage/`: SQLite client and repository helpers.
- `app/`: startup/bootstrap wiring.

## Public Imports

For app/screen code, prefer the root barrel:

```ts
import {
  backfillDeterministicInsightsV2,
  evaluateDiagnosticHierarchy,
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

- The runtime AI path is deterministic insights, not free-form RAG analysis.
- Groq is the only configured deterministic provider.
- Public AI exports are limited to deterministic contracts and orchestrator helpers.
