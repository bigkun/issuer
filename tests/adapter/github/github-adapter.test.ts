import { describe, it, expect, vi } from 'vitest';
import { GitHubAdapter } from '../../../src/adapter/github/index.js';
import { Priority, Status, WorkType, TaskFile } from '../../../src/core/types.js';
import { AdapterError } from '../../../src/core/errors.js';

function makeTask(overrides: Partial<TaskFile> = {}): TaskFile {
  return {
    id: 'x',
    type: WorkType.Task,
    title: 'T',
    status: Status.Ready,
    platform: 'github',
    platform_id: null,
    platform_url: null,
    priority: Priority.Medium,
    labels: [],
    created_at: '2026-05-06T00:00:00Z',
    updated_at: '2026-05-06T00:00:00Z',
    body: 'body',
    filePath: '/tmp/x.md',
    ...overrides,
  };
}

function fakeOctokit(impl: { create?: any; update?: any; list?: any } = {}) {
  return {
    issues: {
      create: impl.create ?? vi.fn(),
      update: impl.update ?? vi.fn(),
      listForRepo: impl.list ?? vi.fn(),
    },
  } as any;
}

describe('GitHubAdapter', () => {
  it('createIssue posts and returns ref', async () => {
    const create = vi.fn().mockResolvedValue({ data: { number: 7, html_url: 'https://x/7' } });
    const adapter = new GitHubAdapter({ token: 't', owner: 'o', repo: 'r', octokit: fakeOctokit({ create }) });
    const ref = await adapter.createIssue(makeTask({ title: 'Hi', labels: ['a'] }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ owner: 'o', repo: 'r', title: 'Hi' }));
    expect(create.mock.calls[0][0].labels.sort()).toEqual(['a', 'priority:medium', 'type:task']);
    expect(ref).toEqual({ id: '7', url: 'https://x/7' });
  });

  it('updateIssue requires platform_id', async () => {
    const adapter = new GitHubAdapter({ token: 't', owner: 'o', repo: 'r', octokit: fakeOctokit() });
    await expect(adapter.updateIssue(makeTask({ platform_id: null }))).rejects.toThrow(AdapterError);
  });

  it('updateIssue patches by issue_number', async () => {
    const update = vi.fn().mockResolvedValue({ data: { number: 9, html_url: 'https://x/9' } });
    const adapter = new GitHubAdapter({ token: 't', owner: 'o', repo: 'r', octokit: fakeOctokit({ update }) });
    const ref = await adapter.updateIssue(makeTask({ platform_id: '9' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 9 }));
    expect(ref).toEqual({ id: '9', url: 'https://x/9' });
  });

  it('listRemote skips pull requests', async () => {
    const list = vi.fn().mockResolvedValue({
      data: [
        { number: 1, title: 'a', state: 'open', html_url: 'u1' },
        { number: 2, title: 'pr', state: 'open', html_url: 'u2', pull_request: { url: 'p' } },
      ],
    });
    const adapter = new GitHubAdapter({ token: 't', owner: 'o', repo: 'r', octokit: fakeOctokit({ list }) });
    const items = await adapter.listRemote();
    expect(items).toEqual([{ id: '1', title: 'a', state: 'open', url: 'u1' }]);
  });

  it('wraps API errors', async () => {
    const create = vi.fn().mockRejectedValue(new Error('rate limited'));
    const adapter = new GitHubAdapter({ token: 't', owner: 'o', repo: 'r', octokit: fakeOctokit({ create }) });
    await expect(adapter.createIssue(makeTask())).rejects.toThrow(/\[github\]/);
  });
});
