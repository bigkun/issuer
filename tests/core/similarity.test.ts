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

describe('real-world similarity cases', () => {
  it('calculates similarity for user-reported titles', () => {
    const cases = [
      { old: '书籍录入功能', new: '书籍录入管理' },
      { old: '书籍分类管理', new: '书籍分类体系' },
      { old: '书架管理功能', new: '书架空间管理' },
      { old: '阅读状态与进度追踪', new: '阅读进度追踪' },
      { old: '书籍录入功能', new: '书籍录入功' }, // 少一个字的情况
    ];

    console.log('\n=== Similarity Analysis ===');
    for (const { old, new: newTitle } of cases) {
      const score = titleSimilarity(old, newTitle);
      console.log(`"${old}" vs "${newTitle}" => ${score.toFixed(3)} (${(score * 100).toFixed(1)}%)`);
    }

    // Test case 1
    const score1 = titleSimilarity('书籍录入功能', '书籍录入管理');
    console.log(`\n书籍录入: ${score1.toFixed(3)}`);
    // Tokenization:
    // 书籍录入功能: 书籍, 籍录, 录入, 入功, 功能
    // 书籍录入管理: 书籍, 籍录, 录入, 入管, 管理
    // Intersection: 书籍, 籍录, 录入 (3/7 = 0.429)

    // Test case 2
    const score2 = titleSimilarity('书籍分类管理', '书籍分类体系');
    console.log(`书籍分类: ${score2.toFixed(3)}`);

    // Test case 3
    const score3 = titleSimilarity('书架管理功能', '书架空间管理');
    console.log(`书架管理: ${score3.toFixed(3)}`);

    // Test case 4
    const score4 = titleSimilarity('阅读状态与进度追踪', '阅读进度追踪');
    console.log(`阅读进度: ${score4.toFixed(3)}`);

    // Test case 5: 少一个字的情况
    const score5 = titleSimilarity('书籍录入功能', '书籍录入功');
    console.log(`\n少一字测试: ${score5.toFixed(3)}`);
    console.log('  Tokenization analysis:');
    console.log('  "书籍录入功能" => 书籍, 籍录, 录入, 入功, 功能');
    console.log('  "书籍录入功" => 书籍, 籍录, 录入, 入功');
    console.log('  Intersection: 书籍, 籍录, 录入, 入功 (4/5 = 0.800)');
  });
});