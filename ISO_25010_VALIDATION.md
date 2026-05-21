# ISO/IEC 25010:2011 System Validation for PigFit

## 1. Purpose

This document defines a validation checklist for the PigFit mobile application using the ISO/IEC 25010:2011 software product quality model. It is intended for system validation, not formal ISO certification.

PigFit is an Expo React Native mobile application that connects to a BLE-enabled pig wearable, stores telemetry in local SQLite, computes analytics, and displays health insights for monitoring.

## 2. Scope

The validation covers the mobile application and its supporting local services:

- Android mobile application runtime
- BLE device connection and telemetry ingestion
- Local SQLite database storage
- Dashboard and Analyze screen display
- Hourly insights and daily assessment workflows
- Local notifications and error handling behavior

The validation does not certify the hardware device, cloud provider, veterinary correctness, or production regulatory compliance.

## 3. Rating Scale

| Score | Rating | Meaning |
|---:|---|---|
| 5 | Excellent | Fully satisfies the criterion with strong evidence and no major issues found. |
| 4 | Good | Satisfies the criterion with minor issues or low-risk gaps. |
| 3 | Acceptable | Satisfies the minimum expected behavior but has visible limitations. |
| 2 | Needs Improvement | Partially satisfies the criterion but has important gaps. |
| 1 | Poor | Does not satisfy the criterion or has no supporting evidence. |

## 4. Result Status Rules

| Status | Use When |
|---|---|
| Passed | The criterion was tested and met the acceptance criteria. |
| Partially Passed | The app supports the behavior but evidence is incomplete or limitations remain. |
| Failed | The app was tested and did not meet the acceptance criteria. |
| Not Tested | The behavior likely exists or is planned, but no validation was performed. |
| Not Applicable | The criterion does not apply to the current system scope. |

## 5. Validation Evidence Checklist

Use this checklist to attach proof during validation.

| Evidence ID | Evidence Type | Description | Location or Reference | Status |
|---|---|---|---|---|
| E-01 | Static check | TypeScript check using `npx tsc --noEmit` | Command output | Pending |
| E-02 | Android run | App launches on Android simulator or device | Screenshot/video | Pending |
| E-03 | BLE connection | App scans and connects to `PigFit_Device` | Screenshot/log | Pending |
| E-04 | SQLite storage | Sensor rows are stored in `pigfit_data.db` | DB count/log | Pending |
| E-05 | Dashboard UI | Dashboard displays live or stored sensor status | Screenshot | Pending |
| E-06 | Analyze charts | Analyze screen renders trend charts | Screenshot | Pending |
| E-07 | Hourly insights | Hourly insight cards display from stored data | Screenshot/DB rows | Pending |
| E-08 | Daily assessments | Daily assessment state displays correctly | Screenshot/DB rows | Pending |
| E-09 | Offline/no-device behavior | App remains usable without BLE connection | Screenshot/test notes | Pending |
| E-10 | Error handling | Missing or invalid data does not crash the app | Test notes/log | Pending |

## 6. ISO/IEC 25010:2011 Validation Matrix

### 6.1 Functional Suitability

| Sub-characteristic | Validation Objective | Test Method | Acceptance Criteria | Result | Score | Evidence | Remarks |
|---|---|---|---|---|---:|---|---|
| Functional completeness | Verify that core PigFit functions are available. | Launch app and inspect Dashboard, Analyze, Profile, BLE pairing, SQLite storage, insight generation/display. | All core monitoring functions are present and reachable from the app UI. | Not Tested | TBD | E-02, E-05, E-06 | Validate on Android simulator/device. |
| Functional correctness | Verify that stored telemetry and insight data are displayed accurately. | Compare SQLite rows against values rendered on Dashboard/Analyze. | UI values match database or latest BLE readings within expected formatting. | Not Tested | TBD | E-04, E-07, E-08 | Include screenshots and DB query results. |
| Functional appropriateness | Verify that features support pig health monitoring tasks. | Review workflow: connect device, collect data, view trends, inspect alerts/insights. | User can complete monitoring workflow without unnecessary steps. | Not Tested | TBD | E-02 to E-09 | Evaluate with representative user task. |

### 6.2 Performance Efficiency

| Sub-characteristic | Validation Objective | Test Method | Acceptance Criteria | Result | Score | Evidence | Remarks |
|---|---|---|---|---|---:|---|---|
| Time behavior | Verify acceptable response time for app startup and screen navigation. | Measure startup, Dashboard load, Analyze load, and chart rendering time. | Main screens load without noticeable blocking under normal dataset size. | Not Tested | TBD | E-02, E-06 | Record approximate seconds or screen recording. |
| Resource utilization | Verify that SQLite and chart rendering do not overload the device. | Run app with stored DB and observe emulator/device responsiveness. | App remains responsive; no repeated freezes, memory warnings, or crashes. | Not Tested | TBD | E-06, logs | Test with current database and larger backup if available. |
| Capacity | Verify that the app can handle accumulated sensor records. | Load database with historical sensor rows and open Analyze. | App can display trends and insights from stored data without crashing. | Not Tested | TBD | E-04, E-06, E-07 | Current backup data can be used for validation. |

### 6.3 Compatibility

| Sub-characteristic | Validation Objective | Test Method | Acceptance Criteria | Result | Score | Evidence | Remarks |
|---|---|---|---|---|---:|---|---|
| Co-existence | Verify app can run on Android without interfering with other installed apps. | Install/run PigFit on Android simulator/device with standard apps present. | App launches and operates without requiring special system changes beyond permissions. | Not Tested | TBD | E-02 | Validate with clean emulator/device. |
| Interoperability | Verify integration between BLE device, SQLite, notifications, and AI insight services. | Test BLE ingestion, database writes, notification setup, and insight display. | Data flows correctly from BLE packet to persisted analytics and UI display. | Not Tested | TBD | E-03, E-04, E-07 | AI provider may require configured API key. |

### 6.4 Usability

| Sub-characteristic | Validation Objective | Test Method | Acceptance Criteria | Result | Score | Evidence | Remarks |
|---|---|---|---|---|---:|---|---|
| Appropriateness recognizability | Verify users can understand what the app is for. | Inspect labels, Dashboard, Analyze charts, insight cards, and device status. | Farmer/operator can identify monitoring purpose and current pig status. | Not Tested | TBD | E-05, E-06, E-07 | Validate with user feedback if possible. |
| Learnability | Verify common tasks are easy to learn. | Ask evaluator to connect device, view Dashboard, open Analyze, inspect insights. | User completes basic flow with minimal instruction. | Not Tested | TBD | Observation notes | Record task completion issues. |
| Operability | Verify controls are usable during normal operation. | Test navigation tabs, buttons, chart period controls, profile/device actions. | Controls respond correctly and do not cause unexpected app states. | Not Tested | TBD | E-02, screenshots | Include no-device condition. |
| User error protection | Verify app handles missing data and disconnected device states safely. | Open app without BLE device and with empty/partial database. | App displays safe empty states and does not crash. | Not Tested | TBD | E-09, E-10 | Important for field use. |
| User interface aesthetics | Verify UI is visually organized and readable. | Inspect main screens on Android display sizes. | Text, cards, charts, and buttons are readable and not overlapping. | Not Tested | TBD | Screenshots | Use actual device screenshots. |
| Accessibility | Verify basic accessibility considerations. | Inspect contrast, readable text, touch targets, and icon labels. | Basic readability and touch usability are acceptable. | Not Tested | TBD | Screenshots/manual notes | Formal screen-reader testing is not yet included. |

### 6.5 Reliability

| Sub-characteristic | Validation Objective | Test Method | Acceptance Criteria | Result | Score | Evidence | Remarks |
|---|---|---|---|---|---:|---|---|
| Maturity | Verify app remains stable during expected workflows. | Run repeated startup, navigation, BLE connection, logging, and Analyze viewing. | No crashes during repeated normal workflows. | Not Tested | TBD | Logs/test notes | Use multiple app restarts. |
| Availability | Verify app remains accessible when needed. | Launch app with and without BLE device available. | App opens and key screens remain accessible in both cases. | Not Tested | TBD | E-02, E-09 | BLE-dependent features may show disconnected state. |
| Fault tolerance | Verify graceful handling of BLE disconnect and missing data. | Disconnect BLE, deny device availability, use empty DB, or use partial data. | App shows fallback/empty state and logs error without crashing. | Not Tested | TBD | E-09, E-10 | Include screenshots of empty states. |
| Recoverability | Verify app can recover after interruption. | Force close app, relaunch, and inspect persisted SQLite data. | Previously stored data remains available after restart. | Not Tested | TBD | E-04, E-02 | Validate SQLite persistence. |

### 6.6 Security

| Sub-characteristic | Validation Objective | Test Method | Acceptance Criteria | Result | Score | Evidence | Remarks |
|---|---|---|---|---|---:|---|---|
| Confidentiality | Verify sensitive data is not exposed unnecessarily. | Inspect local data, `.env` handling, API key usage, and logs. | API keys are not hardcoded in source; logs do not expose unnecessary secrets. | Not Tested | TBD | Source review notes | Local SQLite encryption is not currently claimed. |
| Integrity | Verify stored telemetry and insight data are not accidentally corrupted. | Insert/read sensor records and run database integrity check where applicable. | Stored records can be read back correctly; SQLite integrity check passes for validation DB. | Not Tested | TBD | E-04, DB output | Include DB command evidence. |
| Non-repudiation | Determine whether user actions are auditable. | Review whether app records actor/action history. | Mark Not Applicable or Needs Improvement unless audit trail exists. | Not Tested | TBD | Source review notes | Likely limited for current app scope. |
| Accountability | Verify whether user/device actions can be traced. | Inspect device metadata and timestamps in database. | Device records and timestamps exist for relevant persisted data. | Not Tested | TBD | DB rows/source review | Full user accountability is limited. |
| Authenticity | Verify whether BLE device identity is controlled. | Test connection behavior with expected peripheral name and metadata. | App connects only to intended PigFit device criteria. | Not Tested | TBD | E-03 | Current validation should document pairing assumptions. |

### 6.7 Maintainability

| Sub-characteristic | Validation Objective | Test Method | Acceptance Criteria | Result | Score | Evidence | Remarks |
|---|---|---|---|---|---:|---|---|
| Modularity | Verify code is separated by responsibility. | Review app structure: screens, BLE provider, ingestion, diagnostics, AI, storage. | Major concerns are separated into modules/services. | Not Tested | TBD | Source review | Some large files may still need refactoring. |
| Reusability | Verify service functions can be reused across screens/tests. | Review exported service functions and dev test helpers. | Core DB/ingestion/AI functions are reusable outside one UI component. | Not Tested | TBD | Source review | Manual helper functions exist under `services/dev/tests`. |
| Analysability | Verify code and data flow are understandable. | Review README, service docs, comments, and type definitions. | Developer can trace BLE to SQLite to Analyze display. | Not Tested | TBD | README/source notes | Existing docs support this. |
| Modifiability | Verify changes can be made with limited side effects. | Review TypeScript structure and run static check after small changes. | TypeScript check passes and changes are localized. | Not Tested | TBD | E-01 | No automated unit test suite is configured. |
| Testability | Verify the system supports validation. | Inspect dev test helpers and run static checks. | Static checks and manual/dev tests can be executed and recorded. | Not Tested | TBD | E-01, dev tests | No package `test` script exists. |

### 6.8 Portability

| Sub-characteristic | Validation Objective | Test Method | Acceptance Criteria | Result | Score | Evidence | Remarks |
|---|---|---|---|---|---:|---|---|
| Adaptability | Verify app can adapt to target Android environments. | Run on Android simulator and, if available, physical Android device. | App runs with required permissions and expected display behavior. | Not Tested | TBD | E-02 | BLE validation is stronger on physical device. |
| Installability | Verify app can be installed and launched. | Run `npm run android` or install Android build from Android Studio. | App installs and opens successfully. | Not Tested | TBD | E-02 | Record build/install logs. |
| Replaceability | Verify whether components can be replaced or updated. | Review provider/service boundaries for BLE, DB, and AI provider. | Service boundaries allow controlled replacement with limited UI changes. | Not Tested | TBD | Source review | Not a primary user-facing requirement. |

## 7. Manual Validation Procedure

Use the following procedure when conducting validation.

1. Prepare the environment.
   - Install dependencies with `npm install` if needed.
   - Ensure `.env` exists if AI provider tests are included.
   - Start an Android simulator or connect an Android device.

2. Run static validation.
   - Command: `npx tsc --noEmit`
   - Record output under evidence ID `E-01`.

3. Validate app launch and navigation.
   - Run the app through Android Studio or `npm run android`.
   - Open Dashboard, Analyze, and Profile.
   - Record screenshots under `E-02`, `E-05`, and `E-06`.

4. Validate BLE workflow.
   - Scan for `PigFit_Device`.
   - Connect and observe live readings.
   - Disconnect and verify the app remains stable.
   - Record logs/screenshots under `E-03` and `E-09`.

5. Validate storage and analytics.
   - Confirm sensor readings are stored in SQLite.
   - Confirm Analyze charts render stored data.
   - Confirm hourly insights and daily assessment states display correctly.
   - Record DB counts, screenshots, and logs under `E-04`, `E-06`, `E-07`, and `E-08`.

6. Validate error and empty-state handling.
   - Test with no BLE device connected.
   - Test with missing or empty stored data where practical.
   - Confirm the app shows empty states and does not crash.
   - Record results under `E-09` and `E-10`.

## 8. Summary Result Sheet

Fill this after validation.

| Quality Characteristic | Average Score | Overall Result | Key Evidence | Main Improvement Needed |
|---|---:|---|---|---|
| Functional Suitability | TBD | Not Tested | TBD | TBD |
| Performance Efficiency | TBD | Not Tested | TBD | TBD |
| Compatibility | TBD | Not Tested | TBD | TBD |
| Usability | TBD | Not Tested | TBD | TBD |
| Reliability | TBD | Not Tested | TBD | TBD |
| Security | TBD | Not Tested | TBD | TBD |
| Maintainability | TBD | Not Tested | TBD | TBD |
| Portability | TBD | Not Tested | TBD | TBD |

## 9. Notes for Validators

- Use `Passed` only when there is actual evidence.
- Use `Partially Passed` when behavior exists but evidence is incomplete.
- Do not mark criteria as passed based only on source code inspection unless the criterion is specifically a source review criterion.
- This validation is based on ISO/IEC 25010:2011, but it is not a formal ISO certification.
- Health recommendations generated by the system should be treated as decision support and not as a replacement for veterinary diagnosis.
