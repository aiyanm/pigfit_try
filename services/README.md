# Services Architecture

This folder uses a layered structure focused on readability and clear ownership.

## Layers

- `core/`: shared domain types and cross-cutting primitives.
- `ingestion/`: sensor logging, retrieval, and aggregate refresh flows.
- `diagnostics/`: deterministic health metrics and decision tree rules.
- `ai/`: context building, prompt templates, and LLM analysis orchestration.
- `storage/`: SQLite client and repository helpers.
- `app/`: startup/bootstrap wiring.

## Public Imports

For app/screen code, prefer the root barrel:

```ts
import { analyzePigHealth, loadSensorData, evaluateDiagnosticHierarchy } from '../services';
```

This keeps UI modules decoupled from internal file paths.

## Root File Policy

Keep root-level files minimal and intentional:

- Runtime entry: `index.ts`, `notificationService.ts`
- No legacy facades in root `services/*.ts`
- Non-runtime code: place examples/tests under `dev/examples` and `dev/tests`

## Naming Conventions

- Canonical API uses `analyzePigHealth` / `analyzePigHealthStream`.
- Legacy aliases (`analyzepigHealth`, `analyzepigHealthStream`) remain temporarily for compatibility.
