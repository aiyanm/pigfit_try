export interface AnalysisPrompt {
  systemRole: string;
  userPrompt: string;
}

// ─── COMBINED HEALTH ASSESSMENT PROMPT ────────────────────────────────────
/**
 * Complete Farmer-Friendly Health Analysis (~350 tokens)
 * Best for: One analysis that gives the farmer everything they need
 * 
 * CUSTOMIZE:
 * - Adjust urgency language
 * - Add/remove warning sign categories
 * - Modify action priorities
 */
export const getFullVeterinaryAssessmentPrompt = (): AnalysisPrompt => ({
  systemRole:
    'You are a veterinarian helping a farmer understand their pig\'s health. ' +
    'Give a complete picture in plain language. ' +
    'Farmers need: Is pig healthy? What\'s the problem? What do I do? When do I call you? ' +
    'Be clear, practical, and concise. No unnecessary medical details.',

    //definisiton of column , expand! para dili maghalucinate !!!!!!!!!!!!!!!!!!!!!
    //
  userPrompt:
    'Provide a complete health assessment:\n' +
    '\n' +
    '**1. STATUS - Is this pig OK?**\n' +
    '- Healthy / Needs watching / Needs help now\n' +
    '- Brief reason (1-2 sentences)\n' +
    '\n' +
    '**2. WHAT\'S PROBABLY WRONG?**\n' +
    '- Most likely cause\n' +
    '- Why you think so (reference the data)\n' +
    '- Other possibilities to consider\n' +
    '\n' +
    '**3. WHAT TO DO RIGHT NOW**\n' +
    '- Immediate action 1 (today)\n' +
    '- Immediate action 2 (today)\n' +
    '- Keep watching for...\n' +
    '\n' +
    '**4. DANGER SIGNS - CALL VET IF YOU SEE:**\n' +
    '- Critical sign 1 → call emergency/now\n' +
    '- Critical sign 2 → call today\n' +
    '- Warning sign 3 → call this week\n' +
    '\n' +
    'Keep total response under 350 words. Simple language. Practical steps.',
});

// ─── PROMPT SELECTOR ──────────────────────────────────────────────────────
/**
 * Analysis types available in the app
 */
export type AnalysisType = 'full';

/**
 * Get prompt by analysis type
 * 
 * Usage:
 *   const prompt = getAnalysisPrompt('full');
 *   const result = await safeCallGroq(systemRole, userPrompt, context, apiKey);
 */
export const getAnalysisPrompt = (type: AnalysisType): AnalysisPrompt => {
  const prompts: Record<AnalysisType, AnalysisPrompt> = {
    full: getFullVeterinaryAssessmentPrompt(),
  };
  return prompts[type];
};

/**
 * Get token estimate for prompt type (approximate)
 * Useful for deciding which template to use
 */
export const getEstimatedTokens = (type: AnalysisType): number => {
  const estimates: Record<AnalysisType, number> = {
    full: 350,
  };
  return estimates[type];
};
