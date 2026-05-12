import { describe, it, expect } from 'vitest';
import { parseTaskFile, serializeTaskFile } from '../../src/core/task-file.js';
import { WorkType, Status, Priority, Severity } from '../../src/core/types.js';
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

const BUG_VALID = `---
id: 2026-05-12-login-fail
type: bug
title: Login fails with wrong password
status: draft
platform: yunxiao
platform_id: null
platform_url: null
priority: high
severity: high
labels: [auth, bug]
created_at: 2026-05-12T10:00:00Z
updated_at: 2026-05-12T10:00:00Z
---
Bug description here.
`;

describe('parseTaskFile - Bug type', () => {
  it('parses a valid Bug file with severity', () => {
    const t = parseTaskFile(BUG_VALID, '/bug.md');
    expect(t.type).toBe(WorkType.Bug);
    expect(t.priority).toBe(Priority.High);
    expect(t.severity).toBe(Severity.High);
  });

  it('throws when Bug type missing severity', () => {
    const broken = BUG_VALID.replace('severity: high\n', '');
    expect(() => parseTaskFile(broken, '/bug.md')).toThrow(/severity is required for Bug type/);
  });

  it('throws on invalid severity value', () => {
    const broken = BUG_VALID.replace('severity: high', 'severity: invalid');
    expect(() => parseTaskFile(broken, '/bug.md')).toThrow(/severity must be one of/);
  });

  it('allows non-Bug types without severity', () => {
    const storyWithoutSeverity = BUG_VALID
      .replace('type: bug', 'type: story')
      .replace('severity: high\n', '');
    const t = parseTaskFile(storyWithoutSeverity, '/story.md');
    expect(t.type).toBe(WorkType.Story);
    expect(t.severity).toBeUndefined();
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
