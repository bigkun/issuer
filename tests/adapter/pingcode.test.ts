import { describe, it, expect } from 'vitest';
import {
  categoryToPingCodeType,
  pingCodeTypeToCategory,
  priorityToPingCode,
  pingCodeToPriority,
  buildCreatePayload,
  buildUpdatePayload,
  normalizePingCodeIssue,
} from '../../src/adapter/pingcode/mapper.js';
import { TaskFile, WorkType, Status, Priority } from '../../src/core/types.js';
import { PingCodeAdapter } from '../../src/adapter/pingcode/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<TaskFile> = {}): TaskFile {
  return {
    id: 'task-1',
    type: WorkType.Story,
    title: 'Test story',
    status: Status.Ready,
    platform: 'pingcode',
    platform_id: null,
    platform_url: null,
    priority: Priority.High,
    labels: ['feature'],
    created_at: '2026-05-06T10:00:00Z',
    updated_at: '2026-05-06T10:00:00Z',
    body: `## Description
This is a test.`,  // Use template literal with actual newline
    filePath: '/tmp/task-1.md',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mapper tests
// ---------------------------------------------------------------------------

describe('pingcode/mapper', () => {
  describe('categoryToPingCodeType', () => {
    it('maps WorkType.Epic to epic', () => {
      expect(categoryToPingCodeType(WorkType.Epic)).toBe('epic');
    });

    it('maps WorkType.Story to story', () => {
      expect(categoryToPingCodeType(WorkType.Story)).toBe('story');
    });

    it('maps WorkType.Task to task', () => {
      expect(categoryToPingCodeType(WorkType.Task)).toBe('task');
    });

    it('maps WorkType.Bug to bug', () => {
      expect(categoryToPingCodeType(WorkType.Bug)).toBe('bug');
    });
  });

  describe('pingCodeTypeToCategory', () => {
    it('maps epic to WorkType.Epic', () => {
      expect(pingCodeTypeToCategory('epic')).toBe(WorkType.Epic);
    });

    it('maps user_story to WorkType.Story', () => {
      expect(pingCodeTypeToCategory('user_story')).toBe(WorkType.Story);
    });

    it('maps story to WorkType.Story', () => {
      expect(pingCodeTypeToCategory('story')).toBe(WorkType.Story);
    });

    it('maps task to WorkType.Task', () => {
      expect(pingCodeTypeToCategory('task')).toBe(WorkType.Task);
    });

    it('maps bug to WorkType.Bug', () => {
      expect(pingCodeTypeToCategory('bug')).toBe(WorkType.Bug);
    });

    it('maps unknown type to WorkType.Story', () => {
      expect(pingCodeTypeToCategory('unknown')).toBe(WorkType.Story);
    });
  });

  describe('priorityToPingCode', () => {
    it('maps critical/high to high', () => {
      expect(priorityToPingCode(Priority.Critical)).toBe('high');
      expect(priorityToPingCode(Priority.High)).toBe('high');
    });

    it('maps medium to medium', () => {
      expect(priorityToPingCode(Priority.Medium)).toBe('medium');
    });

    it('maps low to low', () => {
      expect(priorityToPingCode(Priority.Low)).toBe('low');
    });

    it('maps undefined to medium', () => {
      expect(priorityToPingCode(undefined)).toBe('medium');
    });
  });

  describe('pingCodeToPriority', () => {
    it('maps urgent/high to Priority.High', () => {
      expect(pingCodeToPriority('urgent')).toBe(Priority.High);
      expect(pingCodeToPriority('high')).toBe(Priority.High);
    });

    it('maps medium to Priority.Medium', () => {
      expect(pingCodeToPriority('medium')).toBe(Priority.Medium);
    });

    it('maps low to Priority.Low', () => {
      expect(pingCodeToPriority('low')).toBe(Priority.Low);
    });

    it('maps unknown to undefined', () => {
      expect(pingCodeToPriority('unknown')).toBeUndefined();
    });
  });

  describe('buildCreatePayload', () => {
    it('builds create payload with required fields', () => {
      const task = makeTask();
      const payload = buildCreatePayload(task);

      expect(payload.title).toBe('Test story');
      // type_id is set by adapter at runtime via resolveTypeId()
    });

    it('converts Markdown description to HTML', () => {
      const task = makeTask();
      const payload = buildCreatePayload(task);

      // Markdown should be converted to HTML, plain text wrapped in <p>, no newlines
      expect(payload.description).toBe('<h2>Description</h2><p>This is a test.</p>');
    });

    it('does not include tags (PingCode has no tags field)', () => {
      const task = makeTask();
      const payload = buildCreatePayload(task);

      expect(payload.tags).toBeUndefined();
    });

    it('includes parentId if present', () => {
      const task = makeTask({ platform_id: 'parent-123' });
      const payload = buildCreatePayload({ ...task, parentId: 'parent-123' });

      expect(payload.parent_id).toBe('parent-123');
    });
  });

  describe('buildUpdatePayload', () => {
    it('builds update payload with title', () => {
      const payload = buildUpdatePayload({ title: 'Updated title' });

      expect(payload.title).toBe('Updated title');
    });

    it('builds update payload with description', () => {
      const payload = buildUpdatePayload({ description: 'Updated desc' });

      expect(payload.description).toBe('Updated desc');
    });

    it('builds update payload with assignee_id', () => {
      const payload = buildUpdatePayload({ assignee: 'user-123' });

      expect(payload.assignee_id).toBe('user-123');
    });

    it('builds update payload with state_id for status', () => {
      const payload = buildUpdatePayload({ status: 'done' });

      expect(payload.state_id).toBe('done');
    });
  });

  describe('normalizePingCodeIssue', () => {
    it('normalizes API response to Issuer format', () => {
      const data = {
        id: 'wi-123',
        title: 'Test work item',
        description: 'Some description',
        type_id: 'user_story',
        state_id: 'in_progress',
        priority_id: 'priority-high',
        assignee_id: 'user-1',
        url: 'https://pingcode.com/workitems/wi-123',
        created_at: '2026-05-06T10:00:00Z',
        updated_at: '2026-05-06T11:00:00Z',
      };

      const normalized = normalizePingCodeIssue(data);

      expect(normalized.id).toBe('wi-123');
      expect(normalized.title).toBe('Test work item');
      expect(normalized.description).toBe('Some description');
      expect(normalized.category).toBe(WorkType.Story);
      expect(normalized.status).toBe('in_progress');
      expect(normalized.priority).toBe('priority-high');
      expect(normalized.labels).toEqual([]);  // PingCode has no tags field
      expect(normalized.platformUrl).toBe('https://pingcode.com/workitems/wi-123');
    });

    it('handles missing optional fields', () => {
      const data = {
        id: 'wi-456',
        title: 'Minimal item',
      };

      const normalized = normalizePingCodeIssue(data);

      expect(normalized.id).toBe('wi-456');
      expect(normalized.title).toBe('Minimal item');
      expect(normalized.description).toBe('');
      expect(normalized.category).toBe(WorkType.Story);
      expect(normalized.priority).toBeUndefined();
      expect(normalized.labels).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Adapter tests (with mock fetch)
// ---------------------------------------------------------------------------

describe('PingCodeAdapter', () => {
  function mockFetch(responses: Array<{ ok: boolean; json: unknown; status?: number }>) {
    let callIndex = 0;
    return async (url: string, init?: RequestInit) => {
      const response = responses[callIndex++];
      return {
        ok: response.ok,
        status: response.status || 200,
        statusText: response.ok ? 'OK' : 'Error',
        json: async () => response.json,
        text: async () => JSON.stringify(response.json),
      };
    };
  }

  it('creates an issue', async () => {
    const mockProjectList = {
      list: [
        { id: 'project-123', identifier: 'SCR', name: 'Test Project', url: 'https://open.pingcode.com/v1/project/projects/project-123' }
      ]
    };
    
    const mockWorkItemTypes = {
      values: [
        { id: 'epic', name: '史诗', group: 'requirement' },
        { id: 'feature', name: '特性', group: 'requirement' },
        { id: 'story', name: '用户故事', group: 'requirement' },
        { id: 'task', name: '任务', group: 'task' },
        { id: 'bug', name: '缺陷', group: 'bug' },
      ]
    };

    const mockResponse = {
      id: 'wi-new-123',
      url: 'https://open.pingcode.com/v1/project/work_items/wi-new-123',
    };

    const adapter = new PingCodeAdapter({
      token: 'test-token',
      projectIdentifier: 'SCR',
      projectRoot: '/tmp',
      fetch: mockFetch([
        { ok: true, json: mockProjectList },   // Project lookup
        { ok: true, json: mockWorkItemTypes }, // Work item types lookup
        { ok: true, json: mockResponse }        // Create issue
      ]),
    });

    const task = makeTask();
    const result = await adapter.createIssue(task);

    expect(result.id).toBe('wi-new-123');
    expect(result.url).toBe('https://open.pingcode.com/v1/project/work_items/wi-new-123');
  });

  it('updates an issue', async () => {
    const adapter = new PingCodeAdapter({
      token: 'test-token',
      projectIdentifier: 'SCR',
      projectRoot: '/tmp',
      fetch: mockFetch([{ ok: true, json: {} }]),
    });

    const task = makeTask({ platform_id: 'wi-existing-123' });
    const result = await adapter.updateIssue(task);

    expect(result.id).toBe('wi-existing-123');
    expect(result.url).toBe('https://open.pingcode.com/v1/project/work_items/wi-existing-123');
  });

  it('throws error if update without platform_id', async () => {
    const adapter = new PingCodeAdapter({
      token: 'test-token',
      projectIdentifier: 'SCR',
      projectRoot: '/tmp',
      fetch: mockFetch([]),
    });

    const task = makeTask({ platform_id: null });

    await expect(adapter.updateIssue(task)).rejects.toThrow('platform_id');
  });

  it('gets an issue', async () => {
    const mockIssue = {
      id: 'wi-789',
      title: 'Get test',
      type_id: 'task',
      state_id: 'done',
      priority_id: 'priority-medium',
    };

    const adapter = new PingCodeAdapter({
      token: 'test-token',
      projectIdentifier: 'SCR',
      projectRoot: '/tmp',
      fetch: mockFetch([{ ok: true, json: mockIssue }]),
    });

    const issue = await adapter.getIssue('wi-789');

    expect(issue).not.toBeNull();
    expect(issue!.id).toBe('wi-789');
    expect(issue!.title).toBe('Get test');
    expect(issue!.state).toBe('done');
    expect(issue!.type).toBe('task');
  });

  it('returns null for non-existent issue', async () => {
    const adapter = new PingCodeAdapter({
      token: 'test-token',
      projectIdentifier: 'SCR',
      projectRoot: '/tmp',
      fetch: mockFetch([{ ok: false, json: {}, status: 404 }]),
    });

    const issue = await adapter.getIssue('wi-nonexistent');

    expect(issue).toBeNull();
  });

  it('lists remote issues', async () => {
    const mockProjectList = {
      list: [
        { id: 'project-123', identifier: 'SCR', name: 'Test Project', url: 'https://open.pingcode.com/v1/project/projects/project-123' }
      ]
    };
    
    const mockList = {
      list: [
        { id: 'wi-1', title: 'Issue 1', type_id: 'story' },
        { id: 'wi-2', title: 'Issue 2', type_id: 'bug' },
      ],
      total: 2,
    };

    const adapter = new PingCodeAdapter({
      token: 'test-token',
      projectIdentifier: 'SCR',
      projectRoot: '/tmp',
      fetch: mockFetch([
        { ok: true, json: mockProjectList },  // Project lookup
        { ok: true, json: mockList }           // List issues
      ]),
    });

    const issues = await adapter.listRemote();

    expect(issues).toHaveLength(2);
    expect(issues[0].id).toBe('wi-1');
    expect(issues[1].id).toBe('wi-2');
  });

  it('lists remote issues with filters', async () => {
    const mockProjectList = {
      list: [
        { id: 'project-123', identifier: 'SCR', name: 'Test Project', url: 'https://open.pingcode.com/v1/project/projects/project-123' }
      ]
    };
    
    const mockList = {
      list: [
        { id: 'wi-1', name: 'Search result', workitem_type: 'story' },
      ],
      total: 1,
    };

    const adapter = new PingCodeAdapter({
      token: 'test-token',
      projectIdentifier: 'SCR',
      projectRoot: '/tmp',
      fetch: mockFetch([
        { ok: true, json: mockProjectList },  // Project lookup
        { ok: true, json: mockList }           // List issues
      ]),
    });

    const issues = await adapter.listRemote({
      category: 'story',
      title: 'Search result',
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe('Search result');
  });
});
