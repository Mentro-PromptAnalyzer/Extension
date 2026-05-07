import { scoreIntents, primaryIntentFrom } from './classifier';
import { detectFlags, scorePromptQuality, computeQualityScore } from './rubric';
import type { PromptIntent } from './types';

export interface LiveScore {
  overall: number;
  // The four dimensions shown in the UI
  ownership: number;      // autonomy
  depth: number;          // curiosity
  rigor: number;          // criticalThinking
  clarity: number;        // specificity + context averaged
  intent: PromptIntent | 'unknown';
  flags: string[];
  suggestions: string[];
}

/**
 * Analyze a single prompt in real-time as the user types.
 */
export function analyzePrompt(text: string): LiveScore {
  const trimmed = text.trim();

  if (trimmed.length < 5) {
    return {
      overall: 0,
      ownership: 0,
      depth: 0,
      rigor: 0,
      clarity: 0,
      intent: 'unknown',
      flags: [],
      suggestions: ['Start typing your prompt...'],
    };
  }

  const intentScores = scoreIntents(trimmed);
  const intent = primaryIntentFrom(intentScores);
  const flags = detectFlags(trimmed);
  const quality = scorePromptQuality(trimmed, flags, intent);
  const overall = computeQualityScore(quality);

  // Map to UI dimensions
  const ownership = quality.autonomy;
  const depth     = quality.curiosity;
  const rigor     = quality.criticalThinking;
  const clarity   = Math.round((quality.specificity + quality.context) / 2);

  // Build actionable suggestions based on what's low
  const suggestions: string[] = [];

  if (ownership < 40) {
    suggestions.push("Show your thinking — what have you already tried or considered?");
  }
  if (depth < 40) {
    suggestions.push("Ask 'why' or 'how' to go deeper than a surface answer.");
  }
  if (rigor < 40) {
    suggestions.push("Push back — ask about edge cases, risks, or alternatives.");
  }
  if (clarity < 40) {
    suggestions.push("Add context: who is this for, what constraints do you have?");
  }

  return {
    overall,
    ownership,
    depth,
    rigor,
    clarity,
    intent,
    flags,
    suggestions: suggestions.slice(0, 3),
  };
}
