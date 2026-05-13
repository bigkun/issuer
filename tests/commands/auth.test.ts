import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAuth } from '../../src/commands/auth.js';
import type { Adapter } from '../../src/adapter/interface.js';

/** Create a mock adapter that succeeds or fails on listRemote */
function mockAdapter(succeeds: boolean): Adapter {
  return {
    name: 'test',
    listRemote: succeeds
      ? async () => []
      : async () => { throw new Error('API 401 Unauthorized'); },
    createIssue: async () => ({ id: '1', url: '' }),
    updateIssue: async () => ({ id: '1', url: '' }),
  };
}

describe('runAuth', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'issuer-auth-'));
    mkdirSync(join(cwd, '.issuer'), { recursive: true });
    writeFileSync(
      join(cwd, '.issuer', 'config.yml'),
      'platform: github\nowner: acme\nrepo: demo\n',
    );
  });

  it('validates and saves a valid token', async () => {
    const result = await runAuth({ cwd, token: 'ghp_test', nonInteractive: true, adapter: mockAdapter(true) });
    expect(result.platform).toBe('github');
    expect(result.valid).toBe(true);
    const credPath = join(cwd, '.issuer', 'credentials.yml');
    expect(existsSync(credPath)).toBe(true);
  });

  it('returns error when no token and nonInteractive', async () => {
    const result = await runAuth({ cwd, nonInteractive: true });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No token provided');
  });

  it('throws when no platform configured', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'issuer-auth-'));
    await expect(runAuth({ cwd: emptyDir, token: 'ghp_test', nonInteractive: true }))
      .rejects.toThrow(/No platform configured/);
  });

  it('uses --platform override', async () => {
    const result = await runAuth({ cwd, token: 'glpat_test', platform: 'gitlab', nonInteractive: true, adapter: mockAdapter(true) });
    expect(result.platform).toBe('gitlab');
    expect(result.valid).toBe(true);
  });

  it('finds existing token from project credentials', async () => {
    writeFileSync(join(cwd, '.issuer', 'credentials.yml'), 'github_token: ghp_existing\n');
    const result = await runAuth({ cwd, nonInteractive: true, adapter: mockAdapter(true) });
    expect(result.platform).toBe('github');
    expect(result.valid).toBe(true);
    const credPath = join(cwd, '.issuer', 'credentials.yml');
    expect(existsSync(credPath)).toBe(true);
  });
});
