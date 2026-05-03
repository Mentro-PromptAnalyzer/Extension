// ---------------------------------------------------------------------------
// Lightweight analysis engine for the extension
// This is a slimmed-down version of askbetter/src/analysis/ that runs
// on a single prompt (not a full conversation) for real-time feedback.
//
// When you're ready to build this out, copy the core logic from:
//   - askbetter/src/analysis/classifier.ts  (intent classification)
//   - askbetter/src/analysis/rubric.ts      (quality scoring)
//   - askbetter/src/analysis/types.ts       (shared types)
// ---------------------------------------------------------------------------

export interface LiveScore {
  overall: number;
  autonomy: number;
  curiosity: number;
  criticalThinking: number;
  specificity: number;
  intent: 'delegation' | 'curiosity' | 'collaborative' | 'verification' | 'unknown';
  flags: string[];
  suggestions: string[];
}

/**
 * Analyze a single prompt in real-time as the user types.
 * Returns scores and suggestions for the current prompt text.
 */
export function analyzePrompt(text: string): LiveScore {
  const trimmed = text.trim();

  if (trimmed.length < 5) {
    return {
      overall: 0,
      autonomy: 0,
      curiosity: 0,
      criticalThinking: 0,
      specificity: 0,
      intent: 'unknown',
      flags: [],
      suggestions: ['Start typing your prompt...'],
    };
  }

  // TODO: Port scoring logic from askbetter/src/analysis/rubric.ts
  // TODO: Port intent classification from askbetter/src/analysis/classifier.ts
  // For now, return placeholder scores

  const lower = trimmed.toLowerCase();
  const wordCount = trimmed.split(/\s+/).length;
  const hasQuestion = /\?/.test(trimmed);
  const hasContext = wordCount > 20;
  const hasWhy = /\b(why|how|what if|explain|reason)\b/i.test(lower);
  const hasConstraints = /\b(but|however|constraint|limit|require|must|should)\b/i.test(lower);

  const flags: string[] = [];
  const suggestions: string[] = [];

  // Basic scoring heuristics (replace with full engine later)
  let autonomy = 30;
  let curiosity = 30;
  let criticalThinking = 30;
  let specificity = 30;

  if (hasContext) { specificity += 25; autonomy += 15; }
  if (hasQuestion) { curiosity += 20; }
  if (hasWhy) { curiosity += 25; criticalThinking += 20; flags.push('asks_for_reasoning'); }
  if (hasConstraints) { specificity += 20; flags.push('has_constraints'); }
  if (wordCount < 10) { suggestions.push('Add more context — what have you tried? What constraints do you have?'); }
  if (!hasQuestion) { suggestions.push('Try asking a question instead of just giving a command.'); }
  if (!hasWhy) { suggestions.push('Ask "why" or "how" to deepen the conversation.'); }

  const overall = Math.round((autonomy + curiosity + criticalThinking + specificity) / 4);

  return {
    overall: Math.min(100, overall),
    autonomy: Math.min(100, autonomy),
    curiosity: Math.min(100, curiosity),
    criticalThinking: Math.min(100, criticalThinking),
    specificity: Math.min(100, specificity),
    intent: hasWhy ? 'curiosity' : hasQuestion ? 'collaborative' : 'delegation',
    flags,
    suggestions: suggestions.slice(0, 3),
  };
}
