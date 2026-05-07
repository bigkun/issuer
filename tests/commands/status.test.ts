import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStatus } from '../../src/commands/status.js';

function fm(id: string, status: string): string {
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

describe('runStatus', () => {
  it('counts tasks by status', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'issuer-status-'));
    mkdirSync(join(cwd, '.issuer', 'tasks'), { recursive: true });
    writeFileSync(join(cwd, '.issuer', 'tasks', 'a.md'), fm('a', 'draft'));
    writeFileSync(join(cwd, '.issuer', 'tasks', 'b.md'), fm('b', 'ready'));
    writeFileSync(join(cwd, '.issuer', 'tasks', 'c.md'), fm('c', 'synced'));
    expect(await runStatus({ cwd })).toEqual({ draft: 1, ready: 1, synced: 1, total: 3 });
  });

  it('returns zeros when no tasks', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'issuer-status-'));
    expect(await runStatus({ cwd })).toEqual({ draft: 0, ready: 0, synced: 0, total: 0 });
  });
});
