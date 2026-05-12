import { TaskFile } from '../../core/types.js';
import { Adapter, IssueRef, RemoteIssue } from '../interface.js';
import { AdapterError } from '../../core/errors.js';
import { saveProjectConfig, type WorkitemTypeMap } from '../../core/config.js';
import {
  taskToCreateBody,
  taskToUpdateBody,
  workitemToRemote,
  workTypeToCategory,
  matchWorkitemType,
  buildTypeMap,
  findRequiredFieldDefault,
  YunxiaoCreateResponse,
  YunxiaoSearchResponse,
  YunxiaoCommentResponse,
  YunxiaoUserResponse,
  YunxiaoWorkitemType,
  FieldConfigResponse,
} from './mapper.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface YunxiaoAdapterOptions {
  /** Personal access token (PAT) for 云效 OpenAPI. */
  token: string;
  /** Organization ID (organizationId). */
  organizationId: string;
  /** Space identifier ID (project ID / spaceIdentifierId). */
  spaceIdentifierId: string;
  /** Project root path for saving config updates. */
  projectRoot: string;
  /** Default assignedTo userId (optional, auto-fetched if not set). */
  assignedTo?: string;
  /** Workitem type mapping (optional, auto-fetched if not set). */
  workitemTypeMap?: WorkitemTypeMap;
  /** API domain — defaults to `openapi-rdc.aliyuncs.com`. */
  domain?: string;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof globalThis.fetch | ((...args: any[]) => Promise<any>);
}

// ---------------------------------------------------------------------------
// Constants - 使用新版 API (oapi/v1/projex)
// ---------------------------------------------------------------------------

const DEFAULT_DOMAIN = 'openapi-rdc.aliyuncs.com';

export class YunxiaoAdapter implements Adapter {
  readonly name = 'yunxiao';
  private readonly token: string;
  private readonly organizationId: string;
  private readonly spaceIdentifierId: string;
  private readonly projectRoot: string;
  private assignedTo?: string;
  private workitemTypeMap?: WorkitemTypeMap;
  /** Cache of workitemTypeId → field configs */
  private fieldConfigCache = new Map<string, FieldConfigResponse>();
  private readonly domain: string;
  private readonly httpFetch: (...args: any[]) => Promise<any>;

  constructor(opts: YunxiaoAdapterOptions) {
    this.token = opts.token;
    this.organizationId = opts.organizationId;
    this.spaceIdentifierId = opts.spaceIdentifierId;
    this.projectRoot = opts.projectRoot;
    this.assignedTo = opts.assignedTo;
    this.workitemTypeMap = opts.workitemTypeMap;
    this.domain = opts.domain ?? DEFAULT_DOMAIN;
    this.httpFetch = (opts.fetch ?? globalThis.fetch) as (...args: any[]) => Promise<any>;
  }

  // -----------------------------------------------------------------------
  // Type mapping management
  // -----------------------------------------------------------------------

  /** Set assignedTo (used after auto-fetch). */
  setAssignedTo(userId: string): void {
    this.assignedTo = userId;
  }

  /** Set workitemTypeMap (used after auto-fetch). */
  setWorkitemTypeMap(map: WorkitemTypeMap): void {
    this.workitemTypeMap = map;
  }

  /** List workitem types for a specific category (project-level API).
   * Note: API requires 'category' (singular) parameter, not 'categories'.
   */
  async listWorkitemTypes(category?: string): Promise<YunxiaoWorkitemType[]> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const path = `/organizations/${this.organizationId}/projects/${this.spaceIdentifierId}/workitemTypes${query}`;
    return this.request<YunxiaoWorkitemType[]>('GET', path);
  }

  /** List all workitem types by fetching each category separately. */
  async listAllWorkitemTypes(): Promise<YunxiaoWorkitemType[]> {
    const categories = ['Req', 'Bug', 'Task'];
    const results = await Promise.all(
      categories.map(cat => this.listWorkitemTypes(cat).catch(() => [] as YunxiaoWorkitemType[]))
    );
    return results.flat();
  }

  /**
   * Ensure assignedTo is set (auto-fetch if needed).
   * Returns true if already set or fetched successfully.
   */
  private async ensureAssignedTo(): Promise<string> {
    if (this.assignedTo) return this.assignedTo;

    console.log('Fetching current user from 云效...');
    const user = await this.getCurrentUser();
    this.assignedTo = user.id;
    saveProjectConfig(this.projectRoot, { assigned_to: user.id });
    console.log(`  → Saved assigned_to: ${user.id} (${user.name})`);
    return user.id;
  }

  /**
   * Ensure workitemTypeMap has the required category (auto-fetch if needed).
   * Returns workitemTypeId for the given category.
   */
  private async ensureWorkitemTypeId(category: 'Req' | 'Bug' | 'Task'): Promise<string> {
    // If already cached, use it
    if (this.workitemTypeMap?.[category]) {
      return this.workitemTypeMap[category]!;
    }

    // Fetch from API (all categories at once)
    console.log('Fetching workitem types from 云效...');
    const types = await this.listAllWorkitemTypes();
    const newMap = buildTypeMap(types);

    // Merge with existing map
    this.workitemTypeMap = { ...this.workitemTypeMap, ...newMap };
    saveProjectConfig(this.projectRoot, { workitem_type_map: this.workitemTypeMap });
    console.log(`  → Saved workitem_type_map: Req=${newMap.Req}, Bug=${newMap.Bug}, Task=${newMap.Task}`);

    // Return the specific category's ID
    const typeId = this.workitemTypeMap[category];
    if (!typeId) {
      throw new AdapterError(
        `No enabled workitem type for category "${category}". Check your 云效 project configuration.`,
        this.name,
      );
    }
    return typeId;
  }

  /**
   * Get field configuration for a workitem type.
   * Caches the result to avoid repeated API calls.
   */
  async getFieldConfig(workitemTypeId: string): Promise<FieldConfigResponse> {
    if (this.fieldConfigCache.has(workitemTypeId)) {
      return this.fieldConfigCache.get(workitemTypeId)!;
    }

    console.log(`Fetching field config for workitem type ${workitemTypeId}...`);
    const path = `/organizations/${this.organizationId}/projects/${this.spaceIdentifierId}/workitemTypes/${workitemTypeId}/fields`;
    const fields = await this.request<FieldConfigResponse>('GET', path);
    
    this.fieldConfigCache.set(workitemTypeId, fields);
    return fields;
  }

  /**
   * Ensure all required fields have values in the create body.
   * Auto-fills default values for required fields that are missing.
   */
  private async ensureRequiredFields(
    body: any,
    workitemTypeId: string,
  ): Promise<void> {
    const fields = await this.getFieldConfig(workitemTypeId);
    const requiredFields = fields.filter(f => f.required);

    for (const field of requiredFields) {
      // Skip if already set in body
      if (body.customFields?.[field.id]) continue;
      if (body[field.id]) continue;

      // For severity field (严重程度), auto-fill with default value
      if (field.identifier === 'severity' || field.name === '严重程度') {
        const defaultOptionId = findRequiredFieldDefault(fields, field.identifier);
        if (defaultOptionId) {
          if (!body.customFields) body.customFields = {};
          body.customFields[field.id] = defaultOptionId;
          console.log(`  → Auto-filled required field "${field.name}" with default value`);
        } else {
          throw new AdapterError(
            `Required field "${field.name}" (${field.identifier}) has no default value. Please configure it in 云效.`,
            this.name,
          );
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // getCurrentUser → GET /oapi/v1/platform/user
  // -----------------------------------------------------------------------

  async getCurrentUser(): Promise<{ id: string; name: string }> {
    const url = `https://${this.domain}/oapi/v1/platform/user`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-yunxiao-token': this.token,
    };

    const res = await this.httpFetch(url, { method: 'GET', headers });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AdapterError(`getCurrentUser HTTP ${res.status}: ${text.slice(0, 200)}`, this.name);
    }

    const data = await res.json() as YunxiaoUserResponse;
    if (!data.id) {
      throw new AdapterError('getCurrentUser failed: no user id returned', this.name);
    }

    return { id: data.id, name: data.name ?? data.username ?? '' };
  }

  // -----------------------------------------------------------------------
  // createIssue → POST /oapi/v1/projex/organizations/{orgId}/workitems
  // -----------------------------------------------------------------------

  async createIssue(task: TaskFile): Promise<IssueRef> {
    // Ensure assignedTo (auto-fetch if not set)
    const assignedTo = await this.ensureAssignedTo();

    // Ensure workitemTypeId for the task's category (auto-fetch if not set)
    const category = workTypeToCategory(task.type) as 'Req' | 'Bug' | 'Task';
    const workitemTypeId = await this.ensureWorkitemTypeId(category);

    const body = taskToCreateBody(task, this.spaceIdentifierId, workitemTypeId, assignedTo);
    
    // Ensure all required fields have values (auto-fill defaults)
    await this.ensureRequiredFields(body, workitemTypeId);
    
    const path = `/organizations/${this.organizationId}/workitems`;

    const res = await this.request<YunxiaoCreateResponse>('POST', path, body);

    if (!res.id) {
      throw new AdapterError(
        `createIssue failed: ${res.errorMsg ?? res.errorCode ?? 'unknown'}`,
        this.name,
      );
    }

    return {
      id: res.id,
      url: `https://devops.aliyun.com/organization/${this.organizationId}/workitem/${res.id}`,
    };
  }

  // -----------------------------------------------------------------------
  // updateIssue → PUT /oapi/v1/projex/organizations/{orgId}/workitems/{id}
  // -----------------------------------------------------------------------

  async updateIssue(task: TaskFile): Promise<IssueRef> {
    if (!task.platform_id) {
      throw new AdapterError(`Task ${task.id} has no platform_id`, this.name);
    }

    const updateBody = taskToUpdateBody(task);
    const path = `/organizations/${this.organizationId}/workitems/${task.platform_id}`;

    const res = await this.request<void>('PUT', path, updateBody);

    return {
      id: task.platform_id,
      url: `https://devops.aliyun.com/organization/${this.organizationId}/workitem/${task.platform_id}`,
    };
  }

  // -----------------------------------------------------------------------
  // listRemote → POST /oapi/v1/projex/organizations/{orgId}/workitems:search
  // -----------------------------------------------------------------------

  async listRemote(): Promise<RemoteIssue[]> {
    const items: RemoteIssue[] = [];
    let page = 1;
    const perPage = 200;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const body = {
        category: 'Req',
        spaceId: this.spaceIdentifierId,
        spaceType: 'Project',
        page,
        perPage,
      };

      const path = `/organizations/${this.organizationId}/workitems:search`;
      const res = await this.request<YunxiaoSearchResponse>('POST', path, body);

      if (res && res.length > 0) {
        for (const wi of res) {
          items.push(workitemToRemote(this.organizationId, wi));
        }
      }

      if (!res || res.length < perPage) break;
      page++;
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // addComment → POST /oapi/v1/projex/organizations/{orgId}/workitems/{id}/comments
  // -----------------------------------------------------------------------

  async addComment(workitemIdentifier: string, content: string): Promise<void> {
    const body = { content };
    const path = `/organizations/${this.organizationId}/workitems/${workitemIdentifier}/comments`;

    const res = await this.request<YunxiaoCommentResponse>('POST', path, body);

    if (!res.id) {
      throw new AdapterError(
        `addComment failed: ${res.errorMsg ?? res.errorCode ?? 'unknown'}`,
        this.name,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Internal HTTP helper - 使用新版 API 认证头
  // -----------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `https://${this.domain}/oapi/v1/projex${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-yunxiao-token': this.token,
    };

    const res = await this.httpFetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AdapterError(
        `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
        this.name,
      );
    }

    // PUT may return empty body
    if (method === 'PUT') {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }
}
