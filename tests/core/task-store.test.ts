import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../../src/core/task-store.js';
import { Status, WorkType, Priority, TaskFile } from '../../src/core/types.js';

function fm(id: string, status: Status): string {
  return `---
id: ${id}
type: task
title: ${id}
status: ${status}
platform: github
platform_id: null
platform_url: null
priority: medium
labels: []
created_at: "2026-05-06T00:00:00Z"
updated_at: "2026-05-06T00:00:00Z"
---
body
`;
}

describe('TaskStore', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'issuer-store-'));
  });

  it('ensureLayout creates .issuer/tasks dir', () => {
    new TaskStore(cwd).ensureLayout();
    expect(existsSync(join(cwd, '.issuer', 'tasks'))).toBe(true);
  });

  it('returns [] when tasks dir is missing', async () => {
    const list = await new TaskStore(cwd).list();
    expect(list).toEqual([]);
  });

  it('lists tasks sorted by id and filters by status', async () => {
    const store = new TaskStore(cwd);
    store.ensureLayout();
    writeFileSync(join(store.tasksDir, '2026-05-06-b.md'), fm('2026-05-06-b', Status.Ready));
    writeFileSync(join(store.tasksDir, '2026-05-06-a.md'), fm('2026-05-06-a', Status.Draft));
    writeFileSync(join(store.tasksDir, '2026-05-06-c.md'), fm('2026-05-06-c', Status.Ready));
    const all = await store.list();
    expect(all.map((t) => t.id)).toEqual(['2026-05-06-a', '2026-05-06-b', '2026-05-06-c']);
    const ready = await store.list({ status: Status.Ready });
    expect(ready.map((t) => t.id)).toEqual(['2026-05-06-b', '2026-05-06-c']);
  });

  it('write serialises a task to its filePath', () => {
    const store = new TaskStore(cwd);
    store.ensureLayout();
    const task: TaskFile = {
      id: '2026-05-06-x',
      type: WorkType.Task,
      title: 'X',
      status: Status.Ready,
      platform: 'github',
      platform_id: null,
      platform_url: null,
      priority: Priority.Low,
      labels: ['a'],
      created_at: '2026-05-06T00:00:00Z',
      updated_at: '2026-05-06T00:00:00Z',
      body: 'hello',
      filePath: join(store.tasksDir, '2026-05-06-x.md'),
    };
    store.write(task);
    const written = readFileSync(task.filePath, 'utf8');
    expect(written).toMatch(/id: 2026-05-06-x/);
    expect(written).toMatch(/labels:\s*\n\s*-\s*a/);
  });
});
