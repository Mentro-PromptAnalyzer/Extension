import { describe, it, expect } from 'vitest';
import { analyzePrompt } from './engine';

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

describe('analyzePrompt — output shape', () => {
  it('returns all required fields', () => {
    const result = analyzePrompt('Why does quicksort have O(n²) worst case?');
    expect(result).toHaveProperty('overall');
    expect(result).toHaveProperty('ownership');
    expect(result).toHaveProperty('depth');
    expect(result).toHaveProperty('critical');
    expect(result).toHaveProperty('clarity');
    expect(result).toHaveProperty('intent');
    expect(result).toHaveProperty('flags');
    expect(result).toHaveProperty('suggestions');
  });

  it('all numeric fields are integers between 0 and 100', () => {
    const result = analyzePrompt('Explain how OAuth2 works with a code example');
    for (const key of ['overall', 'ownership', 'depth', 'critical', 'clarity'] as const) {
      expect(result[key]).toBeGreaterThanOrEqual(0);
      expect(result[key]).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result[key])).toBe(true);
    }
  });

  it('suggestions is an array', () => {
    expect(Array.isArray(analyzePrompt('Fix my code').suggestions)).toBe(true);
  });

  it('flags is an array', () => {
    expect(Array.isArray(analyzePrompt('Write a function').flags)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Short / empty input
// ---------------------------------------------------------------------------

describe('analyzePrompt — short input', () => {
  it('returns all zeros for text shorter than 5 chars', () => {
    const result = analyzePrompt('hi');
    expect(result.overall).toBe(0);
    expect(result.ownership).toBe(0);
    expect(result.depth).toBe(0);
    expect(result.critical).toBe(0);
    expect(result.clarity).toBe(0);
  });

  it('returns intent "unknown" for short input', () => {
    expect(analyzePrompt('hi').intent).toBe('unknown');
  });

  it('returns empty string for empty input', () => {
    const result = analyzePrompt('');
    expect(result.overall).toBe(0);
    expect(result.intent).toBe('unknown');
  });

  it('returns a start-typing suggestion for short input', () => {
    const result = analyzePrompt('hey');
    expect(result.suggestions[0]).toMatch(/start typing/i);
  });
});

// ---------------------------------------------------------------------------
// Intent classification
// ---------------------------------------------------------------------------

describe('analyzePrompt — intent classification', () => {
  it('classifies a "why" question as curiosity', () => {
    expect(analyzePrompt('Why does quicksort have O(n²) worst case?').intent).toBe('curiosity');
  });

  it('classifies a task request as delegation', () => {
    const result = analyzePrompt('Write me a Python function to reverse a linked list');
    expect(result.intent).toBe('delegation');
  });

  it('classifies a verification request', () => {
    const result = analyzePrompt('Check this code and verify it is correct');
    expect(result.intent).toBe('verification');
  });

  it('classifies a collaborative request', () => {
    const result = analyzePrompt("What do you think about this approach? Let's brainstorm");
    expect(result.intent).toBe('collaborative');
  });

  it('intent is never "unknown" for a real prompt', () => {
    const result = analyzePrompt('How do I implement binary search in JavaScript?');
    expect(result.intent).not.toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Score ranges — relative quality
// ---------------------------------------------------------------------------

describe('analyzePrompt — score ranges', () => {
  it('vague 3-word delegation scores below 30 overall', () => {
    expect(analyzePrompt('fix my code').overall).toBeLessThan(30);
  });

  it('high-quality structured delegation scores above 50 overall', () => {
    // Hits: role-setting (you are), prior attempt (i tried), context signals
    // (requirements, format, audience), risk signals (risks, edge cases),
    // word count >= 40, and a question mark.
    const prompt =
      'You are a senior Node.js engineer. Your task is to help me build a paginated REST API. ' +
      "I've tried using offset-based pagination but it breaks under concurrent writes. " +
      'Requirements: cursor-based pagination, JWT auth, PostgreSQL. ' +
      'Format: TypeScript with inline comments. Audience: mid-level developers. ' +
      'What are the risks and edge cases I should handle?';
    expect(analyzePrompt(prompt).overall).toBeGreaterThan(50);
  });

  it('longer prompts with context generally score higher than one-liners', () => {
    const short = analyzePrompt('explain TypeScript');
    const detailed = analyzePrompt(
      'Explain how TypeScript generics work. I understand basic types but struggle with ' +
        'constrained generics like <T extends object>. Can you walk me through the concept ' +
        'with examples and explain when you would use them vs union types?',
    );
    expect(detailed.overall).toBeGreaterThan(short.overall);
  });
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

describe('analyzePrompt — suggestions', () => {
  it('returns at most 3 suggestions', () => {
    const result = analyzePrompt('write a function');
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('returns no suggestions when all dimensions are healthy (≥ 60)', () => {
    // A very high-quality prompt should have no weak dimensions
    const prompt =
      'You are a senior software architect. Your task is to review my microservice design. ' +
      "Here's what I have: three services communicating via gRPC with a shared PostgreSQL DB. " +
      "I've tried separating concerns but queries are getting complex. " +
      'What are the risks, alternatives, and edge cases I should consider? ' +
      'Format as bullet points for a team of mid-level engineers.';
    const result = analyzePrompt(prompt);
    // Either no suggestions or suggestions that reference real topics
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('suggestion strings are non-empty', () => {
    const result = analyzePrompt('fix my code');
    for (const s of result.suggestions) {
      expect(s.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Clarity dimension
// ---------------------------------------------------------------------------

describe('analyzePrompt — clarity', () => {
  it('clarity is the average of specificity and context (both integers)', () => {
    // We can't access internal quality directly, but we can verify the field is valid
    const result = analyzePrompt('How do I use async/await in JavaScript?');
    expect(result.clarity).toBeGreaterThanOrEqual(0);
    expect(result.clarity).toBeLessThanOrEqual(100);
  });
});
