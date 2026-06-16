import { describe, it, expect } from 'vitest';
import {
  detectFlags,
  scorePromptQuality,
  computeQualityScore,
  CONTEXT_SIGNALS,
} from '../../src/analysis/rubric';

// ---------------------------------------------------------------------------
// CONTEXT_SIGNALS export
// ---------------------------------------------------------------------------

describe('CONTEXT_SIGNALS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(CONTEXT_SIGNALS)).toBe(true);
    expect(CONTEXT_SIGNALS.length).toBeGreaterThan(0);
  });

  it('contains expected entries', () => {
    expect(CONTEXT_SIGNALS).toContain('context');
    expect(CONTEXT_SIGNALS).toContain('goal');
    expect(CONTEXT_SIGNALS).toContain('format');
    expect(CONTEXT_SIGNALS).toContain('audience');
  });
});

// ---------------------------------------------------------------------------
// detectFlags
// ---------------------------------------------------------------------------

describe('detectFlags', () => {
  it('returns an empty array for a plain short prompt', () => {
    expect(detectFlags('Fix my code')).not.toContain('copy_paste_without_question');
    // word count < 100, so copy_paste can't fire
  });

  it('detects delegation_with_learning_intent when "explain" is present', () => {
    expect(detectFlags('Can you explain why this works?')).toContain(
      'delegation_with_learning_intent',
    );
  });

  it('detects shows_prior_attempt when "i tried" is present', () => {
    expect(detectFlags('I tried using async/await but got an error')).toContain(
      'shows_prior_attempt',
    );
  });

  it('detects asks_for_reasoning when "step by step" is present', () => {
    expect(detectFlags('Walk me through this step by step')).toContain('asks_for_reasoning');
  });

  it('detects asks_for_alternatives when "alternative" is present', () => {
    expect(detectFlags('Is there an alternative approach?')).toContain('asks_for_alternatives');
  });

  it('detects asks_for_risk_or_limitations when "edge cases" is present', () => {
    expect(detectFlags('What edge cases should I watch out for?')).toContain(
      'asks_for_risk_or_limitations',
    );
  });

  it('detects bare_delegation_no_context for "fix it"', () => {
    expect(detectFlags('fix it')).toContain('bare_delegation_no_context');
  });

  it('copy_paste_without_question fires for long unstructured text without ?', () => {
    const blob = Array(110).fill('blah').join(' ');
    expect(detectFlags(blob)).toContain('copy_paste_without_question');
  });

  it('copy_paste_without_question does NOT fire when ? present', () => {
    const blob = Array(110).fill('word').join(' ') + '?';
    expect(detectFlags(blob)).not.toContain('copy_paste_without_question');
  });

  it('copy_paste_without_question does NOT fire when structure signal present', () => {
    const blob = Array(110).fill('word').join(' ') + ' requirements listed here';
    expect(detectFlags(blob)).not.toContain('copy_paste_without_question');
  });

  it('copy_paste_without_question does NOT fire for short prompts', () => {
    expect(detectFlags('this is my short prompt')).not.toContain('copy_paste_without_question');
  });
});

// ---------------------------------------------------------------------------
// computeQualityScore
// ---------------------------------------------------------------------------

describe('computeQualityScore', () => {
  const fullScores = {
    autonomy: 80,
    curiosity: 80,
    criticalThinking: 80,
    specificity: 80,
    context: 80,
    iteration: 50,
  };

  it('returns a number between 0 and 100', () => {
    const score = computeQualityScore(fullScores, 'delegation');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('higher dimension scores produce higher overall score', () => {
    const low = computeQualityScore(
      { autonomy: 20, curiosity: 20, criticalThinking: 20, specificity: 20, context: 20, iteration: 50 },
      'delegation',
    );
    const high = computeQualityScore(fullScores, 'delegation');
    expect(high).toBeGreaterThan(low);
  });

  it('delegation weights autonomy most heavily', () => {
    const highAutonomy = computeQualityScore(
      { autonomy: 100, curiosity: 0, criticalThinking: 0, specificity: 0, context: 0, iteration: 50 },
      'delegation',
    );
    const highCuriosity = computeQualityScore(
      { autonomy: 0, curiosity: 100, criticalThinking: 0, specificity: 0, context: 0, iteration: 50 },
      'delegation',
    );
    expect(highAutonomy).toBeGreaterThan(highCuriosity);
  });

  it('curiosity intent weights curiosity dimension most heavily', () => {
    const highCuriosity = computeQualityScore(
      { autonomy: 0, curiosity: 100, criticalThinking: 0, specificity: 0, context: 0, iteration: 50 },
      'curiosity',
    );
    const highAutonomy = computeQualityScore(
      { autonomy: 100, curiosity: 0, criticalThinking: 0, specificity: 0, context: 0, iteration: 50 },
      'curiosity',
    );
    expect(highCuriosity).toBeGreaterThan(highAutonomy);
  });

  it('works without an intent (defaults to equal weights)', () => {
    expect(computeQualityScore(fullScores)).toBe(80);
  });

  it('all-zero scores produce 0', () => {
    const zero = { autonomy: 0, curiosity: 0, criticalThinking: 0, specificity: 0, context: 0, iteration: 50 };
    expect(computeQualityScore(zero, 'delegation')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scorePromptQuality
// ---------------------------------------------------------------------------

describe('scorePromptQuality', () => {
  it('returns all five quality dimensions', () => {
    const q = scorePromptQuality('Write a Python function to sort a list', [], 'delegation');
    expect(q).toHaveProperty('autonomy');
    expect(q).toHaveProperty('curiosity');
    expect(q).toHaveProperty('criticalThinking');
    expect(q).toHaveProperty('specificity');
    expect(q).toHaveProperty('context');
  });

  it('all scores are clamped between 0 and 100', () => {
    const q = scorePromptQuality('x', [], 'delegation');
    for (const val of Object.values(q)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  it('shows_prior_attempt flag boosts autonomy significantly', () => {
    const without = scorePromptQuality('Fix this React component', [], 'delegation');
    const with_ = scorePromptQuality(
      'Fix this React component. I tried using useEffect but it fires on every render.',
      ['shows_prior_attempt'],
      'delegation',
    );
    expect(with_.autonomy).toBeGreaterThan(without.autonomy);
  });

  it('asks_for_risk_or_limitations flag boosts criticalThinking', () => {
    const without = scorePromptQuality('Write a login system', [], 'delegation');
    const with_ = scorePromptQuality(
      'Write a login system. What are the security risks and edge cases?',
      ['asks_for_risk_or_limitations'],
      'delegation',
    );
    expect(with_.criticalThinking).toBeGreaterThan(without.criticalThinking);
  });

  it('very short prompts (1 word) produce low scores', () => {
    const q = scorePromptQuality('help', [], 'delegation');
    expect(q.autonomy).toBeLessThan(50);
    expect(q.specificity).toBeLessThan(50);
  });

  it('structured long delegation prompt scores higher than vague one', () => {
    const vague = scorePromptQuality('write some code for me please', [], 'delegation');
    const structured = scorePromptQuality(
      'You are a senior TypeScript engineer. Your task is to write a paginated REST API endpoint ' +
        'using Express and PostgreSQL. Requirements: JWT auth, input validation, error handling. ' +
        'Format: TypeScript with comments. Audience: mid-level developers.',
      ['shows_prior_attempt', 'asks_for_risk_or_limitations'],
      'delegation',
    );
    expect(computeQualityScore(structured, 'delegation')).toBeGreaterThan(
      computeQualityScore(vague, 'delegation'),
    );
  });
});
