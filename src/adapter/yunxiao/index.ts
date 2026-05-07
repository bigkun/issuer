import { TaskFile } from '../../core/types.js';
import { Adapter, IssueRef, RemoteIssue } from '../interface.js';
import { AdapterError } from '../../core/errors.js';
import {
  taskToCreateBody,
  taskToUpdateFields,
  taskToCommentBody,
  workitemToRemote,
  YunxiaoCreateResponse,
  YunxiaoListResponse,
  YunxiaoUpdateResponse,
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
  /** API domain — defaults to `openapi-rdc.aliyuncs.com`. */
  domain?: string;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof globalThis.fetch | ((...args: any[]) => Promise<any>);
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const DEFAULT_DOMAIN = 'openapi-rdc.aliyuncs.com';
const API_VERSION = '2021-06-25';

export class YunxiaoAdapter implements Adapter {
  readonly name = 'yunxiao';
  private readonly token: string;
  private readonly organizationId: string;
  private readonly spaceIdentifierId: string;
  private readonly domain: string;
  private readonly httpFetch: (...args: any[]) => Promise<any>;

  constructor(opts: YunxiaoAdapterOptions) {
    this.token = opts.token;
    this.organizationId = opts.organizationId;
    this.spaceIdentifierId = opts.spaceIdentifierId;
    this.domain = opts.domain ?? DEFAULT_DOMAIN;
    this.httpFetch = (opts.fetch ?? globalThis.fetch) as (...args: any[]) => Promise<any>;
  }

  // -----------------------------------------------------------------------
  // createIssue → POST /organization/{orgId}/workitems/create
  // -----------------------------------------------------------------------

  async createIssue(task: TaskFile): Promise<IssueRef> {
    const body = taskToCreateBody(task, this.spaceIdentifierId);
    const path = `/organization/${this.organizationId}/workitems/create`;

    const res = await this.request<YunxiaoCreateResponse>('POST', path, body);

    if (!res.success || !res.workitem) {
      throw new AdapterError(
        `createIssue failed: ${res.errorMsg ?? res.errorCode ?? 'unknown'}`,
        this.name,
      );
    }

    return {
      id: res.workitem.identifier,
      url: `https://devops.aliyun.com/organization/${this.organizationId}/workitem/${res.workitem.identifier}`,
    };
  }

  // -----------------------------------------------------------------------
  // updateIssue → POST /organization/{orgId}/workitems/update
  // -----------------------------------------------------------------------

  async updateIssue(task: TaskFile): Promise<IssueRef> {
    if (!task.platform_id) {
      throw new AdapterError(`Task ${task.id} has no platform_id`, this.name);
    }

    const fields = taskToUpdateFields(task);
    // 云效 UpdateWorkItem 一次只更新一个字段，需逐个调用
    for (const field of fields) {
      const path = `/organization/${this.organizationId}/workitems/update`;
      const res = await this.request<YunxiaoUpdateResponse>('POST', path, field);

      if (!res.success) {
        throw new AdapterError(
          `updateIssue field "${field.propertyKey}" failed: ${res.errorMessage ?? res.errorCode ?? 'unknown'}`,
          this.name,
        );
      }
    }

    return {
      id: task.platform_id,
      url: `https://devops.aliyun.com/organization/${this.organizationId}/workitem/${task.platform_id}`,
    };
  }

  // -----------------------------------------------------------------------
  // listRemote → GET /organization/{orgId}/listWorkitems
  // -----------------------------------------------------------------------

  async listRemote(): Promise<RemoteIssue[]> {
    const items: RemoteIssue[] = [];
    let nextToken = '';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params = new URLSearchParams({
        spaceType: 'Project',
        spaceIdentifier: this.spaceIdentifierId,
        category: 'Req',
        maxResults: '200',
      });
      if (nextToken) {
        params.set('nextToken', nextToken);
      }

      const path = `/organization/${this.organizationId}/listWorkitems?${params.toString()}`;
      const res = await this.request<YunxiaoListResponse>('GET', path);

      if (!res.success) {
        throw new AdapterError(
          `listRemote failed: ${res.errorMsg ?? res.errorCode ?? 'unknown'}`,
          this.name,
        );
      }

      if (res.workitems) {
        for (const { workitem } of res.workitems) {
          items.push(workitemToRemote(this.organizationId, workitem));
        }
      }

      nextToken = res.nextToken;
      if (!nextToken) break;
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // addComment → POST /organization/{orgId}/workitems/comment
  // (not in Adapter interface yet, exposed for issuer-sync skill)
  // -----------------------------------------------------------------------

  async addComment(workitemIdentifier: string, content: string): Promise<void> {
    const body = taskToCommentBody(workitemIdentifier, content);
    const path = `/organization/${this.organizationId}/workitems/comment`;

    const res = await this.request<YunxiaoCommentResponse>('POST', path, body);

    if (res.success !== 'true') {
      throw new AdapterError(
        `addComment failed: ${res.errorMsg ?? res.errorCode ?? 'unknown'}`,
        this.name,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Internal HTTP helper
  // -----------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `https://${this.domain}/api/${API_VERSION}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
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

    return res.json() as Promise<T>;
  }
}
