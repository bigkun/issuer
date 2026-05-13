/**
 * PingCode field mapping utilities
 * 
 * Maps between Issuer's internal types and PingCode API field formats.
 * Public cloud API root: https://open.pingcode.com
 */

import { Priority, WorkType } from '../../core/types';

/**
 * PingCode work item type codes (public cloud)
 * @see https://pingcode.com/open-docs#tag/%E5%B7%A5%E4%BD%9C%E9%A1%B9%E7%B1%BB%E5%9E%8B
 */
export const PINGCODE_WORKITEM_TYPES = {
  epic: 'epic',
  feature: 'feature',
  story: 'user_story',
  task: 'task',
  bug: 'bug',
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
    case 'user_story':
    case 'story':
      return WorkType.Story;
    case 'task':
      return WorkType.Task;
    case 'bug':
      return WorkType.Bug;
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
 */
export function buildCreatePayload(issue: any): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: issue.title,
    workitem_type: categoryToPingCodeType(issue.category),
    priority: priorityToPingCode(issue.priority),
  };

  // Optional fields
  if (issue.body) {
    payload.description = issue.body;
  }

  if (issue.assignee) {
    payload.assignee = issue.assignee;
  }

  if (issue.labels && issue.labels.length > 0) {
    payload.tags = issue.labels;
  }

  if (issue.parentId) {
    payload.parent = issue.parentId;
  }

  return payload;
}

/**
 * Build PingCode update work item payload
 */
export function buildUpdatePayload(updates: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (updates.title !== undefined) {
    payload.name = updates.title;
  }

  if (updates.description !== undefined) {
    payload.description = updates.description;
  }

  if (updates.priority !== undefined) {
    payload.priority = priorityToPingCode(updates.priority as Priority);
  }

  if (updates.assignee !== undefined) {
    payload.assignee = updates.assignee;
  }

  if (updates.status !== undefined) {
    payload.status = updates.status;
  }

  if (updates.labels !== undefined) {
    payload.tags = updates.labels;
  }

  return payload;
}

/**
 * Normalize PingCode API response to Issuer issue format
 */
export function normalizePingCodeIssue(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: String(data.id || data.identifier || ''),
    title: String(data.name || data.title || ''),
    description: String(data.description || ''),
    category: pingCodeTypeToCategory(String(data.workitem_type || data.type || 'story')),
    status: data.status ? String(data.status) : undefined,
    priority: pingCodeToPriority(String(data.priority || '')),
    assignee: data.assignee ? String(data.assignee) : undefined,
    labels: Array.isArray(data.tags) ? data.tags : [],
    parentId: data.parent ? String(data.parent) : undefined,
    platformUrl: data.url ? String(data.url) : undefined,
    createdAt: data.created_at ? String(data.created_at) : undefined,
    updatedAt: data.updated_at ? String(data.updated_at) : undefined,
  };
}
