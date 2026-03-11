/**
 * PigFit Diagnostics Service
 * Implements Stage 3: Contextual Input Generation
 */

export interface HourlyAggregates {
  meanTemp: number;
  meanEnvTemp: number;
  meanHumidity: number;
  meanActivity: number;
  meanPitch: number;
  meanFeed: number;
  thi: number;             // Temperature-Humidity Index
  lethargyAlert: boolean;  // Based on Circadian Baseline
}

/**
 * Temperature-Humidity Index (THI) Formula
 * Used to distinguish heat stress from infection.
 * Formula: THI = T - [0.55 - (0.55 * RH/100)] * (T - 58) 
 * (Note: T in Fahrenheit)
 */
export const calculateTHI = (tempC: number, humidity: number): number => {
  const tempF = (tempC * 9/5) + 32;
  const thi = tempF - (0.55 - (0.55 * humidity / 100)) * (tempF - 58);
  return Math.round(thi * 10) / 10;
};

/**
 * Circadian Baseline for Activity Intensity
 * Simplified model: Expected activity for each hour of the day (0-23)
 * Following the behavioral anomaly detection framework (Tran and Thanh [11])
 */
export const CIRCADIAN_BASELINE: Record<number, { min: number; max: number }> = {
  0: { min: 0, max: 2 }, // Rest
  1: { min: 0, max: 2 },
  2: { min: 0, max: 2 },
  3: { min: 0, max: 2 },
  4: { min: 1, max: 4 }, // Early morning
  5: { min: 2, max: 5 },
  6: { min: 5, max: 10 }, // Feeding 1
  7: { min: 6, max: 12 },
  8: { min: 4, max: 8 },
  9: { min: 3, max: 6 },
  10: { min: 2, max: 5 },
  11: { min: 2, max: 5 },
  12: { min: 2, max: 5 },
  13: { min: 2, max: 5 },
  14: { min: 3, max: 6 },
  15: { min: 4, max: 8 },
  16: { min: 6, max: 12 }, // Feeding 2
  17: { min: 5, max: 10 },
  18: { min: 3, max: 7 },
  19: { min: 2, max: 5 },
  20: { min: 1, max: 4 },
  21: { min: 0, max: 3 },
  22: { min: 0, max: 2 },
  23: { min: 0, max: 2 },
};

/**
 * Identify lethargy by comparing current activity against baseline
 */
export const checkLethargy = (activity: number, hour: number): boolean => {
  const baseline = CIRCADIAN_BASELINE[hour];
  if (!baseline) return false;
  
  // Lethargy is defined as activity significantly below the expected minimum
  // during active periods (like feeding)
  return activity < (baseline.min * 0.5); 
};

// ─── Activity State Classification ───────────────────────────────────────────

export type ActivityState = 'Resting' | 'Standing/Minor Movement' | 'High Activity/Distress';

/**
 * Thresholds sourced from user specification:
 *   Resting / Lethargy:        Amag < 1.5g
 *   Standing / Minor Movement: 1.05g <= Amag < 2.0g
 *   High Activity / Distress:  Amag >= 2.0g
 *
 * Note: 1.05g–1.5g is an overlap zone between Resting and Standing.
 * Standing takes priority in that zone (>= 1.05g → Standing).
 * Effective non-overlapping ranges:
 *   < 1.05g  → Resting
 *   1.05–1.99g → Standing/Minor Movement
 *   >= 2.0g  → High Activity/Distress
 */
export const ACTIVITY_THRESHOLDS = {
  STANDING_MIN: 1.05,       // Standing starts here
  RESTING_UPPER_REF: 1.5,   // Resting reference upper bound
  HIGH_ACTIVITY_MIN: 2.0,   // High Activity/Distress starts here
} as const;

/**
 * Classify a single activity magnitude (g) into a behavioral state
 */
export const classifyActivityState = (amag: number): ActivityState => {
  if (amag >= ACTIVITY_THRESHOLDS.HIGH_ACTIVITY_MIN) return 'High Activity/Distress';
  if (amag >= ACTIVITY_THRESHOLDS.STANDING_MIN) return 'Standing/Minor Movement';
  return 'Resting';
};

/**
 * Process raw means into Stage 3 Contextual Inputs
 */
export const generateContextualInputs = (
  hour: number,
  meanTemp: number,
  meanEnvTemp: number,
  meanHumidity: number,
  meanActivity: number
) => {
  const thi = calculateTHI(meanEnvTemp, meanHumidity);
  const lethargyAlert = checkLethargy(meanActivity, hour);
  
  return {
    thi,
    lethargyAlert
  };
};
