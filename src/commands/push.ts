import { writeFileSync } from 'node:fs';
import { TaskStore } from '../core/task-store.js';
import { serializeTaskFile } from '../core/task-file.js';
import { Status, TaskFile } from '../core/types.js';
import { loadProjectConfig, DEFAULT_DEDUP_CONFIG } from '../core/config.js';
import { loadCache, saveCache, needsRefresh } from '../core/cache.js';
import { findSimilarIssues, type MatchResult } from '../core/similarity.js';
import type { Adapter, RemoteIssue } from '../adapter/interface.js';

export interface PushOptions {
  cwd: string;
  adapter: Adapter;
  skipDedup?: boolean;
}

export interface PushSummary {
  created: TaskFile[];
  updated: TaskFile[];
  skipped: TaskFile[];
  duplicates: DuplicateResult[];
  /** Tasks that were duplicates but user chose to upload */
  duplicateUploaded: TaskFile[];
  /** Tasks that were duplicates and were skipped */
  duplicateSkipped: TaskFile[];
}

export interface DuplicateResult {
  task: TaskFile;
  matches: MatchResult[];
}

export async function runPush(opts: PushOptions): Promise<PushSummary> {
  const cfg = await loadProjectConfig(opts.cwd);
  const dedup = cfg.dedup ?? DEFAULT_DEDUP_CONFIG;

  const store = new TaskStore(opts.cwd);
  const ready = await store.list({ status: Status.Ready });
  const created: TaskFile[] = [];
  const updated: TaskFile[] = [];
  const skipped: TaskFile[] = [];
  const duplicates: DuplicateResult[] = [];
  const duplicateUploaded: TaskFile[] = [];
  const duplicateSkipped: TaskFile[] = [];

  // 每天首次 sync 时刷新缓存
  let cacheIssues: RemoteIssue[] = [];
  if (dedup.enabled && !opts.skipDedup) {
    if (needsRefresh(opts.cwd, dedup.ttl_hours)) {
      console.log('Refreshing issue cache from platform...');
      cacheIssues = await opts.adapter.listRemote();
      saveCache(opts.cwd, {
        platform: cfg.platform,
        owner: cfg.owner,
        repo: cfg.repo,
        fetched_at: new Date().toISOString(),
        issues: cacheIssues,
      });
    } else {
      const loaded = loadCache(opts.cwd);
      cacheIssues = loaded?.issues ?? [];
    }
  }

  for (const task of ready) {
    if (task.platform !== opts.adapter.name) {
      skipped.push(task);
      continue;
    }

    // 去重检查（仅对新 issue，已 sync 的跳过）
    if (dedup.enabled && !task.platform_id && !opts.skipDedup && cacheIssues.length > 0) {
      const matches = findSimilarIssues(task.title, cacheIssues, dedup.threshold);
      if (matches.length > 0) {
        duplicates.push({ task, matches });
        
        // Handle based on on_match strategy
        if (dedup.on_match === 'skip') {
          // Auto-skip duplicates
          skipped.push(task);
          duplicateSkipped.push(task);
          continue;
        } else if (dedup.on_match === 'continue') {
          // Auto-upload duplicates (no user interaction)
          duplicateUploaded.push(task);
          // Fall through to upload logic below
        } else {
          // on_match: 'prompt' - skip upload, let CLI handle user interaction
          skipped.push(task);
          duplicateSkipped.push(task);
          continue;
        }
      }
    }

    // 正常上传流程
    const isUpdate = !!task.platform_id;
    const result = isUpdate
      ? await opts.adapter.updateIssue(task)
      : await opts.adapter.createIssue(task);
    const next: TaskFile = {
      ...task,
      platform_id: result.id,
      platform_url: result.url,
      status: Status.Synced,
      updated_at: new Date().toISOString(),
    };
    writeFileSync(task.filePath, serializeTaskFile(next), 'utf8');
    (isUpdate ? updated : created).push(next);

    // 增量更新缓存
    if (cacheIssues.length > 0) {
      cacheIssues.push({
        id: result.id,
        title: task.title,
        state: 'open',
        url: result.url,
      });
    }
  }

  // 保存增量更新的缓存
  if (cacheIssues.length > 0 && dedup.enabled && !opts.skipDedup) {
    const existing = loadCache(opts.cwd);
    if (existing) {
      existing.issues = cacheIssues;
      saveCache(opts.cwd, existing);
    }
  }

  return { created, updated, skipped, duplicates, duplicateUploaded, duplicateSkipped };
}
