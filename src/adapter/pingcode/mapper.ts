/**
 * PingCode field mapping utilities
 * 
 * Maps between Issuer's internal types and PingCode API field formats.
 * Public cloud API root: https://open.pingcode.com
 */

import { Priority, WorkType } from '../../core/types';

/**
 * PingCode work item type IDs (public cloud)
 * These match the `id` field returned by GET /v1/project/work_item/types
 * @see https://open.pingcode.com/#api-获取工作项类型列表
 */
export const PINGCODE_WORKITEM_TYPES = {
  epic: 'epic',
  feature: 'feature',
  story: 'story',       // NOT 'user_story' - PingCode uses 'story' as the type_id
  task: 'task',
  bug: 'bug',
  issue: 'issue',      // 事务 (kanban/hybrid)
} as const;

/**
 * Map Issuer category to PingCode work item type code
 */
export function categoryToPingCodeType(category: WorkType): string {
  switch (category) {
    case WorkType.Epic:
      return PINGCODE_WORKITEM_TYPES.epic;
    case WorkType.Story:
      return PINGCODE_WORKITEM_TYPES.story;
    case WorkType.Task:
      return PINGCODE_WORKITEM_TYPES.task;
    case WorkType.Bug:
      return PINGCODE_WORKITEM_TYPES.bug;
    default:
      return PINGCODE_WORKITEM_TYPES.story;
  }
}

/**
 * Map PingCode work item type code back to Issuer category
 */
export function pingCodeTypeToCategory(typeCode: string): WorkType {
  switch (typeCode) {
    case 'epic':
      return WorkType.Epic;
    case 'story':
    case 'user_story':
      return WorkType.Story;
    case 'task':
      return WorkType.Task;
    case 'bug':
      return WorkType.Bug;
    case 'feature':
      return WorkType.Story;  // Map feature to story
    case 'issue':
      return WorkType.Task;   // Map issue (事务) to task
    default:
      return WorkType.Story;
  }
}

/**
 * PingCode priority values
 * @see https://pingcode.com/open-docs#tag/%E4%BC%98%E5%85%88%E7%BA%A7
 */
export const PINGCODE_PRIORITIES = {
  urgent: 'urgent',       // 紧急
  high: 'high',           // 高
  medium: 'medium',       // 中
  low: 'low',             // 低
} as const;

/**
 * Map Issuer priority to PingCode priority
 */
export function priorityToPingCode(priority: Priority | undefined): string {
  switch (priority) {
    case 'critical':
    case 'high':
      return PINGCODE_PRIORITIES.high;
    case 'medium':
      return PINGCODE_PRIORITIES.medium;
    case 'low':
      return PINGCODE_PRIORITIES.low;
    default:
      return PINGCODE_PRIORITIES.medium;
  }
}

/**
 * Map PingCode priority back to Issuer priority
 */
export function pingCodeToPriority(priorityCode: string): Priority | undefined {
  switch (priorityCode) {
    case 'urgent':
    case 'high':
      return Priority.High;
    case 'medium':
      return Priority.Medium;
    case 'low':
      return Priority.Low;
    default:
      return undefined;
  }
}

/**
 * Build PingCode create work item payload
 *
 * PingCode API field names (from official docs):
 * - project_id: required, project ID
 * - type_id: required, work item type identifier (e.g. "bug", "task", "user_story")
 * - title: required, work item title
 * - priority_id: optional, priority ID (needs lookup)
 * - assignee_id: optional, assignee user ID
 * - parent_id: optional, parent work item ID
 * - description: optional, work item description
 */
export function buildCreatePayload(issue: any): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: issue.title,
  };

  // Note: project_id and type_id are set by the adapter at runtime
  // (type_id requires lookup from project's work item type list)

  // Optional fields
  if (issue.body) {
    payload.description = issue.body;
  }

  if (issue.assignee) {
    payload.assignee_id = issue.assignee;
  }

  if (issue.parentId) {
    payload.parent_id = issue.parentId;
  }

  // Note: PingCode does not have a 'tags' or 'labels' field.
  // Labels are handled via properties or not supported directly.
  // Skip issue.labels for now.

  return payload;
}

/**
 * Build PingCode update work item payload
 *
 * Uses same field names as create API.
 */
export function buildUpdatePayload(updates: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (updates.title !== undefined) {
    payload.title = updates.title;
  }

  if (updates.description !== undefined) {
    payload.description = updates.description;
  }

  if (updates.assignee !== undefined) {
    payload.assignee_id = updates.assignee;
  }

  if (updates.status !== undefined) {
    payload.state_id = updates.status;
  }

  return payload;
}

/**
 * Normalize PingCode API response to Issuer issue format
 *
 * PingCode response fields:
 * - id, title, type_id, priority_id, state_id
 * - assignee_id, parent_id, description
 * - created_at, updated_at
 */
export function normalizePingCodeIssue(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: String(data.short_id || data.id || data.identifier || ''),
    title: String(data.title || data.name || ''),
    description: String(data.description || ''),
    category: pingCodeTypeToCategory(String(data.type_id || data.workitem_type || data.type || 'story')),
    status: data.state_id ? String(data.state_id) : (data.status ? String(data.status) : undefined),
    priority: data.priority_id ? String(data.priority_id) : undefined,
    assignee: data.assignee_id ? String(data.assignee_id) : (data.assignee ? String(data.assignee) : undefined),
    labels: [],  // PingCode does not have a direct labels/tags field
    parentId: data.parent_id ? String(data.parent_id) : (data.parent ? String(data.parent) : undefined),
    platformUrl: data.html_url ? String(data.html_url) : (data.url ? String(data.url) : undefined),
    createdAt: data.created_at ? String(data.created_at) : undefined,
    updatedAt: data.updated_at ? String(data.updated_at) : undefined,
  };
}
