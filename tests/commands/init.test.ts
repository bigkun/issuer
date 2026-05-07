import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';
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
    expect(existsSync(join(cwd, '.issuer', 'briefs'))).toBe(true);
  });

  it('writes mcp_capabilities for github with full capabilities', async () => {
    await runInit({ cwd, platform: 'github', owner: 'acme', repo: 'demo', nonInteractive: true });
    const raw = yamlParse(readFileSync(join(cwd, '.issuer', 'config.yml'), 'utf8')) as Record<string, unknown>;
    const mc = raw.mcp_capabilities as Record<string, unknown>;
    expect(mc).toBeDefined();
    expect(mc.channel).toBe('mcp');
    const caps = mc.capabilities as Record<string, boolean>;
    expect(caps.create).toBe(true);
    expect(caps.update).toBe(true);
    expect(caps.comment).toBe(true);
  });

  it('writes mcp_capabilities for yunxiao with update=false and comment=false', async () => {
    await runInit({ cwd, platform: 'yunxiao', owner: 'org123', repo: 'proj456', nonInteractive: true });
    const raw = yamlParse(readFileSync(join(cwd, '.issuer', 'config.yml'), 'utf8')) as Record<string, unknown>;
    const mc = raw.mcp_capabilities as Record<string, unknown>;
    expect(mc).toBeDefined();
    expect(mc.channel).toBe('mcp');
    const caps = mc.capabilities as Record<string, boolean>;
    expect(caps.create).toBe(true);
    expect(caps.update).toBe(false);
    expect(caps.comment).toBe(false);
    expect(caps.search).toBe(true);
  });

  it('uses live probe results when probedTools is provided', async () => {
    await runInit({
      cwd,
      platform: 'yunxiao',
      owner: 'org123',
      repo: 'proj456',
      nonInteractive: true,
      probedTools: ['search_workitems', 'get_work_item'],
    });
    const raw = yamlParse(readFileSync(join(cwd, '.issuer', 'config.yml'), 'utf8')) as Record<string, unknown>;
    const mc = raw.mcp_capabilities as Record<string, unknown>;
    // No create/update → channel should be cli
    expect(mc.channel).toBe('cli');
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
