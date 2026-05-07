import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../src/commands/init.js';
import { ConfigError } from '../../src/core/errors.js';

describe('runInit', () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'issuer-init-')); });

  it('creates .issuer/config.yml with provided platform/owner/repo', async () => {
    await runInit({ cwd, platform: 'github', owner: 'acme', repo: 'demo', nonInteractive: true });
    const cfg = readFileSync(join(cwd, '.issuer', 'config.yml'), 'utf8');
    expect(cfg).toContain('platform: github');
    expect(cfg).toContain('owner: acme');
    expect(cfg).toContain('repo: demo');
    expect(existsSync(join(cwd, '.issuer', 'tasks'))).toBe(true);
  });

  it('refuses to overwrite without --force', async () => {
    await runInit({ cwd, platform: 'github', owner: 'a', repo: 'b', nonInteractive: true });
    await expect(
      runInit({ cwd, platform: 'github', owner: 'a', repo: 'b', nonInteractive: true }),
    ).rejects.toThrow(ConfigError);
  });

  it('rejects missing fields in non-interactive mode', async () => {
    await expect(
      runInit({ cwd, platform: 'github', nonInteractive: true }),
    ).rejects.toThrow(/required/);
  });
});
