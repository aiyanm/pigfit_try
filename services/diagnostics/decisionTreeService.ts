/**
 * PIGFIT Hierarchical Decision Tree for Diagnostic Ambiguity Resolution
 * 
 * Implements the fusion logic from the thesis:
 * - Case A: Fever (Possible Infection) — High Temp + Low Activity + Normal THI
 * - Case B: Heat Stress — High Temp + (High Activity OR High THI)
 * - Case C: Lethargy — Low Activity at normal temp
 * - Case D: Feeding Detection — Pitch angle head-down
 * - Case E: Cold — Low temperature
 */

import type { SensorDataPoint } from '../core/types';
import { calculateTHI, ACTIVITY_THRESHOLDS } from './metricsService';

export type DiagnosticCase = 'A' | 'B' | 'C' | 'D' | 'E' | 'normal';
export type DiagnosticSeverity = 'alert' | 'warning' | 'info' | 'normal';

export interface DiagnosticReasoning {
  temp: { value: number; status: string };
  activity: { value: number; status: string };
  thi: { value: number; status: string };
  pitchAngle: { value: number; status: string };
  summary: string[];
}

export interface DiagnosticResult {
  case: DiagnosticCase;
  severity: DiagnosticSeverity;
  title: string;
  description: string;
  reasoning: DiagnosticReasoning;
}

export const DIAGNOSTIC_THRESHOLDS = {
  FEVER_THRESHOLD: 39.5,
  NORMAL_TEMP_MIN: 38.0,
  NORMAL_TEMP_MAX: 39.5,
  COLD_THRESHOLD: 38.0,
  HIGH_ACTIVITY_MIN: 2.0,
  LETHARGY_THRESHOLD: 1.05,
  THI_CRITICAL: 80,
  THI_ALERT: 75,
  THI_COMFORT: 75,
  PITCH_ANGLE_FEEDING_DOWN: 45,
  PITCH_ANGLE_FEEDING_UP: -30,
} as const;

/**
 * Main decision tree evaluation
 * Decision flow (prioritized: Heat Stress > Fever if conflict):
 * 1. IF Temp > 39.5°C:
 *    a. IF Activity < 1.05g AND THI < 75: → Case A (Fever)
 *    b. ELSE IF Activity ≥ 2.0g OR THI ≥ 75: → Case B (Heat Stress)
 * 2. ELSE IF Temp < 38.0°C: → Case E (Cold)
 * 3. ELSE IF Activity < 1.05g (normal temp): → Case C (Lethargy)
 * 4. IF Pitch angle head-down: → Case D (Feeding)
 * 5. ELSE: → Normal
 */
export const evaluateDiagnosticHierarchy = (
  sensorData: SensorDataPoint[]
): DiagnosticResult => {
  if (sensorData.length === 0) {
    return createNormalDiagnostic();
  }

  const maxTemp = Math.max(...sensorData.map(d => d.temp));
  const minTemp = Math.min(...sensorData.map(d => d.temp));
  const avgTemp = sensorData.reduce((sum, d) => sum + d.temp, 0) / sensorData.length;
  const avgActivity = sensorData.reduce((sum, d) => sum + d.activityIntensity, 0) / sensorData.length;
  const maxActivity = Math.max(...sensorData.map(d => d.activityIntensity));
  const avgTHI = sensorData.reduce(
    (sum, d) => sum + calculateTHI(d.envTemp, d.humidity),
    0
  ) / sensorData.length;
  const maxTHI = Math.max(...sensorData.map(d => calculateTHI(d.envTemp, d.humidity)));
  const avgPitchAngle = sensorData.reduce((sum, d) => sum + d.pitchAngle, 0) / sensorData.length;

  const reasoning = createReasoning(avgTemp, avgActivity, avgTHI, avgPitchAngle);

  // BRANCH 1: HIGH TEMPERATURE (> 39.5°C)
  if (maxTemp > DIAGNOSTIC_THRESHOLDS.FEVER_THRESHOLD) {
    const isLowActivity = avgActivity < DIAGNOSTIC_THRESHOLDS.LETHARGY_THRESHOLD;
    const isNormalTHI = maxTHI < DIAGNOSTIC_THRESHOLDS.THI_ALERT;

    // Case A: Fever (Infection) — High Temp + Low Activity + Normal THI
    if (isLowActivity && isNormalTHI) {
      return createCaseADiagnostic(maxTemp, avgActivity, avgTHI, reasoning);
    }

    // Case B: Heat Stress — High Temp + (High Activity OR High THI)
    const isHighActivity = maxActivity >= DIAGNOSTIC_THRESHOLDS.HIGH_ACTIVITY_MIN;
    const isHighTHI = maxTHI >= DIAGNOSTIC_THRESHOLDS.THI_ALERT;

    if (isHighActivity || isHighTHI) {
      return createCaseBDiagnostic(maxTemp, maxActivity, maxTHI, reasoning);
    }

    // High temp but doesn't fit A or B patterns — treat as mild fever warning
    return createCaseADiagnostic(maxTemp, avgActivity, avgTHI, reasoning);
  }

  // BRANCH 2: LOW TEMPERATURE (< 38.0°C)
  else if (minTemp < DIAGNOSTIC_THRESHOLDS.COLD_THRESHOLD) {
    return createCaseEDiagnostic(minTemp, reasoning);
  }

  // BRANCH 3: LETHARGY at Normal Temperature
  const isNormalTemp = avgTemp >= DIAGNOSTIC_THRESHOLDS.NORMAL_TEMP_MIN && avgTemp <= DIAGNOSTIC_THRESHOLDS.NORMAL_TEMP_MAX;
  if (isNormalTemp && avgActivity < DIAGNOSTIC_THRESHOLDS.LETHARGY_THRESHOLD) {
    return createCaseCDiagnostic(avgActivity, avgTemp, reasoning);
  }

  // BRANCH 4: FEEDING STATE (Pitch angle head-down)
  if (avgPitchAngle < DIAGNOSTIC_THRESHOLDS.PITCH_ANGLE_FEEDING_DOWN) {
    return createCaseDDiagnostic(avgPitchAngle, reasoning);
  }

  return createNormalDiagnostic();
};

function createCaseADiagnostic(temp: number, activity: number, thi: number, reasoning: DiagnosticReasoning): DiagnosticResult {
  return {
    case: 'A',
    severity: 'alert',
    title: 'Fever — Possible Infection',
    description: `High body temperature (${temp.toFixed(1)}°C) with reduced activity in normal environmental conditions. Pattern suggests possible infection rather than heat stress.`,
    reasoning,
  };
}

function createCaseBDiagnostic(temp: number, activity: number, thi: number, reasoning: DiagnosticReasoning): DiagnosticResult {
  const usesTHI = thi >= DIAGNOSTIC_THRESHOLDS.THI_ALERT;
  const usesActivity = activity >= DIAGNOSTIC_THRESHOLDS.HIGH_ACTIVITY_MIN;

  let subtitle = '';
  if (usesTHI && usesActivity) {
    subtitle = `High temperature and activity with elevated heat-humidity index (${thi.toFixed(1)}).`;
  } else if (usesTHI) {
    subtitle = `High temperature combined with elevated thermal conditions (THI: ${thi.toFixed(1)}).`;
  } else {
    subtitle = `High temperature with excessive activity indicating heat-related stress.`;
  }

  return {
    case: 'B',
    severity: 'alert',
    title: 'Heat Stress',
    description: `${subtitle} Pig is experiencing thermal stress and reduced ability to thermoregulate.`,
    reasoning,
  };
}

function createCaseCDiagnostic(activity: number, temp: number, reasoning: DiagnosticReasoning): DiagnosticResult {
  return {
    case: 'C',
    severity: 'warning',
    title: 'Reduced Activity — Lethargy',
    description: `Reduced activity level detected despite normal body temperature (${temp.toFixed(1)}°C). Low activity can indicate illness, pain, or poor welfare.`,
    reasoning,
  };
}

function createCaseDDiagnostic(pitchAngle: number, reasoning: DiagnosticReasoning): DiagnosticResult {
  return {
    case: 'D',
    severity: 'info',
    title: 'Feeding Behavior',
    description: `Pig detected in head-down feeding posture. Normal eating behavior observed.`,
    reasoning,
  };
}

function createCaseEDiagnostic(temp: number, reasoning: DiagnosticReasoning): DiagnosticResult {
  return {
    case: 'E',
    severity: 'warning',
    title: 'Low Temperature — Cold Stress',
    description: `Body temperature below normal range (${temp.toFixed(1)}°C, threshold <38.0°C). May indicate cold stress, poor circulation, or early illness.`,
    reasoning,
  };
}

function createNormalDiagnostic(): DiagnosticResult {
  return {
    case: 'normal',
    severity: 'normal',
    title: 'Normal — All Parameters Healthy',
    description: `All vital parameters within normal ranges. No clinical signs detected.`,
    reasoning: {
      temp: { value: 0, status: 'Normal' },
      activity: { value: 0, status: 'Normal' },
      thi: { value: 0, status: 'Normal' },
      pitchAngle: { value: 0, status: 'Normal' },
      summary: ['All parameters within healthy ranges'],
    },
  };
}

function createReasoning(temp: number, activity: number, thi: number, pitchAngle: number): DiagnosticReasoning {
  const tempStatus = temp > DIAGNOSTIC_THRESHOLDS.FEVER_THRESHOLD ? `FEVER (${temp.toFixed(1)}°C)` : temp < DIAGNOSTIC_THRESHOLDS.COLD_THRESHOLD ? `LOW (${temp.toFixed(1)}°C)` : `Normal (${temp.toFixed(1)}°C)`;
  const activityStatus = activity < DIAGNOSTIC_THRESHOLDS.LETHARGY_THRESHOLD ? `LOW (${activity.toFixed(2)}g)` : activity >= DIAGNOSTIC_THRESHOLDS.HIGH_ACTIVITY_MIN ? `HIGH (${activity.toFixed(2)}g)` : `Normal (${activity.toFixed(2)}g)`;
  const thiStatus = thi >= DIAGNOSTIC_THRESHOLDS.THI_CRITICAL ? `CRITICAL (${thi.toFixed(1)})` : thi >= DIAGNOSTIC_THRESHOLDS.THI_ALERT ? `ALERT (${thi.toFixed(1)})` : `Normal (${thi.toFixed(1)})`;
  const pitchStatus = pitchAngle < DIAGNOSTIC_THRESHOLDS.PITCH_ANGLE_FEEDING_DOWN ? `HEAD-DOWN (${pitchAngle.toFixed(1)}°)` : `Normal (${pitchAngle.toFixed(1)}°)`;

  return {
    temp: { value: temp, status: tempStatus },
    activity: { value: activity, status: activityStatus },
    thi: { value: thi, status: thiStatus },
    pitchAngle: { value: pitchAngle, status: pitchStatus },
    summary: [tempStatus, activityStatus, thiStatus, pitchStatus],
  };
}
