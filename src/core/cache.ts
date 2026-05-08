import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RemoteIssue } from '../adapter/interface.js';

export interface IssueCache {
  platform: string;
  owner: string;
  repo: string;
  fetched_at: string; // ISO 8601
  issues: RemoteIssue[];
}

const CACHE_FILE = 'cache/issues.json';
const DEFAULT_TTL_HOURS = 24;

export function getCachePath(projectRoot: string): string {
  return join(projectRoot, '.issuer', CACHE_FILE);
}

export function loadCache(projectRoot: string): IssueCache | null {
  const path = getCachePath(projectRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return raw as IssueCache;
  } catch {
    return null;
  }
}

export function saveCache(projectRoot: string, cache: IssueCache): void {
  const path = getCachePath(projectRoot);
  mkdirSync(join(projectRoot, '.issuer', 'cache'), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2), 'utf8');
}

export function isCacheExpired(cache: IssueCache | null, ttlHours: number = DEFAULT_TTL_HOURS): boolean {
  if (!cache) return true;
  const fetchedAt = new Date(cache.fetched_at);
  const now = new Date();
  const hoursSinceFetch = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceFetch >= ttlHours;
}

export function needsRefresh(projectRoot: string, ttlHours?: number): boolean {
  const cache = loadCache(projectRoot);
  return isCacheExpired(cache, ttlHours);
}

export function getCacheAge(cache: IssueCache | null): number {
  if (!cache) return 0;
  const fetchedAt = new Date(cache.fetched_at);
  const now = new Date();
  return Math.round((now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60));
}