import { TaskFile } from '../../core/types.js';
import { Adapter, IssueRef, RemoteIssue } from '../interface.js';
import { AdapterError } from '../../core/errors.js';
import {
  taskToCreateBody,
  taskToUpdateBody,
  workitemToRemote,
  YunxiaoCreateResponse,
  YunxiaoSearchResponse,
  YunxiaoCommentResponse,
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
  /** Default work item type ID (workitemTypeId) — required for create. */
  workitemTypeId: string;
  /** Default assignedTo userId — required for create. */
  assignedTo?: string;
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
  private readonly workitemTypeId: string;
  private readonly assignedTo?: string;
  private readonly domain: string;
  private readonly httpFetch: (...args: any[]) => Promise<any>;

  constructor(opts: YunxiaoAdapterOptions) {
    this.token = opts.token;
    this.organizationId = opts.organizationId;
    this.spaceIdentifierId = opts.spaceIdentifierId;
    this.workitemTypeId = opts.workitemTypeId;
    this.assignedTo = opts.assignedTo;
    this.domain = opts.domain ?? DEFAULT_DOMAIN;
    this.httpFetch = (opts.fetch ?? globalThis.fetch) as (...args: any[]) => Promise<any>;
  }

  // -----------------------------------------------------------------------
  // createIssue → POST /oapi/v1/projex/organizations/{orgId}/workitems
  // -----------------------------------------------------------------------

  async createIssue(task: TaskFile): Promise<IssueRef> {
    if (!this.assignedTo) {
      throw new AdapterError('assignedTo is required for createIssue — set in config or CLI', this.name);
    }
    const body = taskToCreateBody(task, this.spaceIdentifierId, this.workitemTypeId, this.assignedTo);
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
