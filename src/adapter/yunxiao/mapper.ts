import { TaskFile, WorkType, Priority } from '../../core/types.js';
import { RemoteIssue } from '../interface.js';
import type { WorkitemTypeMap } from '../../core/config.js';

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

/** Map issuer Priority → 云效 priority field value (P0-P3). */
export function priorityToFieldValue(priority: Priority): string {
  switch (priority) {
    case Priority.Critical: return 'P0'; // 紧急/阻塞
    case Priority.High:    return 'P1'; // 高优先级
    case Priority.Medium:  return 'P2'; // 中优先级
    case Priority.Low:     return 'P3'; // 低优先级
    default:               return 'P2'; // 默认中优先级
  }
}

// ---------------------------------------------------------------------------
// CreateWorkitem request body - 新版 API 格式
// ---------------------------------------------------------------------------

export interface CreateWorkitemBody {
  subject: string;
  spaceId: string;
  workitemTypeId: string;
  assignedTo: string;
  description?: string;
  formatType?: 'RICHTEXT' | 'MARKDOWN';
  /** Custom field values in format { fieldId: fieldValue } */
  customFieldValues?: Record<string, string>;
}

/** Convert a TaskFile to a CreateWorkitem request body. */
export function taskToCreateBody(
  task: TaskFile,
  spaceId: string,
  workitemTypeId: string,
  assignedTo: string,
): CreateWorkitemBody {
  const body: CreateWorkitemBody = {
    subject: task.title,
    spaceId,
    workitemTypeId,
    assignedTo,
    description: task.body,
    formatType: 'MARKDOWN',
  };
  // Note: priority 字段需要传递 priorityId（UUID），而非 P0-P3 字符串
  // 需要通过 getWorkItemTypeFieldConfig 接口获取字段配置，找到对应优先级的 ID
  // 暂不设置 priority，使用云效默认值
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

/** GetUserByToken 返回用户信息 */
export interface YunxiaoUserResponse {
  id?: string;
  name?: string;
  username?: string;
  email?: string;
}

/** ListWorkitemTypes 返回的工作项类型 */
export interface YunxiaoWorkitemType {
  id: string;
  name: string;
  nameEn?: string;
  categoryId: string;  // Req, Bug, Task
  defaultType: boolean;
  enable: boolean;
  systemDefault?: boolean;
  description?: string;
}

/** 字段配置中的选项 */
export interface FieldOption {
  id: string;
  name: string;
  value?: string;
  isDefault?: boolean;
}

/** 字段配置 */
export interface FieldConfig {
  id: string;
  name: string;
  identifier: string;  // 字段标识符，如 'severity', 'priority'
  type: string;  // 'STRING', 'DROPDOWN', 'MULTI_SELECT' 等
  required: boolean;
  options?: FieldOption[];
}

/** 获取工作项类型字段配置的返回 */
export type FieldConfigResponse = FieldConfig[];

// WorkitemTypeMap moved to core/config.ts for unified config management

// ---------------------------------------------------------------------------
// WorkType → workitemTypeId matching
// ---------------------------------------------------------------------------

/**
 * Match a workitemType from a list for the given category.
 * Priority: defaultType=true → systemDefault=true → first enabled.
 */
export function matchWorkitemType(
  types: YunxiaoWorkitemType[],
  categoryId: string,
): YunxiaoWorkitemType | null {
  // enable: null 视为启用（API 返回 null 表示默认启用）
  const candidates = types.filter(t => t.categoryId === categoryId && t.enable !== false);
  if (candidates.length === 0) return null;

  // Priority 1: defaultType=true
  const defaultType = candidates.find(t => t.defaultType === true);
  if (defaultType) return defaultType;

  // Priority 2: systemDefault=true
  const systemDefault = candidates.find(t => t.systemDefault === true);
  if (systemDefault) return systemDefault;

  // Priority 3: first candidate
  return candidates[0];
}

/** Build a WorkitemTypeMap from a list of YunxiaoWorkitemType. */
export function buildTypeMap(types: YunxiaoWorkitemType[]): WorkitemTypeMap {
  const map: WorkitemTypeMap = {};
  for (const category of ['Req', 'Bug', 'Task'] as const) {
    const matched = matchWorkitemType(types, category);
    if (matched) map[category] = matched.id;
  }
  return map;
}

/**
 * Find the default value for a required field by its identifier.
 * Returns the default option ID, or the first option ID if no default.
 */
export function findRequiredFieldDefault(
  fields: FieldConfig[],
  fieldIdentifier: string,
): string | null {
  const field = fields.find(f => f.identifier === fieldIdentifier);
  if (!field || !field.options || field.options.length === 0) {
    return null;
  }

  // Try to find default option
  const defaultOption = field.options.find(opt => opt.isDefault);
  if (defaultOption) return defaultOption.id;

  // Fallback to first option
  return field.options[0].id;
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
    type: wi.categoryId ? categoryIdToType(wi.categoryId) : undefined,
  };
}

/** Map 云效 categoryId to issuer work item type. */
function categoryIdToType(categoryId: string): string | undefined {
  switch (categoryId) {
    case 'Bug':
      return 'bug';
    case 'Req':
      return 'story';
    case 'Task':
      return 'task';
    default:
      return undefined;
  }
}
