import { describe, it, expect } from 'vitest';
import { WorkType, Status, Priority, WORK_TYPES, STATUSES, PRIORITIES } from '../../src/core/types.js';
import { IssuerError, TaskParseError, ConfigError, AdapterError } from '../../src/core/errors.js';

describe('core/types', () => {
  it('enumerates work types', () => {
    expect(WORK_TYPES).toEqual(['bug', 'story', 'task', 'epic']);
  });
  it('enumerates statuses', () => {
    expect(STATUSES).toEqual(['draft', 'ready', 'synced']);
  });
  it('enumerates priorities', () => {
    expect(PRIORITIES).toEqual(['critical', 'high', 'medium', 'low']);
  });
  it('exposes string-valued enum members', () => {
    expect(WorkType.Bug).toBe('bug');
    expect(Status.Draft).toBe('draft');
    expect(Priority.High).toBe('high');
  });
});

describe('core/errors', () => {
  it('IssuerError preserves message and cause', () => {
    const inner = new Error('boom');
    const e = new IssuerError('outer', inner);
    expect(e.name).toBe('IssuerError');
    expect(e.message).toBe('outer');
    expect(e.cause).toBe(inner);
  });
  it('TaskParseError prepends filePath', () => {
    const e = new TaskParseError('bad fm', '/a/b.md');
    expect(e.message).toBe('/a/b.md: bad fm');
    expect(e.filePath).toBe('/a/b.md');
  });
  it('AdapterError prepends adapter name', () => {
    const e = new AdapterError('rate limited', 'github');
    expect(e.message).toBe('[github] rate limited');
    expect(e.adapter).toBe('github');
  });
  it('ConfigError keeps name', () => {
    expect(new ConfigError('x').name).toBe('ConfigError');
  });
});
