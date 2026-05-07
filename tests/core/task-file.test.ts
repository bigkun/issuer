import { describe, it, expect } from 'vitest';
import { parseTaskFile, serializeTaskFile } from '../../src/core/task-file.js';
import { WorkType, Status, Priority } from '../../src/core/types.js';
import { TaskParseError } from '../../src/core/errors.js';

const VALID = `---
id: 2026-05-06-add-login
type: story
title: Add login
status: draft
platform: github
platform_id: null
platform_url: null
priority: high
labels: [auth, mvp]
created_at: 2026-05-06T10:00:00Z
updated_at: 2026-05-06T10:00:00Z
---
Body line one.

Body line two.
`;

describe('parseTaskFile', () => {
  it('parses a valid file', () => {
    const t = parseTaskFile(VALID, '/x.md');
    expect(t.id).toBe('2026-05-06-add-login');
    expect(t.type).toBe(WorkType.Story);
    expect(t.status).toBe(Status.Draft);
    expect(t.priority).toBe(Priority.High);
    expect(t.labels).toEqual(['auth', 'mvp']);
    expect(t.platform_id).toBeNull();
    expect(t.body).toBe('Body line one.\n\nBody line two.\n');
    expect(t.filePath).toBe('/x.md');
  });

  it('throws TaskParseError when required field is missing', () => {
    const broken = VALID.replace('priority: high\n', '');
    expect(() => parseTaskFile(broken, '/x.md')).toThrow(TaskParseError);
  });

  it('throws on invalid enum value', () => {
    const broken = VALID.replace('type: story', 'type: nope');
    expect(() => parseTaskFile(broken, '/x.md')).toThrow(/type must be one of/);
  });

  it('throws on non-array labels', () => {
    const broken = VALID.replace('labels: [auth, mvp]', 'labels: auth');
    expect(() => parseTaskFile(broken, '/x.md')).toThrow(/labels must be an array/);
  });
});

describe('serializeTaskFile', () => {
  it('round-trips a parsed file', () => {
    const t = parseTaskFile(VALID, '/x.md');
    const out = serializeTaskFile(t);
    const re = parseTaskFile(out, '/x.md');
    expect(re).toEqual(t);
  });

  it('writes platform_id null literally', () => {
    const t = parseTaskFile(VALID, '/x.md');
    const out = serializeTaskFile(t);
    expect(out).toMatch(/platform_id: null/);
  });
});
