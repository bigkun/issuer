import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAuth } from '../../src/commands/auth.js';

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

  it('validates and saves a valid github token', async () => {
    const mockFetch = async (url: string) => {
      if (url.includes('/repos/acme/demo/issues')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false, status: 404 };
    };
    const result = await runAuth({ cwd, token: 'ghp_test', nonInteractive: true, fetch: mockFetch as any });
    expect(result.platform).toBe('github');
    expect(result.valid).toBe(true);
    // Check credentials file was written
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
    const mockFetch = async (url: string) => {
      if (url.includes('/api/v4/projects/') && url.includes('/issues')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false, status: 404 };
    };
    const result = await runAuth({ cwd, token: 'glpat_test', platform: 'gitlab', nonInteractive: true, fetch: mockFetch as any });
    expect(result.platform).toBe('gitlab');
    expect(result.valid).toBe(true);
  });

  it('finds existing token from project credentials', async () => {
    // Write a token in project credentials
    writeFileSync(join(cwd, '.issuer', 'credentials.yml'), 'github_token: ghp_existing\n');
    const mockFetch = async (url: string) => {
      if (url.includes('/repos/acme/demo/issues')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false, status: 404 };
    };
    // Without providing token, it should find the existing one
    const result = await runAuth({ cwd, nonInteractive: true, fetch: mockFetch as any });
    expect(result.platform).toBe('github');
    expect(result.valid).toBe(true);
    const credPath = join(cwd, '.issuer', 'credentials.yml');
    expect(existsSync(credPath)).toBe(true);
  });
});
