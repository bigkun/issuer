import { describe, it, expect } from 'vitest';
import { taskToIssueInput, issueToRemote } from '../../../src/adapter/github/mapper.js';
import { Priority, Status, WorkType, TaskFile } from '../../../src/core/types.js';

function task(overrides: Partial<TaskFile> = {}): TaskFile {
  return {
    id: 'x',
    type: WorkType.Bug,
    title: 'Fix it',
    status: Status.Ready,
    platform: 'github',
    platform_id: null,
    platform_url: null,
    priority: Priority.High,
    labels: ['ux'],
    created_at: '2026-05-06T00:00:00Z',
    updated_at: '2026-05-06T00:00:00Z',
    body: 'Body',
    filePath: '/x.md',
    ...overrides,
  };
}

describe('taskToIssueInput', () => {
  it('adds type and priority labels deduped with user labels', () => {
    const out = taskToIssueInput(task());
    expect(out.title).toBe('Fix it');
    expect(out.body).toBe('Body');
    expect(out.labels.sort()).toEqual(['priority:high', 'type:bug', 'ux']);
  });

  it('does not duplicate when user already has type:* label', () => {
    const out = taskToIssueInput(task({ labels: ['type:bug', 'priority:high'] }));
    expect(out.labels.sort()).toEqual(['priority:high', 'type:bug']);
  });
});

describe('issueToRemote', () => {
  it('maps fields', () => {
    expect(issueToRemote({ number: 12, title: 'T', state: 'open', html_url: 'https://x/12' }))
      .toEqual({ id: '12', title: 'T', state: 'open', url: 'https://x/12' });
  });
});
