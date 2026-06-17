import { describe, it, expect } from 'vitest';
import { STOP_WORDS } from '../../src/analysis/stopWords';

describe('STOP_WORDS', () => {
  it('is a Set', () => {
    expect(STOP_WORDS).toBeInstanceOf(Set);
  });

  it('contains common articles and prepositions', () => {
    expect(STOP_WORDS.has('a')).toBe(true);
    expect(STOP_WORDS.has('an')).toBe(true);
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('in')).toBe(true);
    expect(STOP_WORDS.has('of')).toBe(true);
  });

  it('contains filler action verbs', () => {
    expect(STOP_WORDS.has('write')).toBe(true);
    expect(STOP_WORDS.has('explain')).toBe(true);
    expect(STOP_WORDS.has('help')).toBe(true);
    expect(STOP_WORDS.has('show')).toBe(true);
  });

  it('contains question words', () => {
    expect(STOP_WORDS.has('what')).toBe(true);
    expect(STOP_WORDS.has('why')).toBe(true);
    expect(STOP_WORDS.has('how')).toBe(true);
    expect(STOP_WORDS.has('when')).toBe(true);
  });

  it('does NOT contain meaningful technical nouns', () => {
    expect(STOP_WORDS.has('typescript')).toBe(false);
    expect(STOP_WORDS.has('algorithm')).toBe(false);
    expect(STOP_WORDS.has('database')).toBe(false);
    expect(STOP_WORDS.has('function')).toBe(false);
  });

  it('has more than 50 entries', () => {
    expect(STOP_WORDS.size).toBeGreaterThan(50);
  });
});
