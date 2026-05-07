import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSkillInstall, detectTargetPath } from '../../src/commands/skill-install.js';

describe('runSkillInstall', () => {
  it('copies all bundled skills into target directory', async () => {
    const src = mkdtempSync(join(tmpdir(), 'bundled-'));
    const dst = mkdtempSync(join(tmpdir(), 'target-'));
    mkdirSync(join(src, 'issuer'), { recursive: true });
    writeFileSync(join(src, 'issuer', 'SKILL.md'), '# issuer skill');
    mkdirSync(join(src, 'issuer-refine'), { recursive: true });
    writeFileSync(join(src, 'issuer-refine', 'SKILL.md'), '# refine');

    const result = await runSkillInstall({ bundledSkillsDir: src, targetPath: dst });
    expect(result.installed.sort()).toEqual(['issuer', 'issuer-refine']);
    expect(existsSync(join(dst, 'issuer', 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(dst, 'issuer-refine', 'SKILL.md'), 'utf8')).toBe('# refine');
  });

  it('returns empty installed list when bundled dir missing', async () => {
    const dst = mkdtempSync(join(tmpdir(), 'target-'));
    const result = await runSkillInstall({ bundledSkillsDir: join(dst, 'nope'), targetPath: dst });
    expect(result.installed).toEqual([]);
  });

  it('detectTargetPath falls back to first candidate when none exist', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'fake-home-'));
    const p = detectTargetPath(fakeHome);
    expect(p).toBe(join(fakeHome, '.agents/skills'));
  });
});
