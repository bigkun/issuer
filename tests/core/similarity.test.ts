import { describe, it, expect } from 'vitest';
import { tokenizeMixed, jaccardSimilarity, titleSimilarity, findSimilarIssues } from '../../src/core/similarity.js';
import type { RemoteIssue } from '../../src/adapter/interface.js';

describe('tokenizeMixed', () => {
  it('extracts English words', () => {
    const tokens = tokenizeMixed('Fix login validation error');
    expect(tokens.has('fix')).toBe(true);
    expect(tokens.has('login')).toBe(true);
    expect(tokens.has('validation')).toBe(true);
    expect(tokens.has('error')).toBe(true);
  });

  it('extracts numbers', () => {
    const tokens = tokenizeMixed('Fix bug #123 in version 2.0');
    expect(tokens.has('123')).toBe(true);
    expect(tokens.has('2')).toBe(true);
    expect(tokens.has('0')).toBe(true);
  });

  it('extracts Chinese 2-grams', () => {
    const tokens = tokenizeMixed('修复登录验证错误');
    // 2-grams: 修复, 复登, 登录, 录验, 验证, 证错, 错误
    expect(tokens.has('修复')).toBe(true);
    expect(tokens.has('登录')).toBe(true);
    expect(tokens.has('验证')).toBe(true);
    expect(tokens.has('错误')).toBe(true); // last pair
  });

  it('handles mixed Chinese and English', () => {
    const tokens = tokenizeMixed('修复 Fix login 错误');
    expect(tokens.has('修复')).toBe(true); // single char for short Chinese
    expect(tokens.has('fix')).toBe(true);
    expect(tokens.has('login')).toBe(true);
    expect(tokens.has('错误')).toBe(true);
  });

  it('handles short Chinese text (≤2 chars)', () => {
    const tokens = tokenizeMixed('登录');
    expect(tokens.has('登')).toBe(true);
    expect(tokens.has('录')).toBe(true);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical sets', () => {
    const a = new Set(['fix', 'login', 'error']);
    const b = new Set(['fix', 'login', 'error']);
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    const a = new Set(['fix', 'login']);
    const b = new Set(['add', 'feature']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('returns correct value for partial overlap', () => {
    const a = new Set(['fix', 'login', 'error']);
    const b = new Set(['fix', 'login', 'bug']);
    // intersection: fix, login (2) | union: fix, login, error, bug (4)
    expect(jaccardSimilarity(a, b)).toBe(0.5);
  });

  it('returns 0 for empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });
});

describe('titleSimilarity', () => {
  it('returns high similarity for similar English titles', () => {
    const score = titleSimilarity('Fix login validation error', 'Fix login error');
    expect(score).toBeGreaterThan(0.7);
  });

  it('returns high similarity for similar Chinese titles', () => {
    const score = titleSimilarity('修复登录验证错误', '修复登录验证问题');
    // Shared 2-grams: 修复登, 登录验, 验证问/验证错 (partial overlap)
    expect(score).toBeGreaterThan(0.5);
  });

  it('returns low similarity for different titles', () => {
    const score = titleSimilarity('Fix login error', 'Add OAuth2 support');
    expect(score).toBeLessThan(0.3);
  });

  it('handles mixed language titles', () => {
    const score = titleSimilarity('Fix login 登录错误', 'Fix 登录问题');
    expect(score).toBeGreaterThan(0.2); // Shared: fix, 登录
  });
});

describe('findSimilarIssues', () => {
  const mockIssues: RemoteIssue[] = [
    { id: '1', title: 'Fix login validation error', state: 'open', url: 'https://github.com/1' },
    { id: '2', title: 'Add OAuth2 support', state: 'open', url: 'https://github.com/2' },
    { id: '3', title: '修复登录验证错误', state: 'open', url: 'https://github.com/3' },
    { id: '4', title: 'Fix login error', state: 'closed', url: 'https://github.com/4' },
  ];

  it('finds similar English issues', () => {
    const matches = findSimilarIssues('Fix login validation bug', mockIssues, 0.6);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some(m => m.issue.id === '1')).toBe(true);
  });

  it('finds similar Chinese issues', () => {
    const matches = findSimilarIssues('修复登录验证问题', mockIssues, 0.5);
    expect(matches.some(m => m.issue.id === '3')).toBe(true);
  });

  it('returns empty for no matches', () => {
    const matches = findSimilarIssues('Implement dark mode', mockIssues, 0.85);
    expect(matches.length).toBe(0);
  });

  it('sorts by score descending', () => {
    const matches = findSimilarIssues('Fix login error', mockIssues, 0.5);
    if (matches.length > 1) {
      for (let i = 0; i < matches.length - 1; i++) {
        expect(matches[i].score).toBeGreaterThanOrEqual(matches[i + 1].score);
      }
    }
  });
});