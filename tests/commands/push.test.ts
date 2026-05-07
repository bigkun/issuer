import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPush } from '../../src/commands/push.js';
import type { Adapter } from '../../src/adapter/interface.js';

function setup() {
  const cwd = mkdtempSync(join(tmpdir(), 'issuer-push-'));
  mkdirSync(join(cwd, '.issuer', 'tasks'), { recursive: true });
  const fmA = `---
id: 2026-05-06-a
type: task
title: A
status: ready
platform: github
platform_id: null
platform_url: null
priority: medium
labels: []
created_at: "2026-05-06T00:00:00Z"
updated_at: "2026-05-06T00:00:00Z"
---
A body
`;
  const fmB = `---
id: 2026-05-06-b
type: task
title: B
status: ready
platform: github
platform_id: "42"
platform_url: https://x/42
priority: medium
labels: []
created_at: "2026-05-06T00:00:00Z"
updated_at: "2026-05-06T00:00:00Z"
---
B body
`;
  writeFileSync(join(cwd, '.issuer', 'tasks', '2026-05-06-a.md'), fmA);
  writeFileSync(join(cwd, '.issuer', 'tasks', '2026-05-06-b.md'), fmB);
  const created: string[] = [];
  const updated: string[] = [];
  const adapter: Adapter = {
    name: 'github',
    async createIssue(t) { created.push(t.id); return { id: '99', url: 'https://x/99' }; },
    async updateIssue(t) { updated.push(t.id); return { id: t.platform_id!, url: t.platform_url! }; },
    async listRemote() { return []; },
  };
  return { cwd, adapter, created, updated };
}

describe('runPush', () => {
  it('creates new and updates existing, marks files synced', async () => {
    const { cwd, adapter, created, updated } = setup();
    const summary = await runPush({ cwd, adapter });
    expect(summary.created).toHaveLength(1);
    expect(summary.updated).toHaveLength(1);
    expect(created).toEqual(['2026-05-06-a']);
    expect(updated).toEqual(['2026-05-06-b']);
    const a = readFileSync(join(cwd, '.issuer', 'tasks', '2026-05-06-a.md'), 'utf8');
    expect(a).toMatch(/status: synced/);
    expect(a).toMatch(/platform_id: ['"]?99['"]?/);
  });

  it('skips tasks with mismatching platform', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'issuer-push-'));
    mkdirSync(join(cwd, '.issuer', 'tasks'), { recursive: true });
    writeFileSync(
      join(cwd, '.issuer', 'tasks', 'x.md'),
      `---\nid: x\ntype: task\ntitle: X\nstatus: ready\nplatform: gitlab\nplatform_id: null\nplatform_url: null\npriority: low\nlabels: []\ncreated_at: "2026-05-06T00:00:00Z"\nupdated_at: "2026-05-06T00:00:00Z"\n---\nbody\n`,
    );
    const adapter: Adapter = {
      name: 'github',
      async createIssue() { throw new Error('should not'); },
      async updateIssue() { throw new Error('should not'); },
      async listRemote() { return []; },
    };
    const s = await runPush({ cwd, adapter });
    expect(s.skipped).toHaveLength(1);
    expect(s.created).toHaveLength(0);
  });
});
