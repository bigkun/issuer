import type { RemoteIssue } from '../adapter/interface.js';

/**
 * 混合分词：英文单词 + 中文 2-gram
 */
export function tokenizeMixed(text: string): Set<string> {
  const tokens = new Set<string>();

  // 英文单词
  const englishWords = text.match(/[a-zA-Z]+/g) || [];
  englishWords.forEach(w => tokens.add(w.toLowerCase()));

  // 数字
  const numbers = text.match(/\d+/g) || [];
  numbers.forEach(n => tokens.add(n));

  // 中文 2-gram
  const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
  for (let i = 0; i < chineseChars.length - 1; i++) {
    tokens.add(chineseChars[i] + chineseChars[i + 1]);
  }

  // 单字符也加入（用于短标题）
  if (chineseChars.length <= 2) {
    chineseChars.forEach(c => tokens.add(c));
  }

  return tokens;
}

/**
 * Jaccard 相似度
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter(x => b.has(x));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

/**
 * 标题相似度计算
 */
export function titleSimilarity(a: string, b: string): number {
  return jaccardSimilarity(tokenizeMixed(a), tokenizeMixed(b));
}

/**
 * 找到相似 issues
 * 优化：按类型分组，只比较同类型的工作项
 */
export interface MatchResult {
  issue: RemoteIssue;
  score: number;
}

export function findSimilarIssues(
  taskTitle: string,
  cache: RemoteIssue[],
  threshold: number = 0.85,
  taskType?: string,  // 新增：任务类型
): MatchResult[] {
  // 如果指定了类型，只比较同类型的工作项
  const filteredCache = taskType 
    ? cache.filter(issue => issue.type === taskType || !issue.type)
    : cache;

  return filteredCache
    .map((issue) => ({
      issue,
      score: titleSimilarity(taskTitle, issue.title),
    }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}