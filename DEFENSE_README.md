# PigFit Defense Refresher

This file is a defense-focused refresher for the current `pigfit_try` repository. It is written to help you explain the app clearly, defend the technical choices, and avoid overclaiming.

## 30-Second Defense Script

PigFit is a wearable-based swine monitoring prototype. The wearable collects body and environmental data, sends them to a mobile app through Bluetooth Low Energy or BLE, and the app stores the data locally in SQLite, computes rule-based monitoring metrics such as THI, activity state, and event flags, then shows live status, trends, and hourly or daily summaries. It is a monitoring and decision-support system, not a veterinary diagnostic system.

## 60-Second Defense Script

The PigFit system has two main parts: the wearable device and the mobile application. The wearable captures temperature, humidity, movement, posture-related, and motion-axis data. The mobile app, built with React Native and Expo, scans for the PigFit BLE device, connects to it, validates the incoming binary packet, decodes the payload, and stores each reading in a local SQLite database. After storage, the app computes derived monitoring variables such as THI, fever flags, lethargy flags, heat stress flags, and activity state. It then builds hourly and time-window aggregates for analytics and charts. On top of those aggregates, the app generates structured hourly and daily summaries. The important point is that the insight layer is grounded on stored analytics, not on raw guesswork, and the system is still framed as a monitoring prototype rather than a diagnostic product.

## What PigFit Is

- A wearable-to-mobile monitoring prototype for pigs
- A local-first analytics app that can keep telemetry history on the phone
- A rule-based monitoring and decision-support tool
- A system that helps users observe patterns, not confirm disease diagnosis

## What PigFit Is Not

- Not a clinical diagnostic system
- Not a replacement for a veterinarian
- Not a production-hardened commercial deployment yet
- Not a full multi-pig live farm platform yet

## End-to-End System Flow

1. The wearable collects readings such as pig temperature, ambient temperature, humidity, accelerometer values, gyroscope values, and feeding posture status.
2. The wearable sends those readings to the mobile app over BLE.
3. The app scans for a peripheral named `PigFit_Device`.
4. The app connects to the BLE service and subscribes to the telemetry characteristic.
5. The incoming packet is validated using:
   - magic number
   - packet version
   - expected packet length
   - CRC-16 integrity check
6. The payload is decoded into usable numeric values.
7. The app stores the raw reading in SQLite.
8. The app tags the reading with derived monitoring values such as:
   - THI
   - activity state
   - fever flag
   - lethargy flag
   - heat stress flag
   - severe heat flag
9. The app builds hourly and period-based summaries for charts and analytics.
10. The app generates hourly and daily structured summaries from those aggregates.
11. The UI shows live values, trends, analytics cards, and notifications.

## Actual Tech Stack In This Repo

| Technology | Simple Meaning | Why It Was Used In PigFit |
| --- | --- | --- |
| React Native | Framework for building mobile apps using JavaScript or TypeScript | Lets one codebase power the app UI |
| Expo | Tooling and runtime layer on top of React Native | Speeds up mobile development and gives access to SQLite, notifications, and device utilities |
| TypeScript | JavaScript with static typing | Reduces bugs and makes data structures clearer |
| `react-native-ble-plx` | BLE communication library | Handles scanning, connecting, monitoring, and disconnect events |
| `expo-sqlite` | Embedded SQL database on the device | Stores telemetry and analytics locally even without cloud infrastructure |
| `expo-notifications` | Mobile notification API | Used for connection and disconnection notifications and alert support |
| React Navigation | Navigation library | Handles the app screen flow |
| NativeWind | Tailwind-style utility classes for React Native | Speeds up UI styling |
| Groq SDK | Provider client for structured LLM output | Used for structured hourly and daily text summaries on top of analytics |

## Technological Terms You Should Be Ready To Explain

### React Native

React Native is a mobile app framework that allows developers to build Android and iOS interfaces using JavaScript or TypeScript while still rendering native UI components. In PigFit, it was used so the app could be developed faster with one codebase.

Short answer:

> We used React Native to speed up development and keep the mobile code in one shared codebase while still targeting native mobile behavior.

### Expo

Expo is a development platform built around React Native. It simplifies setup, packaging, and access to mobile features like notifications, file system access, and SQLite.

Short answer:

> Expo reduced setup complexity and gave us ready access to mobile services like notifications and local storage.

### TypeScript

TypeScript is JavaScript with type checking. It helps define the expected shape of data, such as sensor packets, database rows, and analytics objects.

Short answer:

> TypeScript helps catch errors early and makes the structure of telemetry and analytics data explicit.

### Bluetooth Low Energy or BLE

BLE is a low-power wireless communication technology designed for short-range data exchange. It is appropriate for wearables because it consumes less power than many alternatives.

Short answer:

> BLE fits wearable systems because it supports short-range communication with low power consumption.

### BLE Service UUID and Characteristic UUID

A service UUID identifies a logical BLE service on the device, and a characteristic UUID identifies the specific data channel inside that service. In PigFit, the app subscribes to a telemetry characteristic to receive sensor packets.

Short answer:

> The UUIDs are identifiers that tell the app which BLE service and which data stream to connect to.

### Binary Packet

A binary packet is a compact byte-level representation of data sent from the wearable to the app. This is more efficient than sending verbose text.

Short answer:

> We use binary packets because they are smaller, faster to transmit, and better for low-power BLE communication.

### Base64

The BLE library exposes characteristic values as Base64-encoded strings, so the app first decodes Base64 and then interprets the bytes as sensor values.

Short answer:

> Base64 is just the transport format returned by the BLE library. We decode it before parsing the actual sensor bytes.

### Packet Validation

The app does not trust every incoming packet immediately. It checks the magic number, version, packet size, and CRC before decoding.

Short answer:

> Packet validation prevents corrupted or malformed data from being stored as if it were valid telemetry.

### Magic Number

A magic number is a fixed byte value placed at the start of the packet so the receiver can quickly verify that the packet is of the expected format. In this repo, the packet starts with `0xAA`.

### CRC-16

CRC means Cyclic Redundancy Check. It is an error-detection method used to verify that the packet contents were not corrupted during transmission.

Short answer:

> CRC-16 is a data integrity check. If the computed CRC does not match the received CRC, the app rejects the packet.

### DataView

`DataView` is a JavaScript API that lets the app read bytes as numeric data types such as `float32`. PigFit uses it to decode sensor values from the incoming packet.

Short answer:

> DataView lets us convert raw bytes into usable values like temperature, humidity, and motion readings.

### Local-First Architecture

Local-first means the app can store and work with its main data locally on the device instead of depending on a remote cloud database for every operation.

Short answer:

> We chose a local-first design so the app can store telemetry and show history even without relying on continuous internet connectivity.

### SQLite

SQLite is a lightweight relational database stored directly on the device. PigFit uses it to store sensor data, hourly aggregates, period aggregates, device metadata, feeding schedules, hourly insights, and daily assessments.

Short answer:

> SQLite is lightweight, reliable, and well-suited for offline storage on a mobile device.

### Sensor Ingestion

Ingestion means receiving raw sensor data and bringing it into the system for storage and processing. In PigFit, ingestion starts when the BLE packet is received and ends when the structured row is written to the database.

Short answer:

> Ingestion is the pipeline that receives raw telemetry, validates it, transforms it, and stores it.

### Derived Metrics

Derived metrics are values not sent directly by the hardware but computed from raw readings. In PigFit, examples include THI, activity state, and rule-based event flags.

Short answer:

> Derived metrics are computed values that make raw sensor readings easier to interpret.

### THI or Temperature-Humidity Index

THI is a computed index combining ambient temperature and humidity to estimate heat stress conditions. PigFit uses THI as one of the heat-related monitoring indicators.

Short answer:

> THI combines temperature and humidity into one stress indicator because humidity affects how strongly heat is felt.

### Activity Intensity

In this codebase, activity intensity is computed from accelerometer axes using the magnitude formula:

`sqrt(ax^2 + ay^2 + az^2)`

This gives one number that summarizes movement strength.

Short answer:

> Activity intensity is the overall magnitude of motion derived from acceleration values on multiple axes.

### Pitch Angle

Pitch angle describes the tilt orientation of the device. In this project, it helps represent posture-related behavior.

Short answer:

> Pitch angle is a posture-related measurement that helps infer orientation or tilt.

### Threshold-Based or Rule-Based Analytics

A rule-based system uses defined cutoffs instead of training a statistical classifier. PigFit currently uses thresholds such as:

- fever threshold: `39.5 C`
- heat stress THI threshold: `75`
- severe heat THI threshold: `79`
- lethargy activity threshold: below `1.05`

Short answer:

> The app currently uses explicit thresholds so the monitoring logic is transparent and explainable.

### Aggregation

Aggregation means combining many raw records into summarized values over time windows, such as hourly averages or 30-minute, 1-hour, 4-hour, and 12-hour windows.

Short answer:

> Aggregation compresses many raw readings into summaries that are easier to chart and interpret.

### Deterministic Insight Pipeline

In this project, the insight layer is not meant to be free-form chat output. It is a structured summary pipeline grounded on stored analytics. The app first computes analytics from sensor data, then uses those summaries as input to generate hourly and daily explanations. There is also fallback logic if provider output fails.

Short answer:

> The insight layer is analytics-grounded and structured. It summarizes already-computed metrics rather than diagnosing directly from raw packets.

### Structured Output

Structured output means the model is expected to return data in a defined JSON schema instead of uncontrolled text. This makes it easier to validate and store.

Short answer:

> Structured output is safer than free-form text because the app can validate the expected fields before using them.

### Fallback Logic

Fallback logic means the system still produces a result when the external provider fails or returns invalid output. PigFit has local fallback behavior for insight generation.

Short answer:

> Fallback logic improves robustness because the app can still generate a usable summary even if the provider response is not valid.

### Exponential Backoff

Exponential backoff is a retry strategy where reconnect delays increase after repeated failures. In `useBLE.ts`, reconnect timing grows from a base delay up to a capped maximum.

Short answer:

> Exponential backoff avoids aggressive retry loops and makes reconnection behavior more stable.

### Local Notifications

Local notifications are notifications generated by the app itself on the phone, not by a remote server. PigFit uses them mainly for BLE connection and disconnection events, with support code for health alerts.

Short answer:

> We used local notifications so the app can immediately notify the user of connection state changes without needing a server.

## Core Tables You Can Mention

If a panelist asks what is stored in the database, mention these:

- `sensor_data`: raw telemetry plus derived flags
- `hourly_aggregates`: hourly analytics summaries
- `period_aggregates`: trend windows such as `30m`, `1h`, `4h`, `12h`
- `devices`: paired device metadata
- `feeding_schedules`: schedule settings
- `hourly_insights`: structured hourly summaries
- `daily_assessments`: structured daily summaries

## What Makes The Pipeline Defensible

- The app validates packets before decoding them
- The app stores raw data first before summarizing
- The app uses transparent thresholds for core event detection
- The insight layer sits on top of stored analytics, not directly on raw guesses
- The app has fallback behavior when provider output is invalid
- The system keeps the monitoring workflow usable even if advanced summary generation is unavailable

## Common Defense Questions And Good Answers

### Why BLE instead of Wi-Fi?

BLE is more appropriate for a wearable because it is designed for short-range, low-power communication. Wi-Fi would generally consume more power and add unnecessary overhead for this kind of prototype.

### Why React Native instead of a fully native Android app?

React Native allowed faster prototyping and easier UI development while still targeting mobile devices. For a thesis prototype, development speed and maintainability were important.

### Why SQLite instead of a cloud database?

SQLite supports local storage, offline access, faster local reads, and a simpler prototype architecture. It also reduces dependence on network availability during monitoring.

### Why use rule-based analytics?

Rule-based analytics are transparent and explainable. For a thesis prototype, that is useful because each event can be traced back to a specific threshold or formula.

### What is the role of the AI layer?

Its role is to generate structured summaries from analytics that were already computed. It is an explanation and summarization layer, not a medical diagnosis engine.

### What happens if the AI provider fails?

The app still has local analytics and fallback logic, so the monitoring pipeline remains usable even without a valid provider response.

### How do you ensure the BLE data is valid?

The app checks the packet header, version, expected packet length, and CRC before decoding. Invalid packets are rejected.

### Why aggregate data hourly?

Hourly aggregation reduces noise, makes trends easier to interpret, and gives a practical level of summary for analytics and reporting.

### Is PigFit real-time?

It supports live BLE monitoring and near-real-time UI updates, but not every feature is instantaneous end-to-end cloud streaming. It is best described as live mobile monitoring with local processing.

### Is PigFit diagnostic?

No. The correct description is that it is a monitoring and decision-support prototype that highlights patterns and risk indicators.

### Why not call it predictive disease detection?

Because the current implementation is threshold-based monitoring with structured summaries. It does not provide validated disease prediction or clinical diagnosis.

## Safe Words To Use In Defense

Prefer these words:

- monitoring
- decision-support
- rule-based
- analytics-grounded
- local-first
- wearable-integrated mobile app
- thresholds
- indicators
- summaries
- trends
- prototype

Avoid these unless carefully qualified:

- diagnosis
- clinical decision-making
- disease classifier
- predictive medical AI
- production-ready
- fully automated health intervention

## Honest Limitations To Admit

- The app is still a prototype, not a final deployed product
- The current implementation is effectively centered on one live pig ID in practice
- The insight layer depends on configured provider access for full structured summaries
- The system should not be presented as a substitute for veterinary assessment
- Some alerting and operational workflows are present in code but not yet fully matured as a complete deployment workflow

## If They Ask About Robustness

You can say:

> The app includes practical robustness measures such as permission handling, packet validation, reconnect logic, local persistence, and fallback summary behavior. Those choices make the prototype more dependable even though it is still not production-complete.

## If They Challenge The AI Claim

Use this exact framing:

> The intelligence in PigFit is layered. The first layer is deterministic and rule-based analytics such as THI, thresholds, event flags, and hourly aggregates. The second layer is a structured summary layer that explains those analytics in a more readable form. So the app should be defended primarily as an analytics and monitoring system with a summary component, not as an autonomous diagnostic AI.

## If They Ask For The Strongest Technical Contribution

Use this:

> The strongest contribution is the integration of wearable sensing, BLE communication, packet validation, local mobile storage, rule-based analytics, and structured monitoring summaries into one end-to-end swine monitoring workflow.

## Final Defense Reminder

If you get pressured, return to this sentence:

> PigFit is a wearable-based mobile monitoring and analytics prototype for pigs. It receives BLE telemetry, validates and stores the data locally, computes rule-based indicators and summaries, and presents those results to support observation and decision-making. It is not a veterinary diagnostic system.
