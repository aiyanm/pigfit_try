# PIGFIT

## Project Description

**PIGFIT** is an integrated wearable and mobile application system for real-time health and behavioral monitoring of swine, with emphasis on breeding sows. The system combines a wearable sensing device and an Expo React Native mobile application connected through Bluetooth Low Energy (BLE).

The wearable device collects physiological, behavioral, and environmental indicators, including skin temperature, motion and activity data, posture-related data, ambient temperature, and humidity. The mobile application decodes incoming telemetry, stores records locally, computes derived analytics, visualizes trends, and generates monitoring insights for decision support.

PIGFIT is designed for **monitoring and decision support only**. It does not provide veterinary diagnosis and should not be used as a replacement for clinical assessment by qualified animal health professionals.

## Features

| Feature | Description |
| --- | --- |
| BLE device scanning and connection | Detects and connects to the wearable device through Bluetooth Low Energy. |
| Real-time sensor data monitoring | Displays incoming physiological, behavioral, and environmental readings. |
| Skin temperature monitoring | Uses the DS18B20 temperature sensor for skin-level temperature readings. |
| Activity and posture monitoring | Uses the BMI270 inertial measurement unit to support movement and posture-related analytics. |
| Ambient monitoring | Uses the HS3003 sensor for ambient temperature and relative humidity. |
| Temperature-Humidity Index computation | Computes THI to support heat stress monitoring. |
| Rule-based event tagging | Applies labels for fever alert, lethargy, heat stress, and severe heat stress. |
| Local SQLite data storage | Stores telemetry and computed values locally on the mobile device. |
| Trend visualization | Provides analytics summaries and historical trend views. |
| Monitoring insights | Generates hourly and daily insights for decision support. |

## Hardware Components

| Component | Purpose |
| --- | --- |
| Arduino Nano 33 BLE Sense Rev2 | Main wearable microcontroller with BLE communication support. |
| DS18B20 temperature sensor | Skin temperature measurement. |
| BMI270 inertial measurement unit | Motion, activity, and posture-related sensing. |
| HS3003 temperature and humidity sensor | Ambient temperature and relative humidity monitoring. |
| 2000 mAh LiPo battery | Portable power source for wearable operation. |
| 3D-modeled wearable case | Protective enclosure for attaching the prototype to the animal. |

## Technology Stack

| Technology | Role |
| --- | --- |
| Expo React Native | Mobile application framework. |
| TypeScript | Type-safe application development. |
| React Navigation | Screen navigation and routing. |
| react-native-ble-plx | Bluetooth Low Energy scanning, connection, and data transfer. |
| expo-sqlite | Local telemetry and analytics storage. |
| expo-notifications | Local notification support for monitoring alerts. |
| NativeWind | Utility-based styling for React Native. |
| Groq API | Provider-backed structured insight generation. |

## System Workflow

1. The wearable device collects sensor readings from the attached hardware sensors.
2. Sensor telemetry is transmitted to the mobile application through Bluetooth Low Energy.
3. The mobile application decodes the telemetry payload and stores records locally.
4. Derived variables such as activity magnitude, pitch angle, and Temperature-Humidity Index are computed.
5. Threshold-based event labels are applied for fever alert, lethargy, heat stress, and severe heat stress.
6. Telemetry and computed values are aggregated into hourly and period-based summaries.
7. Monitoring insights are generated and displayed in the Analyze screen for decision support.

## Data Analytics Formulas

### Activity Magnitude

```text
Activity Magnitude = sqrt(ax^2 + ay^2 + az^2)
```

### Pitch Angle

```text
Pitch Angle = atan2(ax, sqrt(ay^2 + az^2)) * 180 / pi
```

### Temperature-Humidity Index

```text
THI = TF - [(0.55 - 0.0055 * RH) * (TF - 58)]
```

### Fahrenheit Conversion

```text
TF = (TC * 9/5) + 32
```

Where:

| Symbol | Meaning |
| --- | --- |
| `ax`, `ay`, `az` | Acceleration values from the IMU axes. |
| `TC` | Temperature in degrees Celsius. |
| `TF` | Temperature in degrees Fahrenheit. |
| `RH` | Relative humidity percentage. |
| `THI` | Temperature-Humidity Index. |

## Installation and Setup

### Prerequisites

- Node.js and npm
- Expo development environment
- Android or iOS device with BLE support
- Compatible wearable device advertising as `PigFit_Device`

### Setup Steps

1. Clone the repository.

```bash
git clone <repository-url>
cd pigfit_try
```

2. Install project dependencies.

```bash
npm install
```

3. Start the Expo development server.

```bash
npx expo start
```

4. Open the application on a compatible mobile device.
5. Enable Bluetooth and location permissions when required by the platform.
6. Connect to the BLE wearable device named `PigFit_Device`.
7. Begin real-time monitoring and review analytics through the application screens.

## Environment Variables

PIGFIT can generate deterministic local insights without an external provider. Provider-backed structured insight generation requires a Groq API key.

Create or update the local environment file as needed:

```env
GROQ_API_KEY=<your-groq-api-key>
```

`GROQ_API_KEY` is required only when using Groq-backed insight generation. If the provider is unavailable or the key is not configured, deterministic fallback insights can still be used for local monitoring summaries.

## Project Structure

| Path | Description |
| --- | --- |
| `App.tsx` | Main application entry point and top-level app composition. |
| `useBLE.ts` | BLE scanning, connection, telemetry subscription, and device communication logic. |
| `screens/Analyze.tsx` | Analyze screen for trends, summaries, and monitoring insights. |
| `services/storage/db/client.ts` | SQLite database client and local persistence setup. |
| `services/ingestion/sensorIngestService.ts` | Sensor telemetry ingestion and processing service. |
| `services/diagnostics/metricsService.ts` | Derived metrics, analytics summaries, and diagnostic computations. |
| `services/ai/deterministic/orchestrator.ts` | Deterministic insight orchestration and fallback generation flow. |
| `services/ai/deterministic/promptBuilder.ts` | Structured prompt construction for insight generation. |
| `services/ai/providers/groqDeterministicProvider.ts` | Groq-backed provider for structured deterministic insight generation. |
| `services/core/types.ts` | Shared domain types for telemetry, analytics, and monitoring outputs. |

## Evaluation Summary

Behavioral validation used **618 matched windows** comparing system-generated behavioral classifications with reference observations. The overall agreement was **72.98%**, indicating that the prototype achieved moderate agreement under the evaluated field conditions.

The System Usability Scale (SUS) score was **69.21**, which is interpreted as **acceptable usability**. Further refinement is recommended for distinguishing resting from standing or minor activity, especially when movement intensity is limited.

## Limitations

- Skin temperature is not the same as rectal or core body temperature.
- Fever alerts are monitoring indicators and should not be interpreted as clinical diagnosis.
- Standing or minor activity may be confused with resting under limited movement conditions.
- BLE range, wearable placement, and sensor contact quality may affect data reliability.
- The prototype was evaluated in a limited field setup and may require additional validation before broader deployment.

## Future Improvements

- Improve behavioral classification thresholds.
- Add more data from different pigs, housing conditions, and environmental contexts.
- Improve posture-based classification using richer movement features.
- Optimize wearable battery life and power management.
- Add cloud synchronization or multi-device monitoring support.
- Improve predictive analytics after more validated data are collected.

## Disclaimer

PIGFIT is a research prototype and decision-support tool for swine health and behavior monitoring. It should not replace veterinary diagnosis, professional animal health assessment, or farm biosecurity procedures. Any suspected health issue should be evaluated by qualified animal health professionals using appropriate clinical and farm management protocols.
