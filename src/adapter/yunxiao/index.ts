import { TaskFile } from '../../core/types.js';
import { Adapter, IssueRef, RemoteIssue } from '../interface.js';
import { AdapterError } from '../../core/errors.js';
import { saveProjectConfig, loadProjectConfig, type WorkitemTypeMap, type SeverityFieldMap } from '../../core/config.js';
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
   * For Bug type: queries and caches severity field mapping on first push.
   */
  private async ensureRequiredFields(
    body: any,
    workitemTypeId: string,
    category: 'Req' | 'Bug' | 'Task',
  ): Promise<void> {
    // For Bug type, ensure severity field mapping is cached
    if (category === 'Bug') {
      await this.ensureSeverityFieldMapping(workitemTypeId);
    }

    // Only process if we have severity field mapping
    if (category === 'Bug' && this.severityFieldMap) {
      // Map task priority to severity option
      const severityOptionId = this.getSeverityOptionId(body._taskPriority);
      if (severityOptionId) {
        if (!body.customFields) body.customFields = {};
        body.customFields[this.severityFieldMap.fieldId] = severityOptionId;
        console.log(`  → Set severity based on priority: ${body._taskPriority} → severity`);
      }
    }
  }

  /** Cache for severity field mapping */
  private severityFieldMap?: SeverityFieldMap;

  /**
   * Ensure severity field mapping is cached (auto-fetch on first Bug push).
   */
  private async ensureSeverityFieldMapping(workitemTypeId: string): Promise<void> {
    // Try to load from config first
    if (!this.severityFieldMap) {
      try {
        const cfg = await loadProjectConfig(this.projectRoot);
        if (cfg.severity_field_map) {
          this.severityFieldMap = cfg.severity_field_map;
          console.log('Loaded severity field mapping from config');
          return;
        }
      } catch {
        // Config load failed, will fetch from API
      }
    }

    if (this.severityFieldMap) return;

    console.log('Fetching severity field config for Bug type...');
    const fields = await this.getFieldConfig(workitemTypeId);
    
    // Find severity field
    const severityField = fields.find(f => 
      f.identifier === 'severity' || f.name === '严重程度'
    );

    if (!severityField || !severityField.options) {
      console.log('  → No severity field found, skipping');
      return;
    }

    // Build priority → option mapping
    const options = severityField.options;
    const optionMap: import('../../core/config.js').SeverityFieldMap['options'] = {};

    // Try to match by option name (common Chinese names)
    for (const opt of options) {
      const name = opt.name?.toLowerCase() || '';
      if (name.includes('致命') || name.includes('critical') || name.includes('block')) {
        optionMap.critical = opt.id;
      } else if (name.includes('严重') || name.includes('high') || name.includes('major')) {
        optionMap.high = opt.id;
      } else if (name.includes('一般') || name.includes('medium') || name.includes('normal')) {
        optionMap.medium = opt.id;
      } else if (name.includes('建议') || name.includes('low') || name.includes('minor')) {
        optionMap.low = opt.id;
      }
    }

    // Fallback: use first 4 options in order
    if (Object.keys(optionMap).length === 0 && options.length >= 4) {
      optionMap.critical = options[0].id;
      optionMap.high = options[1].id;
      optionMap.medium = options[2].id;
      optionMap.low = options[3].id;
    }

    this.severityFieldMap = {
      fieldId: severityField.id,
      options: optionMap,
    };

    // Save to config
    try {
      saveProjectConfig(this.projectRoot, {
        severity_field_map: this.severityFieldMap,
      });
    } catch (err) {
      console.log(`  → Warning: Could not save severity field mapping to config: ${err}`);
    }

    console.log(`  → Cached severity field mapping: fieldId=${severityField.id}`);
    console.log(`     critical=${optionMap.critical}, high=${optionMap.high}, medium=${optionMap.medium}, low=${optionMap.low}`);
  }

  /**
   * Get severity option ID based on task priority.
   */
  private getSeverityOptionId(priority?: string): string | undefined {
    if (!this.severityFieldMap) return undefined;
    
    switch (priority) {
      case 'critical':
        return this.severityFieldMap.options.critical;
      case 'high':
        return this.severityFieldMap.options.high;
      case 'medium':
        return this.severityFieldMap.options.medium;
      case 'low':
        return this.severityFieldMap.options.low;
      default:
        // Default to medium if not specified
        return this.severityFieldMap.options.medium;
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
    
    // Pass priority for severity mapping
    (body as any)._taskPriority = task.priority;
    
    // Ensure all required fields have values (auto-fill defaults)
    await this.ensureRequiredFields(body, workitemTypeId, category);
    
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
