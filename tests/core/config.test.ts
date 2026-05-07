import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectConfig, resolveGitHubToken } from '../../src/core/config.js';
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

describe('resolveGitHubToken', () => {
  it('prefers ISSUER_GITHUB_TOKEN', () => {
    expect(resolveGitHubToken({ env: { ISSUER_GITHUB_TOKEN: 'A', GITHUB_TOKEN: 'B' } })).toBe('A');
  });
  it('falls back to GITHUB_TOKEN', () => {
    expect(resolveGitHubToken({ env: { GITHUB_TOKEN: 'B' } })).toBe('B');
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
