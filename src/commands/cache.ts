import type { Adapter } from '../adapter/interface.js';
import { saveCache, getCachePath } from '../core/cache.js';
import { loadProjectConfig } from '../core/config.js';

export interface CacheOptions {
  cwd: string;
  adapter: Adapter;
}

export interface CacheRefreshResult {
  count: number;
  path: string;
}

export async function runCacheRefresh(opts: CacheOptions): Promise<CacheRefreshResult> {
  const cfg = await loadProjectConfig(opts.cwd);
  const issues = await opts.adapter.listRemote();
  saveCache(opts.cwd, {
    platform: cfg.platform,
    owner: cfg.owner,
    repo: cfg.repo,
    fetched_at: new Date().toISOString(),
    issues,
  });
  return {
    count: issues.length,
    path: getCachePath(opts.cwd),
  };
}