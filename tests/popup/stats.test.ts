// ---------------------------------------------------------------------------
// tests/popup/stats.test.ts
// Unit and property-based tests for the extension-stats-revamp feature.
// Tasks 6.2 (unit tests) and 6.3 (property-based tests).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { derivePlatform } from '../../src/background/index';
import { aggregateStats } from '../../src/popup/auth';
import { computeTopIntent } from '../../src/popup/components/AccountTab';

// ===========================================================================
// Task 6.2 — Unit tests
// ===========================================================================

// ---------------------------------------------------------------------------
// derivePlatform
// ---------------------------------------------------------------------------

describe('derivePlatform', () => {
  it('maps chatgpt.com URL to chatgpt', () => {
    expect(derivePlatform('https://chatgpt.com/c/123')).toBe('chatgpt');
  });

  it('maps chat.openai.com URL to chatgpt', () => {
    expect(derivePlatform('https://chat.openai.com/')).toBe('chatgpt');
  });

  it('maps gemini.google.com URL to gemini', () => {
    expect(derivePlatform('https://gemini.google.com/')).toBe('gemini');
  });

  it('maps perplexity.ai URL to perplexity', () => {
    expect(derivePlatform('https://perplexity.ai/')).toBe('perplexity');
  });

  it('maps claude.ai URL to claude', () => {
    expect(derivePlatform('https://claude.ai/')).toBe('claude');
  });

  it('returns unknown for an unrecognised hostname', () => {
    expect(derivePlatform('https://example.com/')).toBe('unknown');
  });

  it('returns unknown for a malformed URL string', () => {
    expect(derivePlatform('not-a-url')).toBe('unknown');
  });

  it('returns unknown for undefined', () => {
    expect(derivePlatform(undefined)).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// aggregateStats — empty array
// ---------------------------------------------------------------------------

describe('aggregateStats([])', () => {
  const stats = aggregateStats([]);

  it('totalPrompts is 0', () => {
    expect(stats.totalPrompts).toBe(0);
  });

  it('avgScore is null', () => {
    expect(stats.avgScore).toBeNull();
  });

  it('topPlatform is null', () => {
    expect(stats.topPlatform).toBeNull();
  });

  it('all intentCounts keys are present and equal 0', () => {
    expect(stats.intentCounts).toEqual({
      delegation: 0,
      curiosity: 0,
      collaborative: 0,
      verification: 0,
    });
  });

  it('all scoreBands equal 0', () => {
    expect(stats.scoreBands).toEqual({ excellent: 0, good: 0, needsWork: 0 });
  });

  it('wordCountBuckets.total is 0', () => {
    expect(stats.wordCountBuckets.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateStats — single known row
// ---------------------------------------------------------------------------

describe('aggregateStats — single row with known values', () => {
  const row = {
    word_count: 10,
    score_overall: 75,
    intent: 'delegation',
    platform: 'chatgpt',
    created_at: '2024-01-01T00:00:00Z',
  };
  const stats = aggregateStats([row]);

  it('totalPrompts is 1', () => {
    expect(stats.totalPrompts).toBe(1);
  });

  it('avgScore is 75', () => {
    expect(stats.avgScore).toBe(75);
  });

  it('topPlatform is chatgpt', () => {
    expect(stats.topPlatform).toBe('chatgpt');
  });

  it('word_count 10 lands in the short bucket', () => {
    expect(stats.wordCountBuckets.short).toBe(1);
  });

  it('score 75 lands in the excellent band', () => {
    expect(stats.scoreBands.excellent).toBe(1);
  });

  it('intent delegation is counted', () => {
    expect(stats.intentCounts.delegation).toBe(1);
  });

  it('platformStats has chatgpt with count 1', () => {
    expect(stats.platformStats['chatgpt'].count).toBe(1);
  });

  it('platformStats chatgpt avgScore is 75', () => {
    expect(stats.platformStats['chatgpt'].avgScore).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// computeTopIntent
// ---------------------------------------------------------------------------

describe('computeTopIntent', () => {
  it('returns the single clear winner', () => {
    expect(
      computeTopIntent({ delegation: 10, curiosity: 5, collaborative: 3, verification: 1 })
    ).toBe('delegation');
  });

  it('all-zero tie resolves to delegation (first in tiebreak order)', () => {
    expect(
      computeTopIntent({ delegation: 0, curiosity: 0, collaborative: 0, verification: 0 })
    ).toBe('delegation');
  });

  it('curiosity beats delegation when it has a higher count', () => {
    expect(
      computeTopIntent({ delegation: 3, curiosity: 10, collaborative: 2, verification: 1 })
    ).toBe('curiosity');
  });

  it('collaborative beats others when it has the highest count', () => {
    expect(
      computeTopIntent({ delegation: 2, curiosity: 2, collaborative: 5, verification: 1 })
    ).toBe('collaborative');
  });
});

// ===========================================================================
// Task 6.3 — Property-based tests
// ===========================================================================

// Shared row arbitrary used across all properties
const rowArb = fc.record({
  word_count: fc.integer({ min: 0, max: 500 }),
  score_overall: fc.integer({ min: 0, max: 100 }),
  intent: fc.constantFrom(
    'delegation',
    'curiosity',
    'collaborative',
    'verification',
    'other'
  ),
  platform: fc.string(),
  created_at: fc.constant('2024-01-01T00:00:00Z'),
});

describe('Property-based tests', () => {
  // Property 1: Platform derivation covers all known hostnames — Validates: Req 2.2
  it('Property 1: derivePlatform returns the correct key for every known hostname', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ['https://chatgpt.com/', 'chatgpt'],
          ['https://chat.openai.com/', 'chatgpt'],
          ['https://gemini.google.com/', 'gemini'],
          ['https://perplexity.ai/', 'perplexity'],
          ['https://claude.ai/', 'claude']
        ) as fc.Arbitrary<[string, string]>,
        ([url, expected]) => {
          expect(derivePlatform(url)).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 6: totalPrompts equals rows.length — Validates: Req 3.3
  it('Property 6: totalPrompts equals rows.length', () => {
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        expect(aggregateStats(rows).totalPrompts).toBe(rows.length);
      }),
      { numRuns: 100 }
    );
  });

  // Property 7: avgScore is null for empty, rounded mean otherwise — Validates: Req 3.4
  it('Property 7: avgScore formula', () => {
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const { avgScore, totalPrompts } = aggregateStats(rows);
        if (totalPrompts === 0) {
          expect(avgScore).toBeNull();
        } else {
          const expected = Math.round(
            rows.reduce((s, r) => s + r.score_overall, 0) / rows.length
          );
          expect(avgScore).toBe(expected);
        }
      }),
      { numRuns: 100 }
    );
  });

  // Property 8: Word count buckets exhaustive and non-overlapping — Validates: Reqs 3.6, 9.4
  it('Property 8: word count buckets are exhaustive and non-overlapping', () => {
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const { wordCountBuckets: b } = aggregateStats(rows);
        expect(b.short + b.medium + b.long).toBe(b.total);
        expect(b.total).toBe(rows.length);
      }),
      { numRuns: 100 }
    );
  });

  // Property 9: Score bands exhaustive and non-overlapping — Validates: Reqs 3.7, 9.5
  it('Property 9: score bands are exhaustive and non-overlapping', () => {
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const { scoreBands, totalPrompts } = aggregateStats(rows);
        expect(scoreBands.excellent + scoreBands.good + scoreBands.needsWork).toBe(totalPrompts);
      }),
      { numRuns: 100 }
    );
  });

  // Property 10: Intent counts sum to valid intent rows — Validates: Reqs 3.8, 9.6
  it('Property 10: intent counts sum equals valid intent rows', () => {
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const { intentCounts, totalPrompts } = aggregateStats(rows);
        const validRows = rows.filter((r) =>
          ['delegation', 'curiosity', 'collaborative', 'verification'].includes(r.intent)
        ).length;
        const sum = Object.values(intentCounts).reduce((s, c) => s + c, 0);
        expect(sum).toBe(validRows);
        // totalPrompts counts all rows; intentCounts only valid intents
        expect(sum).toBeLessThanOrEqual(totalPrompts);
      }),
      { numRuns: 100 }
    );
  });

  // Property 11: computeTopIntent respects tie-break — Validates: Req 4.4
  it('Property 11: computeTopIntent tie-break: all equal → delegation wins', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (n) => {
        // All equal — delegation wins (first in INTENT_TIEBREAK)
        expect(
          computeTopIntent({ delegation: n, curiosity: n, collaborative: n, verification: n })
        ).toBe('delegation');
      }),
      { numRuns: 100 }
    );
  });

  it('Property 11: computeTopIntent tie-break: solo winner always returned', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.constantFrom(
          'delegation',
          'curiosity',
          'collaborative',
          'verification'
        ) as fc.Arbitrary<'delegation' | 'curiosity' | 'collaborative' | 'verification'>,
        (extra, winner) => {
          const base = { delegation: 0, curiosity: 0, collaborative: 0, verification: 0 };
          const counts = { ...base, [winner]: base[winner] + extra };
          expect(computeTopIntent(counts)).toBe(winner);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 12: topPlatform null for empty, highest-count platform otherwise — Validates: Req 3.5
  it('Property 12: topPlatform is null for empty rows, non-null otherwise', () => {
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const { topPlatform, platformStats } = aggregateStats(rows);
        if (rows.length === 0) {
          expect(topPlatform).toBeNull();
        } else {
          expect(topPlatform).not.toBeNull();
          expect(platformStats[topPlatform!]).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });
});
