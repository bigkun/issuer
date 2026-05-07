import { describe, it, expect } from 'vitest';
import { createProgram } from '../../src/cli/parser.js';

describe('createProgram', () => {
  it('builds a Commander program named issuer', () => {
    const p = createProgram();
    expect(p.name()).toBe('issuer');
    expect(p.description()).toMatch(/Skill-driven/);
    expect(p.version()).toBe('0.1.0');
  });
});
