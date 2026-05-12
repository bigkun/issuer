import { describe, it, expect } from 'vitest';
import {
  workTypeToCategory,
  priorityToFieldValue,
  taskToCreateBody,
  taskToUpdateBody,
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

  it('maps Priority to field value (P0-P3)', () => {
    expect(priorityToFieldValue(Priority.Critical)).toBe('P0');
    expect(priorityToFieldValue(Priority.High)).toBe('P1');
    expect(priorityToFieldValue(Priority.Medium)).toBe('P2');
    expect(priorityToFieldValue(Priority.Low)).toBe('P3');
  });

  it('builds CreateWorkitem body (新版 API 格式)', () => {
    const task = makeTask();
    const body = taskToCreateBody(task, 'space-123', 'type-abc', 'user-xyz');
    expect(body.subject).toBe('Test story');
    expect(body.description).toBe('## Description\nThis is a test.');
    expect(body.spaceId).toBe('space-123');
    expect(body.workitemTypeId).toBe('type-abc');
    expect(body.assignedTo).toBe('user-xyz');
    // Note: priority 字段暂不设置，需要 priorityId（UUID）而非 P0-P3
  });

  it('builds update body (新版 API 格式)', () => {
    const task = makeTask({ platform_id: 'wi-abc123' });
    const body = taskToUpdateBody(task);
    expect(body.subject).toBe('Test story');
    expect(body.description).toBe('## Description\nThis is a test.');
  });

  it('builds comment body (新版 API 格式)', () => {
    const body = taskToCommentBody('wi-123', 'Hello world');
    expect(body.content).toBe('Hello world');
  });

  it('converts workitem to RemoteIssue (新版 API 格式)', () => {
    const wi = {
      id: 'wi-xyz',
      subject: 'My item',
      status: { id: '28', displayName: '进行中' },
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
  function mockFetch(responses: Array<{ ok: boolean; json: unknown; status?: number }>) {
    let callIndex = 0;
    return async (url: string, init?: RequestInit) => {
      const resp = responses[callIndex++] ?? { ok: false, json: { success: false } };
      return {
        ok: resp.ok,
        status: resp.ok ? 200 : (resp.status ?? 400),
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
    projectRoot: '/tmp/test-project',
    assignedTo: 'user-xyz',
    workitemTypeMap: { Req: 'type-req', Bug: 'type-bug', Task: 'type-task' },
  };

  it('createIssue sends POST and returns IssueRef', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([
        // First call: getFieldConfig
        {
          ok: true,
          json: [
            {
              id: 'field-severity',
              name: '严重程度',
              identifier: 'severity',
              type: 'DROPDOWN',
              required: true,
              options: [
                { id: 'opt-1', name: '致命', isDefault: false },
                { id: 'opt-2', name: '严重', isDefault: true },
                { id: 'opt-3', name: '一般', isDefault: false },
              ],
            },
          ],
        },
        // Second call: createIssue
        {
          ok: true,
          json: { id: 'wi-new' },
        },
      ]),
    });

    const ref = await adapter.createIssue(makeTask());
    expect(ref.id).toBe('wi-new');
    expect(ref.url).toContain('wi-new');
  });

  it('createIssue throws on API error', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([
        // First call: getFieldConfig
        {
          ok: true,
          json: [],
        },
        // Second call: createIssue - error
        {
          ok: false,
          status: 400,
          json: { errorMsg: 'bad request', errorCode: 'Openapi.RequestError' },
        },
      ]),
    });

    await expect(adapter.createIssue(makeTask())).rejects.toThrow('HTTP 400');
  });

  it('updateIssue sends PUT and returns IssueRef', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([{
        ok: true,
        json: {},  // PUT 可能返回空
      }]),
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
          json: [
            { id: 'wi-1', subject: 'Item 1', status: { id: '28', displayName: '待处理' } },
          ],  // 新版 API 返回数组
        },
        {
          ok: true,
          json: [],  // 第二页空，结束
        },
      ]),
    });

    const items = await adapter.listRemote();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('wi-1');
  });

  it('addComment sends POST and succeeds', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([{
        ok: true,
        json: { id: 'comment-42' },  // 新版 API 返回 { id }
      }]),
    });

    await expect(adapter.addComment('wi-1', 'A comment')).resolves.toBeUndefined();
  });

  it('addComment throws on API error', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([{
        ok: true,
        json: { errorMsg: 'no perm', errorCode: 'Openapi.RequestError' },
      }]),
    });

    await expect(adapter.addComment('wi-1', 'fail')).rejects.toThrow('addComment failed');
  });
});