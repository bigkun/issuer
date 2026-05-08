import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectConfig, resolveToken, resolveGitHubToken, hasPlatformToken, findTokenSource, writeCredentialsFile, validateToken } from '../../src/core/config.js';
import { ConfigError } from '../../src/core/errors.js';

describe('loadProjectConfig', () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'issuer-cfg-')); });

  it('throws when config missing', async () => {
    await expect(loadProjectConfig(cwd)).rejects.toThrow(ConfigError);
  });

  it('parses a valid config', async () => {
    mkdirSync(join(cwd, '.issuer'));
    writeFileSync(
      join(cwd, '.issuer', 'config.yml'),
      'platform: github\nowner: acme\nrepo: demo\ndefault_labels: [a, b]\n',
    );
    const cfg = await loadProjectConfig(cwd);
    expect(cfg).toEqual({ platform: 'github', owner: 'acme', repo: 'demo', default_labels: ['a', 'b'] });
  });

  it('rejects missing required field', async () => {
    mkdirSync(join(cwd, '.issuer'));
    writeFileSync(join(cwd, '.issuer', 'config.yml'), 'platform: github\nowner: acme\n');
    await expect(loadProjectConfig(cwd)).rejects.toThrow(/repo/);
  });
});

describe('resolveToken', () => {
  it('prefers primary env var', () => {
    expect(resolveToken('github', { env: { ISSUER_GITHUB_TOKEN: 'A', GITHUB_TOKEN: 'B' } })).toBe('A');
  });
  it('falls back to secondary env var', () => {
    expect(resolveToken('github', { env: { GITHUB_TOKEN: 'B' } })).toBe('B');
  });
  it('falls back to project credentials file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    mkdirSync(join(dir, '.issuer'));
    writeFileSync(join(dir, '.issuer', 'credentials.yml'), 'github_token: from-project\n');
    expect(resolveToken('github', { env: {}, projectRoot: dir, credentialsFile: join(dir, 'nope.yml') })).toBe('from-project');
  });
  it('falls back to global credentials file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    const file = join(dir, 'credentials.yml');
    writeFileSync(file, 'gitlab_token: glpat-from-global\n');
    expect(resolveToken('gitlab', { env: {}, credentialsFile: file })).toBe('glpat-from-global');
  });
  it('project credentials take priority over global', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    mkdirSync(join(dir, '.issuer'));
    writeFileSync(join(dir, '.issuer', 'credentials.yml'), 'yunxiao_token: from-project\n');
    const globalFile = join(dir, 'global.yml');
    writeFileSync(globalFile, 'yunxiao_token: from-global\n');
    expect(resolveToken('yunxiao', { env: {}, projectRoot: dir, credentialsFile: globalFile })).toBe('from-project');
  });
  it('throws when nothing found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    expect(() => resolveToken('github', { env: {}, credentialsFile: join(dir, 'nope.yml') })).toThrow(ConfigError);
  });
  it('resolves gitlab token via GITLAB_TOKEN', () => {
    expect(resolveToken('gitlab', { env: { GITLAB_TOKEN: 'glpat-123' } })).toBe('glpat-123');
  });
  it('resolves yunxiao token via YUNXIAO_TOKEN', () => {
    expect(resolveToken('yunxiao', { env: { YUNXIAO_TOKEN: 'yx-123' } })).toBe('yx-123');
  });
  it('throws for unknown platform', () => {
    expect(() => resolveToken('bitbucket', { env: {} })).toThrow(/Unknown platform/);
  });
});

describe('resolveGitHubToken (deprecated wrapper)', () => {
  it('still works as a wrapper', () => {
    expect(resolveGitHubToken({ env: { ISSUER_GITHUB_TOKEN: 'A', GITHUB_TOKEN: 'B' } })).toBe('A');
  });
  it('falls back to credentials file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    const file = join(dir, 'credentials.yml');
    writeFileSync(file, 'github_token: from-file\n');
    expect(resolveGitHubToken({ env: {}, credentialsFile: file })).toBe('from-file');
  });
  it('throws when nothing found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    expect(() => resolveGitHubToken({ env: {}, credentialsFile: join(dir, 'nope.yml') })).toThrow(ConfigError);
  });
});

describe('hasPlatformToken', () => {
  it('returns true when env var is set', () => {
    expect(hasPlatformToken('github', { env: { GITHUB_TOKEN: 'x' } })).toBe(true);
  });
  it('returns false when no token found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    expect(hasPlatformToken('github', { env: {}, credentialsFile: join(dir, 'nope.yml') })).toBe(false);
  });
  it('returns true when project credentials exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    mkdirSync(join(dir, '.issuer'));
    writeFileSync(join(dir, '.issuer', 'credentials.yml'), 'gitlab_token: glpat-abc\n');
    expect(hasPlatformToken('gitlab', { env: {}, projectRoot: dir })).toBe(true);
  });
});

describe('findTokenSource', () => {
  it('returns source from env var', () => {
    const result = findTokenSource('github', { env: { GITHUB_TOKEN: 'ghp_abc' } });
    expect(result).toEqual({ token: 'ghp_abc', source: 'GITHUB_TOKEN' });
  });
  it('returns source from project credentials', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    mkdirSync(join(dir, '.issuer'));
    writeFileSync(join(dir, '.issuer', 'credentials.yml'), 'gitlab_token: glpat-xyz\n');
    const result = findTokenSource('gitlab', { env: {}, projectRoot: dir });
    expect(result?.token).toBe('glpat-xyz');
    expect(result?.source).toContain('.issuer');
  });
  it('returns null when no token found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    expect(findTokenSource('github', { env: {}, credentialsFile: join(dir, 'nope.yml') })).toBeNull();
  });
  it('returns null for unknown platform', () => {
    expect(findTokenSource('bitbucket', { env: {} })).toBeNull();
  });
});

describe('writeCredentialsFile', () => {
  it('creates new credentials file with token', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    const file = join(dir, 'credentials.yml');
    writeCredentialsFile(file, 'github', 'ghp_new');
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('github_token');
    expect(content).toContain('ghp_new');
  });
  it('merges with existing credentials file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    const file = join(dir, 'credentials.yml');
    writeFileSync(file, 'gitlab_token: glpat_old\n');
    writeCredentialsFile(file, 'github', 'ghp_new');
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('ghp_new');
    expect(content).toContain('glpat_old');
  });
  it('overwrites existing key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    const file = join(dir, 'credentials.yml');
    writeFileSync(file, 'github_token: ghp_old\n');
    writeCredentialsFile(file, 'github', 'ghp_new');
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('ghp_new');
    expect(content).not.toContain('ghp_old');
  });
  it('throws for unknown platform', () => {
    const dir = mkdtempSync(join(tmpdir(), 'issuer-cred-'));
    expect(() => writeCredentialsFile(join(dir, 'cred.yml'), 'bitbucket', 'x')).toThrow(ConfigError);
  });
});

describe('validateToken', () => {
  it('validates github token via issue list', async () => {
    const mockFetch = async (url: string) => {
      if (url.includes('/repos/acme/demo/issues')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false, status: 404 };
    };
    const result = await validateToken('github', 'ghp_test', { owner: 'acme', repo: 'demo', fetch: mockFetch as any });
    expect(result.valid).toBe(true);
  });
  it('validates gitlab token via issue list', async () => {
    const mockFetch = async (url: string) => {
      if (url.includes('/api/v4/projects/') && url.includes('/issues')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false, status: 401 };
    };
    const result = await validateToken('gitlab', 'glpat_test', { owner: 'myorg', repo: 'myproject', fetch: mockFetch as any });
    expect(result.valid).toBe(true);
  });
  it('validates yunxiao token successfully', async () => {
    const mockFetch = async (url: string, init?: RequestInit) => {
      // 新版 API: POST workitems:search
      if (url.includes('workitems:search')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false, status: 401 };
    };
    const result = await validateToken('yunxiao', 'yx_test', { owner: 'org123', fetch: mockFetch as any });
    expect(result.valid).toBe(true);
  });
  it('returns invalid for bad github token', async () => {
    const mockFetch = async () => ({ ok: false, status: 401 });
    const result = await validateToken('github', 'bad-token', { owner: 'acme', repo: 'demo', fetch: mockFetch as any });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('401');
  });
  it('returns error for unknown platform', async () => {
    const result = await validateToken('bitbucket', 'x');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('Unknown platform');
  });
  it('returns error for github without owner/repo', async () => {
    const result = await validateToken('github', 'ghp_test');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('owner and repo');
  });
  it('returns error for gitlab without owner/repo', async () => {
    const result = await validateToken('gitlab', 'glpat_test');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('owner and repo');
  });
  it('returns error for yunxiao without owner', async () => {
    const result = await validateToken('yunxiao', 'yx_test');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('organizationId');
  });
  it('handles network error', async () => {
    const mockFetch = async () => { throw new Error('Network error'); };
    const result = await validateToken('github', 'ghp_test', { owner: 'acme', repo: 'demo', fetch: mockFetch as any });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('Network error');
  });
});
