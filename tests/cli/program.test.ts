import { describe, it, expect } from 'vitest';
import { buildProgram } from '../../src/cli/program.js';

describe('buildProgram', () => {
  it('registers all top-level commands', () => {
    const p = buildProgram();
    const names = p.commands.map((c) => c.name()).sort();
    expect(names).toEqual(['auth', 'init', 'list-remote', 'push', 'skill', 'status']);
  });

  it('skill subcommand has install', () => {
    const p = buildProgram();
    const skill = p.commands.find((c) => c.name() === 'skill');
    expect(skill).toBeDefined();
    expect(skill!.commands.map((c) => c.name())).toContain('install');
  });
});
