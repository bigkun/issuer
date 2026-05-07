import { describe, it, expect } from 'vitest';
import {
  workTypeToCategory,
  priorityToFieldValue,
  taskToCreateBody,
  taskToUpdateFields,
  taskToCommentBody,
  workitemToRemote,
} from '../../src/adapter/yunxiao/mapper.js';
import { TaskFile, WorkType, Status, Priority } from '../../src/core/types.js';
import { YunxiaoAdapter } from '../../src/adapter/yunxiao/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<TaskFile> = {}): TaskFile {
  return {
    id: 'task-1',
    type: WorkType.Story,
    title: 'Test story',
    status: Status.Ready,
    platform: 'yunxiao',
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

// ---------------------------------------------------------------------------
// Mapper tests
// ---------------------------------------------------------------------------

describe('yunxiao/mapper', () => {
  it('maps WorkType to 云效 category', () => {
    expect(workTypeToCategory(WorkType.Bug)).toBe('Bug');
    expect(workTypeToCategory(WorkType.Story)).toBe('Req');
    expect(workTypeToCategory(WorkType.Task)).toBe('Task');
    expect(workTypeToCategory(WorkType.Epic)).toBe('Req');
  });

  it('maps Priority to field value', () => {
    expect(priorityToFieldValue(Priority.Critical)).toBe('critical');
    expect(priorityToFieldValue(Priority.High)).toBe('high');
    expect(priorityToFieldValue(Priority.Medium)).toBe('medium');
    expect(priorityToFieldValue(Priority.Low)).toBe('low');
  });

  it('builds CreateWorkitem body', () => {
    const task = makeTask();
    const body = taskToCreateBody(task, 'space-123');
    expect(body.subject).toBe('Test story');
    expect(body.description).toBe('## Description\nThis is a test.');
    expect(body.descriptionFormat).toBe('MARKDOWN');
    expect(body.spaceIdentifier).toBe('space-123');
    expect(body.category).toBe('Req');
    expect(body.fieldValueList).toHaveLength(1);
    expect(body.fieldValueList![0].fieldIdentifier).toBe('priority');
    expect(body.fieldValueList![0].value).toBe('high');
  });

  it('builds update fields for title and description', () => {
    const task = makeTask({ platform_id: 'wi-abc123' });
    const fields = taskToUpdateFields(task);
    expect(fields).toHaveLength(2);
    expect(fields[0].propertyKey).toBe('subject');
    expect(fields[0].propertyValue).toBe('Test story');
    expect(fields[0].fieldType).toBe('subject');
    expect(fields[1].propertyKey).toBe('description');
    expect(fields[1].fieldType).toBe('document');
  });

  it('builds comment body', () => {
    const body = taskToCommentBody('wi-123', 'Hello world');
    expect(body.workitemIdentifier).toBe('wi-123');
    expect(body.content).toBe('Hello world');
    expect(body.formatType).toBe('MARKDOWN');
  });

  it('converts workitem to RemoteIssue', () => {
    const wi = {
      identifier: 'wi-xyz',
      subject: 'My item',
      status: '进行中',
    };
    const remote = workitemToRemote('org-123', wi as any);
    expect(remote.id).toBe('wi-xyz');
    expect(remote.title).toBe('My item');
    expect(remote.state).toBe('进行中');
    expect(remote.url).toContain('org-123');
    expect(remote.url).toContain('wi-xyz');
  });
});

// ---------------------------------------------------------------------------
// Adapter integration tests (with mock fetch)
// ---------------------------------------------------------------------------

describe('YunxiaoAdapter', () => {
  function mockFetch(responses: Array<{ ok: boolean; json: unknown }>) {
    let callIndex = 0;
    return async (url: string, init?: RequestInit) => {
      const resp = responses[callIndex++] ?? { ok: false, json: { success: false } };
      return {
        ok: resp.ok,
        status: resp.ok ? 200 : 400,
        statusText: resp.ok ? 'OK' : 'Bad Request',
        json: async () => resp.json,
        text: async () => JSON.stringify(resp.json),
      } as any;
    };
  }

  const opts = {
    token: 'test-pat',
    organizationId: 'org-abc',
    spaceIdentifierId: 'space-123',
  };

  it('createIssue sends POST and returns IssueRef', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([{
        ok: true,
        json: {
          success: true,
          requestId: 'req-1',
          workitem: { identifier: 'wi-new', subject: 'Test story' },
        },
      }]),
    });

    const ref = await adapter.createIssue(makeTask());
    expect(ref.id).toBe('wi-new');
    expect(ref.url).toContain('wi-new');
  });

  it('createIssue throws on API error', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([{
        ok: true,
        json: { success: false, errorCode: 'Openapi.RequestError', errorMsg: 'bad request' },
      }]),
    });

    await expect(adapter.createIssue(makeTask())).rejects.toThrow('createIssue failed');
  });

  it('updateIssue sends POST for each field and returns IssueRef', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([
        { ok: true, json: { success: true, requestId: 'req-2', workitem: { identifier: 'wi-old' } } },
        { ok: true, json: { success: true, requestId: 'req-3', workitem: { identifier: 'wi-old' } } },
      ]),
    });

    const ref = await adapter.updateIssue(makeTask({ platform_id: 'wi-old' }));
    expect(ref.id).toBe('wi-old');
  });

  it('updateIssue throws when platform_id is missing', async () => {
    const adapter = new YunxiaoAdapter({ ...opts, fetch: mockFetch([]) });
    await expect(adapter.updateIssue(makeTask())).rejects.toThrow('no platform_id');
  });

  it('listRemote paginates through results', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([
        {
          ok: true,
          json: {
            success: true,
            requestId: 'req-4',
            totalCount: 2,
            nextToken: 'page2',
            maxResults: 1,
            workitems: [{ workitem: { identifier: 'wi-1', subject: 'Item 1', status: '待处理' } }],
          },
        },
        {
          ok: true,
          json: {
            success: true,
            requestId: 'req-5',
            totalCount: 2,
            nextToken: '',
            maxResults: 1,
            workitems: [{ workitem: { identifier: 'wi-2', subject: 'Item 2', status: '已完成' } }],
          },
        },
      ]),
    });

    const items = await adapter.listRemote();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('wi-1');
    expect(items[1].id).toBe('wi-2');
  });

  it('addComment sends POST and succeeds', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([{
        ok: true,
        json: {
          success: 'true',
          requestId: 'req-6',
          Comment: { Id: 42, content: 'note' },
        },
      }]),
    });

    await expect(adapter.addComment('wi-1', 'A comment')).resolves.toBeUndefined();
  });

  it('addComment throws on API error', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([{
        ok: true,
        json: { success: 'false', errorCode: 'Openapi.RequestError', errorMsg: 'no perm' },
      }]),
    });

    await expect(adapter.addComment('wi-1', 'fail')).rejects.toThrow('addComment failed');
  });
});
