import { writeFileSync } from 'node:fs';
import { TaskStore } from '../core/task-store.js';
import { serializeTaskFile } from '../core/task-file.js';
import { Status, TaskFile } from '../core/types.js';
import { loadProjectConfig, saveProjectConfig, DEFAULT_DEDUP_CONFIG, type DedupConfig } from '../core/config.js';
import { loadCache, saveCache, needsRefresh } from '../core/cache.js';
import { findSimilarIssues, type MatchResult } from '../core/similarity.js';
import { REMOTE_STATE_OPEN } from '../core/constants.js';
import type { Adapter, RemoteIssue } from '../adapter/interface.js';

export interface PushOptions {
  cwd: string;
  adapter: Adapter;
  /** Dedup configuration (CLI overrides take precedence) */
  dedupConfig?: DedupConfig;
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
  // Use CLI-provided dedupConfig if available, otherwise use config file defaults
  const dedup = opts.dedupConfig ?? cfg.dedup ?? DEFAULT_DEDUP_CONFIG;

  // PingCode: Check project type on first push
  if (cfg.platform === 'pingcode' && !cfg.pingcode_project_type) {
    await ensurePingCodeProjectType(opts.cwd, opts.adapter, cfg);
  }

  const store = new TaskStore(opts.cwd, {
    tasksDir: cfg.tasks_dir,
  });
  const ready = await store.list({ status: Status.Ready });
  const created: TaskFile[] = [];
  const updated: TaskFile[] = [];
  const skipped: TaskFile[] = [];
  const duplicates: DuplicateResult[] = [];
  const duplicateUploaded: TaskFile[] = [];
  const duplicateSkipped: TaskFile[] = [];

  // 每天首次 sync 时刷新缓存
  let cacheIssues: RemoteIssue[] = [];
  if (dedup.enabled) {
    const cache = loadCache(opts.cwd);
    
    // 验证缓存是否匹配当前项目配置
    const cacheValid = cache && 
      cache.platform === cfg.platform && 
      cache.owner === cfg.owner && 
      cache.repo === cfg.repo;
    
    if (!cacheValid || needsRefresh(opts.cwd, dedup.ttl_hours)) {
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
      cacheIssues = cache?.issues ?? [];
    }
  }

  for (const task of ready) {
    if (task.platform !== opts.adapter.name) {
      skipped.push(task);
      continue;
    }

    // 去重检查（仅对新 issue，已 sync 的跳过）
    if (dedup.enabled && !task.platform_id && cacheIssues.length > 0) {
      // 传递任务类型，按类型分组去重
      const matches = findSimilarIssues(task.title, cacheIssues, dedup.threshold, task.type);
      if (matches.length > 0) {
        duplicates.push({ task, matches });
        
        // Handle based on on_match strategy
        if (dedup.on_match === 'skip') {
          // Auto-skip duplicates
          skipped.push(task);
          duplicateSkipped.push(task);
          continue;
        } else if (dedup.on_match === 'upload') {
          // Auto-upload duplicates (force upload)
          duplicateUploaded.push(task);
          // Fall through to upload logic below
        } else {
          // on_match: 'prompt' - skip upload temporarily, let CLI handle user interaction
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
        state: REMOTE_STATE_OPEN,
        url: result.url,
      });
    }
  }

  // 保存增量更新的缓存
  if (cacheIssues.length > 0 && dedup.enabled) {
    const existing = loadCache(opts.cwd);
    if (existing) {
      existing.issues = cacheIssues;
      saveCache(opts.cwd, existing);
    }
  }

  return { created, updated, skipped, duplicates, duplicateUploaded, duplicateSkipped };
}

/**
 * Ensure PingCode project type is detected and cached on first push.
 * Checks task types against available work item types and warns on mismatch.
 */
async function ensurePingCodeProjectType(
  cwd: string,
  adapter: Adapter,
  cfg: any,
): Promise<void> {
  // Only for PingCode adapter
  if (adapter.name !== 'pingcode') return;

  // Try to get project type from adapter
  const adapterAny = adapter as any;
  if (typeof adapterAny.getProjectType !== 'function') return;

  try {
    const projectType = await adapterAny.getProjectType();
    if (!projectType) return;

    // Save to config
    saveProjectConfig(cwd, {
      pingcode_project_type: projectType,
    });

    console.log(`\n Detected PingCode project type: ${projectType}`);

    // If waterfall, warn about type mapping
    if (projectType === 'waterfall') {
      console.log(' Note: In waterfall projects, "story" type maps to "需求" (requirement).');
    }
  } catch {
    // Ignore errors, will be resolved during type_id lookup
  }
}
