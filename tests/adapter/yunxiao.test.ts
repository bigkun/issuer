import { describe, it, expect } from 'vitest';
import {
  workTypeToCategory,
  priorityToFieldValue,
  taskToCreateBody,
  taskToUpdateBody,
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
                { id: 'opt-critical', name: '致命', isDefault: false },
                { id: 'opt-high', name: '严重', isDefault: false },
                { id: 'opt-medium', name: '一般', isDefault: true },
                { id: 'opt-low', name: '建议', isDefault: false },
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

    const ref = await adapter.createIssue(makeTask({ type: WorkType.Bug, priority: Priority.High }));
    expect(ref.id).toBe('wi-new');
    expect(ref.url).toContain('wi-new');
  });

  it('createIssue throws on API error', async () => {
    const adapter = new YunxiaoAdapter({
      ...opts,
      fetch: mockFetch([
        // First call: getFieldConfig (for Bug type)
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

    await expect(adapter.createIssue(makeTask({ type: WorkType.Story }))).rejects.toThrow('createIssue failed');
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
});

// ---------------------------------------------------------------------------
// Dual edition support tests (Center vs Region)
// ---------------------------------------------------------------------------

describe('YunxiaoAdapter - Dual Edition Support', () => {
  const baseOpts = {
    token: 'test-pat',
    organizationId: 'org-abc',
    spaceIdentifierId: 'space-123',
    projectRoot: '/tmp/test-project',
    assignedTo: 'user-xyz',
    workitemTypeMap: { Req: 'type-req', Bug: 'type-bug', Task: 'type-task' },
  };

  function mockFetchWithUrlCapture(capturedUrls: string[], responses: Array<{ ok: boolean; json: unknown; status?: number }>) {
    let callIndex = 0;
    return async (url: string, init?: RequestInit) => {
      capturedUrls.push(url);
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

  it('uses center edition API paths by default', async () => {
    const capturedUrls: string[] = [];
    const adapter = new YunxiaoAdapter({
      token: 'test-pat',
      organizationId: 'org-abc',
      spaceIdentifierId: 'space-123',
      projectRoot: '/tmp/test-project',
      assignedTo: 'user-xyz',
      workitemTypeMap: { Req: 'type-req', Bug: 'type-bug', Task: 'type-task' },
      fetch: mockFetchWithUrlCapture(capturedUrls, [
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
                { id: 'opt-critical', name: '致命', isDefault: false },
                { id: 'opt-high', name: '严重', isDefault: false },
                { id: 'opt-medium', name: '一般', isDefault: true },
                { id: 'opt-low', name: '建议', isDefault: false },
              ],
            },
          ],
        },
        {
          ok: true,
          json: { id: 'wi-new' },
        },
      ]),
    });

    await adapter.createIssue(makeTask({ type: WorkType.Bug, priority: Priority.High }));

    // Verify center edition paths contain /organizations/{orgId}
    expect(capturedUrls[0]).toContain('/organizations/org-abc/projects/space-123/workitemTypes');
    expect(capturedUrls[1]).toContain('/organizations/org-abc/workitems');
  });

  it('uses region edition API paths when custom domain is provided', async () => {
    const capturedUrls: string[] = [];
    const adapter = new YunxiaoAdapter({
      token: 'test-pat',
      organizationId: 'default',
      spaceIdentifierId: 'space-123',
      projectRoot: '/tmp/test-project',
      assignedTo: 'user-xyz',
      workitemTypeMap: { Req: 'type-req', Bug: 'type-bug', Task: 'type-task' },
      domain: 'rdc.cn-hangzhou.aliyuncs.com', // Region edition domain
      fetch: mockFetchWithUrlCapture(capturedUrls, [
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
                { id: 'opt-critical', name: '致命', isDefault: false },
                { id: 'opt-high', name: '严重', isDefault: false },
                { id: 'opt-medium', name: '一般', isDefault: true },
                { id: 'opt-low', name: '建议', isDefault: false },
              ],
            },
          ],
        },
        {
          ok: true,
          json: { id: 'wi-new' },
        },
      ]),
    });

    await adapter.createIssue(makeTask({ type: WorkType.Bug, priority: Priority.High }));

    // Verify region edition paths do NOT contain /organizations/{orgId}
    expect(capturedUrls[0]).toContain('/projects/space-123/workitemTypes');
    expect(capturedUrls[0]).not.toContain('/organizations/');
    expect(capturedUrls[1]).toContain('/workitems');
    expect(capturedUrls[1]).not.toContain('/organizations/');
  });

  it('uses correct URL domain for region edition', async () => {
    const capturedUrls: string[] = [];
    const adapter = new YunxiaoAdapter({
      token: 'test-pat',
      organizationId: 'default',
      spaceIdentifierId: 'space-123',
      projectRoot: '/tmp/test-project',
      assignedTo: 'user-xyz',
      workitemTypeMap: { Req: 'type-req', Bug: 'type-bug', Task: 'type-task' },
      domain: 'rdc.cn-beijing.aliyuncs.com',
      fetch: mockFetchWithUrlCapture(capturedUrls, [
        {
          ok: true,
          json: [{ id: 'wi-1', subject: 'Item 1', status: { id: '28', displayName: '待处理' } }],
        },
        {
          ok: true,
          json: [],
        },
      ]),
    });

    await adapter.listRemote();

    // Verify the domain in URL
    expect(capturedUrls[0]).toContain('https://rdc.cn-beijing.aliyuncs.com/');
    expect(capturedUrls[0]).not.toContain('openapi-rdc.aliyuncs.com');
  });

  it('listRemote uses correct paths for both editions', async () => {
    // Center edition
    const centerUrls: string[] = [];
    const centerAdapter = new YunxiaoAdapter({
      ...baseOpts,
      fetch: mockFetchWithUrlCapture(centerUrls, [
        { ok: true, json: [] },
      ]),
    });
    await centerAdapter.listRemote();
    expect(centerUrls[0]).toContain('/organizations/org-abc/workitems:search');

    // Region edition
    const regionUrls: string[] = [];
    const regionAdapter = new YunxiaoAdapter({
      ...baseOpts,
      domain: 'rdc.cn-shanghai.aliyuncs.com',
      fetch: mockFetchWithUrlCapture(regionUrls, [
        { ok: true, json: [] },
      ]),
    });
    await regionAdapter.listRemote();
    expect(regionUrls[0]).toContain('/workitems:search');
    expect(regionUrls[0]).not.toContain('/organizations/');
  });

  it('updateIssue uses correct paths for both editions', async () => {
    // Center edition
    const centerUrls: string[] = [];
    const centerAdapter = new YunxiaoAdapter({
      ...baseOpts,
      fetch: mockFetchWithUrlCapture(centerUrls, [
        { ok: true, json: {} },
      ]),
    });
    await centerAdapter.updateIssue(makeTask({ platform_id: 'wi-123' }));
    expect(centerUrls[0]).toContain('/organizations/org-abc/workitems/wi-123');

    // Region edition
    const regionUrls: string[] = [];
    const regionAdapter = new YunxiaoAdapter({
      ...baseOpts,
      domain: 'rdc.cn-shenzhen.aliyuncs.com',
      fetch: mockFetchWithUrlCapture(regionUrls, [
        { ok: true, json: {} },
      ]),
    });
    await regionAdapter.updateIssue(makeTask({ platform_id: 'wi-123' }));
    expect(regionUrls[0]).toContain('/workitems/wi-123');
    expect(regionUrls[0]).not.toContain('/organizations/');
  });
});