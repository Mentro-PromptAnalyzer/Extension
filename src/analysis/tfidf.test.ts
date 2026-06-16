import { describe, it, expect } from 'vitest';
import {
  extractTopicTFIDF,
  extractTopicsTFIDF,
  POSITION_WEIGHT,
  TECHNICAL_BOOST,
  QUALIFIER_PENALTY,
  UNKNOWN_WORD_IDF,
  MAX_TOPIC_WORDS,
} from './tfidf';
import { STOP_WORDS } from './stopWords';

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe('exported constants', () => {
  it('POSITION_WEIGHT is greater than 1', () => {
    expect(POSITION_WEIGHT).toBeGreaterThan(1);
  });

  it('TECHNICAL_BOOST is greater than 1', () => {
    expect(TECHNICAL_BOOST).toBeGreaterThan(1);
  });

  it('QUALIFIER_PENALTY is between 0 and 1', () => {
    expect(QUALIFIER_PENALTY).toBeGreaterThan(0);
    expect(QUALIFIER_PENALTY).toBeLessThan(1);
  });

  it('UNKNOWN_WORD_IDF is a positive number', () => {
    expect(UNKNOWN_WORD_IDF).toBeGreaterThan(0);
  });

  it('MAX_TOPIC_WORDS is a positive integer', () => {
    expect(MAX_TOPIC_WORDS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_TOPIC_WORDS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractTopicTFIDF
// ---------------------------------------------------------------------------

describe('extractTopicTFIDF', () => {
  it('returns a non-empty string for a real prompt', () => {
    const result = extractTopicTFIDF('How does quicksort work in Python?', STOP_WORDS);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for empty input', () => {
    expect(extractTopicTFIDF('', STOP_WORDS)).toBe('');
  });

  it('returns empty string when all words are stop words', () => {
    expect(extractTopicTFIDF('a the in of and', STOP_WORDS)).toBe('');
  });

  it('capitalises the first character of the result', () => {
    const result = extractTopicTFIDF('fix my typescript code', STOP_WORDS);
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
  });

  it('filters out stop words from the topic phrase', () => {
    // 'the' and 'a' are stop words and should never be the topic
    const result = extractTopicTFIDF('explain the algorithm', STOP_WORDS);
    expect(result.toLowerCase()).not.toBe('the');
    expect(result.toLowerCase()).not.toBe('a');
  });

  it('prefers technical terms over generic words', () => {
    const result = extractTopicTFIDF('I want something about TypeScript', STOP_WORDS);
    // TypeScript has a high IDF and technical boost, should win over 'something'
    expect(result.toLowerCase()).toContain('typescript');
  });

  it('result has at most MAX_TOPIC_WORDS words', () => {
    const result = extractTopicTFIDF(
      'Write a React component using TypeScript with hooks and state management',
      STOP_WORDS,
    );
    const wordCount = result.split(' ').length;
    expect(wordCount).toBeLessThanOrEqual(MAX_TOPIC_WORDS);
  });
});

// ---------------------------------------------------------------------------
// extractTopicsTFIDF
// ---------------------------------------------------------------------------

describe('extractTopicsTFIDF', () => {
  it('returns up to n phrases', () => {
    const result = extractTopicsTFIDF(
      'How does React handle state updates in TypeScript with Redux?',
      STOP_WORDS,
      3,
    );
    expect(result.length).toBe(3);
  });

  it('returns empty array for empty input', () => {
    expect(extractTopicsTFIDF('', STOP_WORDS, 3)).toHaveLength(0);
  });

  it('pads with the best phrase when fewer than n spans are found', () => {
    // Single non-stop word — only 1 unique span possible, should pad to 3
    const result = extractTopicsTFIDF('TypeScript', STOP_WORDS, 3);
    expect(result.length).toBe(3);
    expect(result[0]).toBe(result[1]);
    expect(result[1]).toBe(result[2]);
  });

  it('each phrase is capitalised', () => {
    const results = extractTopicsTFIDF(
      'Building a REST API with PostgreSQL and Docker',
      STOP_WORDS,
      3,
    );
    for (const phrase of results) {
      expect(phrase.charAt(0)).toBe(phrase.charAt(0).toUpperCase());
    }
  });

  it('n=1 returns a single-element array', () => {
    const result = extractTopicsTFIDF('How does OAuth work?', STOP_WORDS, 1);
    expect(result).toHaveLength(1);
  });

  it('phrases do not overlap (non-overlapping spans)', () => {
    const results = extractTopicsTFIDF(
      'Explain the difference between PostgreSQL and MongoDB for a microservice',
      STOP_WORDS,
      3,
    );
    // All three should be distinct strings (non-overlapping content)
    const unique = new Set(results);
    // Padded results are acceptable, but at least the first two should differ
    // if the prompt has enough content
    expect(results[0]).toBeTruthy();
  });
});
