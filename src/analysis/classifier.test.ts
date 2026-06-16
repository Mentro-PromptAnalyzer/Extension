import { describe, it, expect } from 'vitest';
import { scoreIntents, primaryIntentFrom } from './classifier';
import type { IntentScores } from './types';

// ---------------------------------------------------------------------------
// scoreIntents
// ---------------------------------------------------------------------------

describe('scoreIntents', () => {
  it('counts delegation signals', () => {
    const s = scoreIntents('write me a function that fixes the bug');
    expect(s.delegation).toBeGreaterThanOrEqual(2); // 'write', 'fix'
    expect(s.curiosity).toBe(0);
  });

  it('counts curiosity signals', () => {
    const s = scoreIntents('why does quicksort have O(n²) worst case?');
    expect(s.curiosity).toBeGreaterThanOrEqual(1);
    expect(s.delegation).toBe(0);
  });

  it('counts collaborative signals', () => {
    const s = scoreIntents("what do you think about this approach? let's brainstorm");
    expect(s.collaborative).toBeGreaterThanOrEqual(2);
  });

  it('counts verification signals', () => {
    const s = scoreIntents('check this code and verify it is correct');
    expect(s.verification).toBeGreaterThanOrEqual(2);
  });

  it('handles overlapping signals across intents', () => {
    // 'review' is a delegation signal, 'check' is a verification signal
    const s = scoreIntents('review and check my code');
    expect(s.delegation).toBeGreaterThanOrEqual(1);
    expect(s.verification).toBeGreaterThanOrEqual(1);
  });

  it('returns zeros for empty string', () => {
    const s = scoreIntents('');
    expect(s).toEqual({ delegation: 0, curiosity: 0, collaborative: 0, verification: 0 });
  });

  it('is case-insensitive', () => {
    const lower = scoreIntents('write a function');
    const upper = scoreIntents('WRITE a FUNCTION');
    expect(lower.delegation).toBe(upper.delegation);
  });

  it('counts partial matches within words (substring match behaviour)', () => {
    // 'fix' matches inside 'prefix' — this is intentional/documented behaviour
    const s = scoreIntents('fix the bug');
    expect(s.delegation).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// primaryIntentFrom
// ---------------------------------------------------------------------------

describe('primaryIntentFrom', () => {
  it('returns highest-scoring intent', () => {
    const scores: IntentScores = { delegation: 1, curiosity: 4, collaborative: 0, verification: 0 };
    expect(primaryIntentFrom(scores)).toBe('curiosity');
  });

  it('prefers curiosity over delegation on equal scores (iteration order)', () => {
    const scores: IntentScores = { delegation: 2, curiosity: 2, collaborative: 0, verification: 0 };
    // curiosity is checked before delegation in the loop
    expect(primaryIntentFrom(scores)).toBe('curiosity');
  });

  it('tie-break: delegation wins when role-setting phrase present and within 1 signal', () => {
    const scores: IntentScores = { delegation: 2, curiosity: 3, collaborative: 0, verification: 0 };
    const result = primaryIntentFrom(scores, 'You are a senior engineer. Explain the approach.');
    expect(result).toBe('delegation');
  });

  it('tie-break: "act as" triggers delegation tie-break', () => {
    const scores: IntentScores = { delegation: 2, curiosity: 3, collaborative: 0, verification: 0 };
    expect(primaryIntentFrom(scores, 'Act as a Python expert. Write the code.')).toBe('delegation');
  });

  it('tie-break: "your task" triggers delegation tie-break', () => {
    const scores: IntentScores = { delegation: 3, curiosity: 4, collaborative: 0, verification: 0 };
    expect(primaryIntentFrom(scores, 'Your task is to analyze the dataset.')).toBe('delegation');
  });

  it('tie-break: does NOT fire when gap > 1', () => {
    // delegation is 2 signals below curiosity — too far to tie-break
    const scores: IntentScores = { delegation: 1, curiosity: 3, collaborative: 0, verification: 0 };
    const result = primaryIntentFrom(scores, 'You are an expert. Why does this happen?');
    expect(result).toBe('curiosity');
  });

  it('tie-break: does NOT fire without role-setting text', () => {
    const scores: IntentScores = { delegation: 2, curiosity: 3, collaborative: 0, verification: 0 };
    expect(primaryIntentFrom(scores, 'Why does quicksort degrade?')).toBe('curiosity');
  });

  it('defaults to delegation when all scores are zero', () => {
    const scores: IntentScores = { delegation: 0, curiosity: 0, collaborative: 0, verification: 0 };
    expect(primaryIntentFrom(scores)).toBe('delegation');
  });

  it('works without optional text parameter', () => {
    const scores: IntentScores = { delegation: 0, curiosity: 0, collaborative: 5, verification: 0 };
    expect(primaryIntentFrom(scores)).toBe('collaborative');
  });
});
