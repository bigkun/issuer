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
// UpdateWorkitem request body
// ---------------------------------------------------------------------------

export interface UpdateWorkitemField {
  identifier: string;
  propertyKey: string;
  propertyValue: string;
  fieldType: string;
}

/** Build update fields for a task (title + description). */
export function taskToUpdateFields(task: TaskFile): UpdateWorkitemField[] {
  const fields: UpdateWorkitemField[] = [
    {
      identifier: task.platform_id!,
      propertyKey: 'subject',
      propertyValue: task.title,
      fieldType: 'subject',
    },
    {
      identifier: task.platform_id!,
      propertyKey: 'description',
      propertyValue: task.body,
      fieldType: 'document',
    },
  ];
  return fields;
}

// ---------------------------------------------------------------------------
// CreateWorkitemComment request body
// ---------------------------------------------------------------------------

export interface CreateCommentBody {
  workitemIdentifier: string;
  content: string;
  formatType: string;
}

/** Build a comment body. */
export function taskToCommentBody(
  workitemIdentifier: string,
  content: string,
): CreateCommentBody {
  return {
    workitemIdentifier,
    content,
    formatType: 'MARKDOWN',
  };
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface YunxiaoWorkitem {
  identifier: string;
  subject: string;
  document?: string;
  assignedTo?: string;
  status?: string;
  statusStageIdentifier?: string;
  spaceIdentifier?: string;
  spaceName?: string;
  spaceType?: string;
  logicalStatus?: string;
  categoryIdentifier?: string;
  parentIdentifier?: string;
  workitemTypeIdentifier?: string;
  updateStatusAt?: number;
  serialNumber?: string;
  gmtCreate?: number;
  gmtModified?: number;
  creator?: string;
  modifier?: string;
  statusIdentifier?: string;
  sprintIdentifier?: string;
  documentFormat?: string;
}

export interface YunxiaoCreateResponse {
  requestId: string;
  success: boolean;
  errorCode?: string;
  errorMsg?: string;
  workitem?: YunxiaoWorkitem;
}

export interface YunxiaoUpdateResponse {
  requestId: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  workitem?: YunxiaoWorkitem;
}

export interface YunxiaoListResponse {
  requestId: string;
  success: boolean;
  errorCode?: string;
  errorMsg?: string;
  totalCount: number;
  nextToken: string;
  maxResults: number;
  workitems?: Array<{ workitem: YunxiaoWorkitem }>;
}

export interface YunxiaoCommentResponse {
  requestId: string;
  success: string;
  errorCode?: string;
  errorMsg?: string;
  Comment?: {
    Id: number;
    content: string;
  };
}

// ---------------------------------------------------------------------------
// YunxiaoWorkitem → RemoteIssue
// ---------------------------------------------------------------------------

/** Build the web URL for a work item. */
export function workitemUrl(organizationId: string, workitem: YunxiaoWorkitem): string {
  return `https://devops.aliyun.com/organization/${organizationId}/workitem/${workitem.identifier}`;
}

/** Convert a YunxiaoWorkitem to the generic RemoteIssue shape. */
export function workitemToRemote(
  organizationId: string,
  wi: YunxiaoWorkitem,
): RemoteIssue {
  return {
    id: wi.identifier,
    title: wi.subject,
    state: wi.status ?? 'unknown',
    url: workitemUrl(organizationId, wi),
  };
}
