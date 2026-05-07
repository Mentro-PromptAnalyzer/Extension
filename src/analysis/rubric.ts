import type { PromptIntent, QualityScores } from './types';

const LEARNING_INTENT_SIGNALS = [
  'explain', 'why', 'walk me through', 'teach me', 'so i understand',
  'reasoning', 'rationale',
];

const PRIOR_ATTEMPT_SIGNALS = [
  'i tried', 'my attempt', "here's what i have", 'here is what i have',
  'i think', 'my reasoning', 'i got', 'i believe', 'my solution',
  'this is my code', 'here is my code', "here's my code",
];

const REASONING_REQUEST_SIGNALS = [
  'explain your reasoning', 'why', 'walk me through', 'step by step',
  'how did you get', 'what is the logic', 'rationale', 'reasoning',
];

const ALTERNATIVES_SIGNALS = [
  'alternative', 'another way', 'compare', 'tradeoffs', 'pros and cons',
  'which is better', 'different approach', 'options',
];

const RISK_SIGNALS = [
  'what could go wrong', 'limitations', 'edge cases', 'assumptions', 'risks',
  'counterargument', 'weaknesses', 'failure cases', 'downside',
];

const FOLLOW_UP_SIGNALS = [
  'now', 'what about', 'also', 'can you adjust', 'instead', 'then',
  'based on that',
];

export const CONTEXT_SIGNALS = [
  'constraints', 'requirements', 'audience', 'format', 'rubric', 'example',
  'goal', 'context', 'background',
];

const BARE_DELEGATION_PHRASES = [
  'make it better', 'fix it', 'do it', 'make it shorter', 'make it longer',
  'make it more', 'make it less',
];

function hasAny(lower: string, signals: string[]): boolean {
  return signals.some((s) => lower.includes(s));
}

export function detectFlags(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const flags: string[] = [];

  if (hasAny(lower, LEARNING_INTENT_SIGNALS))   flags.push('delegation_with_learning_intent');
  if (hasAny(lower, PRIOR_ATTEMPT_SIGNALS))      flags.push('shows_prior_attempt');
  if (hasAny(lower, REASONING_REQUEST_SIGNALS))  flags.push('asks_for_reasoning');
  if (hasAny(lower, ALTERNATIVES_SIGNALS))       flags.push('asks_for_alternatives');
  if (hasAny(lower, RISK_SIGNALS))               flags.push('asks_for_risk_or_limitations');
  if (wordCount > 100 && !text.includes('?'))    flags.push('copy_paste_without_question');
  if (hasAny(lower, FOLLOW_UP_SIGNALS))          flags.push('follow_up_signal');
  if (hasAny(lower, BARE_DELEGATION_PHRASES))    flags.push('bare_delegation_no_context');

  return flags;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function scorePromptQuality(
  text: string,
  flags: string[],
  intent: PromptIntent,
): QualityScores {
  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const isShort  = wordCount < 10;
  const isMedium = wordCount >= 10 && wordCount < 20;

  let autonomy        = isShort ? 25 : isMedium ? 35 : 45;
  let curiosity       = isShort ? 25 : isMedium ? 35 : 45;
  let criticalThinking = isShort ? 25 : isMedium ? 35 : 45;
  let specificity     = isShort ? 15 : isMedium ? 25 : 35;
  let context         = isShort ? 15 : isMedium ? 25 : 35;
  // iteration is not meaningful for a single real-time prompt — fixed midpoint
  const iteration = 50;

  if (flags.includes('delegation_with_learning_intent')) {
    autonomy += 10; curiosity += 15; criticalThinking += 10;
  }
  if (flags.includes('shows_prior_attempt')) {
    autonomy += 25; context += 10; specificity += 10;
  }
  if (flags.includes('asks_for_reasoning')) {
    curiosity += 20; criticalThinking += 10;
  }
  if (flags.includes('asks_for_alternatives')) {
    criticalThinking += 15; curiosity += 10;
  }
  if (flags.includes('asks_for_risk_or_limitations')) {
    criticalThinking += 25; autonomy += 10;
  }

  if (intent === 'verification')  { criticalThinking += 15; }
  if (intent === 'collaborative') { autonomy += 10; criticalThinking += 10; }
  if (intent === 'curiosity')     { curiosity += 15; }

  if (lower.split(/\s+/).some((w) => CONTEXT_SIGNALS.some((s) => w.includes(s)))) {
    specificity += 20; context += 20;
  }

  if (wordCount >= 20 && wordCount <= 120) { specificity += 10; }
  if (wordCount < 6)  { specificity -= 25; context -= 20; }
  if (wordCount > 120 && !text.includes('?') && intent === 'delegation') {
    curiosity -= 15; autonomy -= 10;
  }

  if (intent === 'delegation' && wordCount < 15) {
    autonomy -= 25; curiosity -= 15; criticalThinking -= 10;
  }
  if (flags.includes('copy_paste_without_question')) {
    autonomy -= 15; curiosity -= 15;
  }
  if (flags.includes('bare_delegation_no_context') && wordCount < 15) {
    specificity -= 25; autonomy -= 15;
  }

  if (
    wordCount < 10 &&
    !flags.includes('shows_prior_attempt') &&
    !flags.includes('asks_for_reasoning') &&
    !flags.includes('delegation_with_learning_intent')
  ) {
    specificity -= 10; context -= 10;
  }

  if (!text.includes('?')) { curiosity -= 10; specificity -= 5; }

  if (wordCount <= 4 && flags.length === 0) {
    autonomy -= 15; curiosity -= 15; criticalThinking -= 15;
    specificity -= 15; context -= 15;
  }
  if (wordCount <= 1) {
    autonomy -= 20; curiosity -= 20; criticalThinking -= 20;
    specificity -= 20; context -= 20;
  }

  if (
    intent === 'delegation' &&
    !flags.includes('delegation_with_learning_intent') &&
    !flags.includes('shows_prior_attempt') &&
    !flags.includes('asks_for_reasoning') &&
    wordCount < 10
  ) {
    autonomy -= 15; curiosity -= 10;
  }

  if (
    wordCount >= 5 &&
    !lower.split(/\s+/).some((w) => CONTEXT_SIGNALS.some((s) => w.includes(s))) &&
    !flags.includes('shows_prior_attempt')
  ) {
    context -= 10; specificity -= 5;
  }

  return {
    autonomy:        clamp(autonomy),
    curiosity:       clamp(curiosity),
    criticalThinking: clamp(criticalThinking),
    specificity:     clamp(specificity),
    context:         clamp(context),
    iteration,
  };
}

export function computeQualityScore(q: QualityScores): number {
  // Exclude iteration from the real-time score since it's fixed at 50
  return Math.round(
    (q.autonomy + q.curiosity + q.criticalThinking + q.specificity + q.context) / 5,
  );
}
