import { writeFileSync } from 'node:fs';
import { TaskStore } from '../core/task-store.js';
import { serializeTaskFile } from '../core/task-file.js';
import { Status, TaskFile } from '../core/types.js';
import type { Adapter } from '../adapter/interface.js';

export interface PushOptions {
  cwd: string;
  adapter: Adapter;
}

export interface PushSummary {
  created: TaskFile[];
  updated: TaskFile[];
  skipped: TaskFile[];
}

export async function runPush(opts: PushOptions): Promise<PushSummary> {
  const store = new TaskStore(opts.cwd);
  const ready = await store.list({ status: Status.Ready });
  const created: TaskFile[] = [];
  const updated: TaskFile[] = [];
  const skipped: TaskFile[] = [];

  for (const task of ready) {
    if (task.platform !== opts.adapter.name) {
      skipped.push(task);
      continue;
    }
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
  }

  return { created, updated, skipped };
}
