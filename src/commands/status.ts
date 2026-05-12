import { TaskStore } from '../core/task-store.js';
import { Status } from '../core/types.js';
import { loadProjectConfig } from '../core/config.js';

export interface StatusSummary {
  draft: number;
  ready: number;
  synced: number;
  total: number;
}

export async function runStatus(opts: { cwd: string }): Promise<StatusSummary> {
  const cfg = await loadProjectConfig(opts.cwd);
  const store = new TaskStore(opts.cwd, {
    tasksDir: cfg.tasks_dir,
  });
  const all = await store.list();
  const summary: StatusSummary = { draft: 0, ready: 0, synced: 0, total: all.length };
  for (const t of all) {
    if (t.status === Status.Draft) summary.draft++;
    else if (t.status === Status.Ready) summary.ready++;
    else if (t.status === Status.Synced) summary.synced++;
  }
  return summary;
}
