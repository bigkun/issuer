import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TaskFile, Status } from './types.js';
import { parseTaskFile, serializeTaskFile } from './task-file.js';

export const TASKS_DIR = '.issuer/tasks';

export interface ListOptions {
  status?: Status;
}

export class TaskStore {
  constructor(private readonly cwd: string) {}

  get tasksDir(): string {
    return join(this.cwd, TASKS_DIR);
  }

  ensureLayout(): void {
    mkdirSync(this.tasksDir, { recursive: true });
  }

  async list(opts: ListOptions = {}): Promise<TaskFile[]> {
    if (!existsSync(this.tasksDir)) return [];
    const entries = readdirSync(this.tasksDir).filter((f) => f.endsWith('.md'));
    const tasks: TaskFile[] = [];
    for (const f of entries) {
      const filePath = join(this.tasksDir, f);
      const raw = readFileSync(filePath, 'utf8');
      const t = parseTaskFile(raw, filePath);
      if (opts.status && t.status !== opts.status) continue;
      tasks.push(t);
    }
    tasks.sort((a, b) => a.id.localeCompare(b.id));
    return tasks;
  }

  write(task: TaskFile): void {
    this.ensureLayout();
    writeFileSync(task.filePath, serializeTaskFile(task), 'utf8');
  }
}
