# PigFit

PigFit is an Expo React Native app for monitoring a BLE-enabled pig wearable, storing telemetry in SQLite, and generating analytics-driven health insights for farmers.

## What The App Does

- Scans for a `PigFit_Device` over Bluetooth Low Energy.
- Connects to the device and parses 32-byte binary telemetry packets.
- Stores raw observations and derived flags in a local SQLite database.
- Builds hourly and period aggregates for charting and alert summaries.
- Generates deterministic hourly and daily health insights from stored analytics.
- Shows farmer-facing views for live status, trends, alerts, and basic device management.

## Tech Stack

- Expo 54
- React Native 0.81
- React 19
- TypeScript
- React Navigation bottom tabs
- `react-native-ble-plx` for BLE
- `expo-sqlite` for local persistence
- `expo-notifications` for local notifications
- `nativewind` for utility styling
- Groq SDK for deterministic AI insight generation

## Main Screens

- `Profile`: farmer profile placeholder UI plus device pairing and device renaming.
- `Dashboard`: live sensor snapshot from the connected device.
- `Analyze`: trend charts, hourly insights, daily assessments, admin/debug actions, and backfill tools.

## Project Structure

```text
App.tsx                     App bootstrap and providers
useBLE.ts                   BLE scanning, connection, packet parsing, logging trigger
providers/BLEProvider.tsx   BLE context provider
screens/                    Profile, Dashboard, Analyze UI
navigators/                 Bottom-tab navigation
services/
  app/                      Startup bootstrap
  ingestion/                Logging, aggregate refresh, analytics loaders
  diagnostics/              Rule-based metrics and tagging
  ai/                       Deterministic prompts, orchestration, provider adapters
  storage/                  SQLite client and repositories
  dev/tests/                Manual/dev validation helpers
```

## Runtime Data Flow

1. `App.tsx` initializes the database, AI config, and notifications.
2. `Profile` starts BLE scanning through `useBLE.ts`.
3. `useBLE.ts` connects to `PigFit_Device` and decodes binary packets.
4. `logSensorData()` stores raw readings and derived diagnostic flags.
5. Ingestion services build hourly and period aggregates from raw rows.
6. The Analyze screen reads aggregates and deterministic insight rows from SQLite.
7. Groq-backed deterministic analysis can generate hourly and daily summaries from stored analytics.

## Local Database

The app uses `expo-sqlite` and creates a local `pigfit_data.db` database at runtime.

Key tables:

- `sensor_data`: raw telemetry plus derived risk flags
- `hourly_aggregates`: per-hour summaries
- `period_aggregates`: pre-bucketed trend windows for `30m`, `1h`, `4h`, `12h`
- `devices`: paired device metadata
- `feeding_schedules`: feeding schedule settings per pig
- `hourly_insights`: deterministic hourly outputs
- `daily_assessments`: deterministic daily outputs

## Environment Setup

The deterministic AI path expects a Groq API key.

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key
```

The Babel config uses `react-native-dotenv`, and the app reads `process.env.GROQ_API_KEY` from `services/core/config.ts`.

## Getting Started

Install dependencies:

```bash
npm install
```

Start Expo:

```bash
npm start
```

Run on Android:

```bash
npm run android
```

Run on iOS:

```bash
npm run ios
```

## Verification

There is no dedicated `test` script in `package.json`.

Useful checks:

```bash
npx tsc --noEmit
```

You can also run the manual/dev helpers under `services/dev/tests/` as needed.

## Current Product Assumptions

- The BLE peripheral name is hardcoded as `PigFit_Device`.
- Live ingestion currently defaults to pig ID `LIVE-PIG-01`.
- Profile/farmer details are placeholder values in the UI.
- The Analyze screen exposes admin/debug tools directly inside the app.

## Additional Docs

- [services/README.md](/C:/Users/Admin/Documents/react_native/pigfit_try/services/README.md) for the service-layer architecture.
- [services/ai/deterministic/README.md](/C:/Users/Admin/Documents/react_native/pigfit_try/services/ai/deterministic/README.md) for the deterministic insights pipeline and current behavior.
- Sample database files are committed in the repo for reference/backups.

## Key Files To Read First

- [App.tsx](/C:/Users/Admin/Documents/react_native/pigfit_try/App.tsx)
- [useBLE.ts](/C:/Users/Admin/Documents/react_native/pigfit_try/useBLE.ts)
- [screens/Analyze.tsx](/C:/Users/Admin/Documents/react_native/pigfit_try/screens/Analyze.tsx)
- [services/ingestion/sensorIngestService.ts](/C:/Users/Admin/Documents/react_native/pigfit_try/services/ingestion/sensorIngestService.ts)
- [services/storage/db/client.ts](/C:/Users/Admin/Documents/react_native/pigfit_try/services/storage/db/client.ts)
- [services/core/config.ts](/C:/Users/Admin/Documents/react_native/pigfit_try/services/core/config.ts)

## Status

The app already has a solid local-first pipeline:

- BLE ingest works as the runtime entry point.
- SQLite is the source of truth for telemetry and analytics.
- Trend views and deterministic insight storage are present.

The biggest gaps are around production hardening, permission/config polish, and keeping the repo documentation in sync with the code.
