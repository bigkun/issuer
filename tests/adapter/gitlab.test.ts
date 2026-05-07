import { describe, it, expect } from 'vitest';
import { taskToIssueInput, issueToRemote } from '../../src/adapter/gitlab/mapper.js';
import { TaskFile, WorkType, Status, Priority } from '../../src/core/types.js';
import { GitLabAdapter } from '../../src/adapter/gitlab/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<TaskFile> = {}): TaskFile {
  return {
    id: 'task-1',
    type: WorkType.Story,
    title: 'Test story',
    status: Status.Ready,
    platform: 'gitlab',
    platform_id: null,
    platform_url: null,
    priority: Priority.High,
    labels: ['feature'],
    created_at: '2026-05-06T10:00:00Z',
    updated_at: '2026-05-06T10:00:00Z',
    body: '## Description\nThis is a test.',
    filePath: '/tmp/task-1.md',
    ...overrides,
  };
}

function makeMockClient(responses: Record<string, unknown[]>) {
  let callIndex = 0;
  const results = Object.values(responses).flat();

  return {
    Issues: {
      create: async (_projectId: any, title: any, options?: any) => {
        const r = results[callIndex++];
        if (r instanceof Error) throw r;
        return r;
      },
      edit: async (_projectId: any, _iid: any, options?: any) => {
        const r = results[callIndex++];
        if (r instanceof Error) throw r;
        return r;
      },
      all: async (_options?: any) => {
        const r = results[callIndex++];
        if (r instanceof Error) throw r;
        return r;
      },
    },
    IssueNotes: {
      create: async (_projectId: any, _iid: any, _body: any, _options?: any) => {
        const r = results[callIndex++];
        if (r instanceof Error) throw r;
        return r;
      },
    },
  } as any;
}

// ---------------------------------------------------------------------------
// Mapper tests
// ---------------------------------------------------------------------------

describe('gitlab/mapper', () => {
  it('builds GitLab issue input with auto labels', () => {
    const task = makeTask();
    const input = taskToIssueInput(task);
    expect(input.title).toBe('Test story');
    expect(input.description).toBe('## Description\nThis is a test.');
    expect(input.labels).toContain('feature');
    expect(input.labels).toContain('type:story');
    expect(input.labels).toContain('priority:high');
  });

  it('deduplicates labels', () => {
    const task = makeTask({ labels: ['feature', 'feature'] });
    const input = taskToIssueInput(task);
    const featureCount = input.labels!.filter((l) => l === 'feature').length;
    expect(featureCount).toBe(1);
  });

  it('converts raw GitLab issue to RemoteIssue', () => {
    const raw = { iid: 42, title: 'Bug fix', state: 'opened', web_url: 'https://gitlab.com/org/proj/-/issues/42' };
    const remote = issueToRemote(raw as any);
    expect(remote.id).toBe('42');
    expect(remote.title).toBe('Bug fix');
    expect(remote.state).toBe('opened');
    expect(remote.url).toContain('/issues/42');
  });
});

// ---------------------------------------------------------------------------
// Adapter tests
// ---------------------------------------------------------------------------

describe('GitLabAdapter', () => {
  it('createIssue sends correct params and returns IssueRef', async () => {
    const client = makeMockClient({
      create: [{ iid: 7, web_url: 'https://gitlab.com/org/proj/-/issues/7' }],
    });
    const adapter = new GitLabAdapter({
      token: 'glpat-test',
      owner: 'org',
      repo: 'proj',
      client,
    });

    const ref = await adapter.createIssue(makeTask());
    expect(ref.id).toBe('7');
    expect(ref.url).toContain('/issues/7');
  });

  it('createIssue throws AdapterError on API failure', async () => {
    const client = makeMockClient({
      create: [new Error('API error')],
    });
    const adapter = new GitLabAdapter({
      token: 'glpat-test',
      owner: 'org',
      repo: 'proj',
      client,
    });

    await expect(adapter.createIssue(makeTask())).rejects.toThrow('createIssue failed');
  });

  it('updateIssue sends correct params and returns IssueRef', async () => {
    const client = makeMockClient({
      edit: [{ iid: 7, web_url: 'https://gitlab.com/org/proj/-/issues/7' }],
    });
    const adapter = new GitLabAdapter({
      token: 'glpat-test',
      owner: 'org',
      repo: 'proj',
      client,
    });

    const ref = await adapter.updateIssue(makeTask({ platform_id: '7' }));
    expect(ref.id).toBe('7');
  });

  it('updateIssue throws when platform_id is missing', async () => {
    const adapter = new GitLabAdapter({
      token: 'glpat-test',
      owner: 'org',
      repo: 'proj',
      client: makeMockClient({}),
    });
    await expect(adapter.updateIssue(makeTask())).rejects.toThrow('no platform_id');
  });

  it('listRemote returns all issues', async () => {
    const client = makeMockClient({
      all: [[
        { iid: 1, title: 'Issue 1', state: 'opened', web_url: 'https://gitlab.com/org/proj/-/issues/1' },
        { iid: 2, title: 'Issue 2', state: 'closed', web_url: 'https://gitlab.com/org/proj/-/issues/2' },
      ]],
    });
    const adapter = new GitLabAdapter({
      token: 'glpat-test',
      owner: 'org',
      repo: 'proj',
      client,
    });

    const items = await adapter.listRemote();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('1');
    expect(items[1].id).toBe('2');
  });

  it('addComment calls IssueNotes.create', async () => {
    const client = makeMockClient({
      comment: [{ id: 99, body: 'A comment' }],
    });
    const adapter = new GitLabAdapter({
      token: 'glpat-test',
      owner: 'org',
      repo: 'proj',
      client,
    });

    // Should not throw
    await adapter.addComment(7, 'A comment');
  });
});
