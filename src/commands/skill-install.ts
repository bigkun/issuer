import { readdirSync, mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface SkillInstallOptions {
  bundledSkillsDir: string;
  targetPath?: string;
}

export interface SkillInstallResult {
  targetPath: string;
  installed: string[];
}

const CANDIDATE_TARGETS = [
  // Claude Code (primary, most compatible)
  '.claude/skills',
  // VS Code Copilot (multiple paths supported)
  '.copilot/skills',
  '.github/skills',
  // Agent Skills standard (agentskills.io)
  '.agents/skills',
  // Qoder / OpenCode
  '.qoder/skills',
  // Cursor uses Claude standard (.claude/skills)
];

export function detectTargetPath(home: string = homedir()): string {
  for (const c of CANDIDATE_TARGETS) {
    const p = join(home, c);
    if (existsSync(p)) return p;
  }
  return join(home, CANDIDATE_TARGETS[0]);
}

function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

export async function runSkillInstall(opts: SkillInstallOptions): Promise<SkillInstallResult> {
  const target = opts.targetPath ?? detectTargetPath();
  mkdirSync(target, { recursive: true });
  const installed: string[] = [];
  if (!existsSync(opts.bundledSkillsDir)) {
    return { targetPath: target, installed };
  }
  for (const name of readdirSync(opts.bundledSkillsDir)) {
    const src = join(opts.bundledSkillsDir, name);
    if (!statSync(src).isDirectory()) continue;
    copyDir(src, join(target, name));
    installed.push(name);
  }
  return { targetPath: target, installed };
}
