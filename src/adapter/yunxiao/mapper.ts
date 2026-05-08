import { TaskFile, WorkType, Priority } from '../../core/types.js';
import { RemoteIssue } from '../interface.js';

// ---------------------------------------------------------------------------
// Category / workitemType mapping
// ---------------------------------------------------------------------------

/** Map issuer WorkType → 云效 category identifier. */
export function workTypeToCategory(type: WorkType): string {
  switch (type) {
    case WorkType.Bug:   return 'Bug';
    case WorkType.Story: return 'Req';
    case WorkType.Task:  return 'Task';
    case WorkType.Epic:  return 'Req'; // 云效无 Epic category，映射为 Req
    default:             return 'Task';
  }
}

/** Map issuer Priority → 云效 priority field value identifier. */
export function priorityToFieldValue(priority: Priority): string {
  switch (priority) {
    case Priority.Critical: return 'critical';
    case Priority.High:    return 'high';
    case Priority.Medium:  return 'medium';
    case Priority.Low:     return 'low';
    default:               return 'medium';
  }
}

// ---------------------------------------------------------------------------
// CreateWorkitem request body
// ---------------------------------------------------------------------------

export interface CreateWorkitemBody {
  subject: string;
  description?: string;
  descriptionFormat?: string;
  assignedTo?: string;
  space: string;
  spaceIdentifier: string;
  spaceType: string;
  category: string;
  workitemType?: string;
  parent?: string;
  fieldValueList?: Array<{
    fieldIdentifier: string;
    value: string;
  }>;
}

/** Convert a TaskFile to a CreateWorkitem request body. */
export function taskToCreateBody(
  task: TaskFile,
  spaceIdentifierId: string,
): CreateWorkitemBody {
  const body: CreateWorkitemBody = {
    subject: task.title,
    description: task.body,
    descriptionFormat: 'MARKDOWN',
    space: spaceIdentifierId,
    spaceIdentifier: spaceIdentifierId,
    spaceType: 'Project',
    category: workTypeToCategory(task.type),
    fieldValueList: [
      { fieldIdentifier: 'priority', value: priorityToFieldValue(task.priority) },
    ],
  };
  return body;
}

// ---------------------------------------------------------------------------
// UpdateWorkitem request body - 新版 API 格式
// ---------------------------------------------------------------------------

/** Build update body for a task (新版 API: {"fieldId":"value"} 格式). */
export function taskToUpdateBody(task: TaskFile): Record<string, string> {
  return {
    subject: task.title,
    description: task.body,
  };
}

// ---------------------------------------------------------------------------
// CreateWorkitemComment request body - 新版 API 格式
// ---------------------------------------------------------------------------

/** Build a comment body (新版 API). */
export function taskToCommentBody(
  workitemIdentifier: string,
  content: string,
): { content: string } {
  return { content };
}

// ---------------------------------------------------------------------------
// API response shapes - 新版 API 格式
// ---------------------------------------------------------------------------

export interface YunxiaoWorkitem {
  id: string;
  subject: string;
  description?: string;
  assignedTo?: { id: string; name: string };
  status?: { id: string; displayName: string };
  space?: { id: string; name: string };
  logicalStatus?: string;
  categoryId?: string;
  parentId?: string;
  workitemType?: { id: string; name: string };
  gmtCreate?: string;
  gmtModified?: string;
  creator?: { id: string; name: string };
  modifier?: { id: string; name: string };
  sprint?: { id: string; name: string };
  serialNumber?: string;
}

/** 新版 CreateWorkitem 返回 { id } */
export interface YunxiaoCreateResponse {
  id?: string;
  errorMsg?: string;
  errorCode?: string;
}

/** 新版 SearchWorkitems 返回数组 */
export type YunxiaoSearchResponse = YunxiaoWorkitem[];

/** 新版 CreateWorkitemComment 返回 { id } */
export interface YunxiaoCommentResponse {
  id?: string;
  errorMsg?: string;
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// YunxiaoWorkitem → RemoteIssue
// ---------------------------------------------------------------------------

/** Build the web URL for a work item. */
export function workitemUrl(organizationId: string, workitem: YunxiaoWorkitem): string {
  return `https://devops.aliyun.com/organization/${organizationId}/workitem/${workitem.id}`;
}

/** Convert a YunxiaoWorkitem to the generic RemoteIssue shape. */
export function workitemToRemote(
  organizationId: string,
  wi: YunxiaoWorkitem,
): RemoteIssue {
  return {
    id: wi.id,
    title: wi.subject,
    state: wi.status?.displayName ?? 'unknown',
    url: workitemUrl(organizationId, wi),
  };
}
