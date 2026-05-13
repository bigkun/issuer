/**
 * PingCode Adapter for Issuer
 * 
 * Integrates with PingCode public cloud REST API.
 * API Root: https://open.pingcode.com
 * 
 * @see https://open.pingcode.com
 */

import { TaskFile } from '../../core/types.js';
import { Adapter, IssueRef, RemoteIssue } from '../interface.js';
import { AdapterError } from '../../core/errors.js';
import {
  buildCreatePayload,
  buildUpdatePayload,
  normalizePingCodeIssue,
  categoryToPingCodeType,
} from './mapper.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PingCodeAdapterOptions {
  /** PingCode personal access token (API Token). */
  token: string;
  /** PingCode organization/project ID. */
  projectId: string;
  /** Project root path for saving config updates. */
  projectRoot: string;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof globalThis.fetch | ((...args: any[]) => Promise<any>);
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

interface PingCodeListResponse<T = unknown> {
  list: T[];
  total?: number;
}

interface PingCodeWorkItemType {
  id: string;
  name: string;
  identifier?: string;
}

interface PingCodeStatus {
  id: string;
  name: string;
  category?: string;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class PingCodeAdapter implements Adapter {
  readonly name = 'pingcode';
  private readonly token: string;
  private readonly projectId: string;
  private readonly projectRoot: string;
  private readonly httpFetch: typeof globalThis.fetch;

  /** PingCode public cloud API root */
  private readonly apiRoot = 'https://open.pingcode.com';

  constructor(opts: PingCodeAdapterOptions) {
    this.token = opts.token;
    this.projectId = opts.projectId;
    this.projectRoot = opts.projectRoot;
    this.httpFetch = (opts.fetch ?? globalThis.fetch) as typeof globalThis.fetch;
  }

  // -----------------------------------------------------------------------
  // HTTP helpers
  // -----------------------------------------------------------------------

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.apiRoot}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    const res = await this.httpFetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AdapterError(
        this.name,
        `API request failed: ${res.status} ${res.statusText}`,
        { url, status: res.status, body },
      );
    }

    return res.json() as Promise<T>;
  }

  // -----------------------------------------------------------------------
  // Adapter interface
  // -----------------------------------------------------------------------

  async createIssue(task: TaskFile): Promise<{ id: string; url: string }> {
    const payload = buildCreatePayload(task);

    const data = await this.request<Record<string, unknown>>(
      `/api/v1/workitems`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );

    const id = String(data.id || data.identifier || '');
    const url = String(data.url || `${this.apiRoot}/workitems/${id}`);

    return { id, url };
  }

  async updateIssue(task: TaskFile): Promise<{ id: string; url: string }> {
    if (!task.platform_id) {
      throw new AdapterError(
        this.name,
        `Task ${task.id} has no platform_id`,
      );
    }

    const payload = buildUpdatePayload({
      title: task.title,
      description: task.body,
      priority: task.priority,
      labels: task.labels,
    });

    await this.request<void>(
      `/api/v1/workitems/${task.platform_id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );

    return { id: task.platform_id, url: `${this.apiRoot}/workitems/${task.platform_id}` };
  }

  async getIssue(issueId: string): Promise<RemoteIssue | null> {
    try {
      const data = await this.request<Record<string, unknown>>(
        `/api/v1/workitems/${issueId}`,
      );

      if (!data || !data.id) return null;

      const normalized = normalizePingCodeIssue(data);

      return {
        id: String(normalized.id),
        title: String(normalized.title),
        state: normalized.status ? String(normalized.status) : 'unknown',
        url: normalized.platformUrl ? String(normalized.platformUrl) : `${this.apiRoot}/workitems/${normalized.id}`,
        type: normalized.category ? String(normalized.category) : undefined,
      };
    } catch (err: any) {
      // Check if it's a 404 error
      const message = err.message || '';
      if (err instanceof AdapterError && message.includes('404')) {
        return null;
      }
      throw err;
    }
  }

  async listRemote(options?: {
    category?: string;
    title?: string;
    assignee?: string;
    page?: number;
    pageSize?: number;
  }): Promise<RemoteIssue[]> {
    const params = new URLSearchParams();

    if (options?.category) {
      const pcType = categoryToPingCodeType(options.category as any);
      params.set('workitem_type', pcType);
    }

    if (options?.title) {
      params.set('name', options.title);
    }

    if (options?.assignee) {
      params.set('assignee', options.assignee);
    }

    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    params.set('page', String(page));
    params.set('page_size', String(pageSize));

    const res = await this.request<PingCodeListResponse<Record<string, unknown>>>(
      `/api/v1/workitems?${params.toString()}`,
    );

    return (res.list || []).map((item) => {
      const normalized = normalizePingCodeIssue(item);
      return {
        id: String(normalized.id),
        title: String(normalized.title),
        state: normalized.status ? String(normalized.status) : 'unknown',
        url: normalized.platformUrl ? String(normalized.platformUrl) : `${this.apiRoot}/workitems/${normalized.id}`,
        type: normalized.category ? String(normalized.category) : undefined,
      };
    });
  }

  async listWorkitemTypes(): Promise<{ id: string; name: string; category: string }[]> {
    const res = await this.request<PingCodeListResponse<PingCodeWorkItemType>>(
      '/api/v1/workitem_types',
    );

    return (res.list || []).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.identifier || item.name,
    }));
  }

  async listStatuses(workitemTypeId?: string): Promise<{ id: string; name: string }[]> {
    const path = workitemTypeId
      ? `/api/v1/workitem_types/${workitemTypeId}/statuses`
      : '/api/v1/statuses';

    const res = await this.request<PingCodeListResponse<PingCodeStatus>>(path);

    return (res.list || []).map((item) => ({
      id: item.id,
      name: item.name,
    }));
  }

  async searchByTitle(title: string): Promise<RemoteIssue[]> {
    return this.listRemote({ title });
  }

  async addComment(issueId: string, comment: string): Promise<void> {
    await this.request<void>(
      `/api/v1/workitems/${issueId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content: comment }),
      },
    );
  }

  async setParent(issueId: string, parentId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/workitems/${issueId}/parent`,
      {
        method: 'PUT',
        body: JSON.stringify({ parent: parentId }),
      },
    );
  }

  async removeParent(issueId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/workitems/${issueId}/parent`,
      {
        method: 'DELETE',
      },
    );
  }

  async addLink(issueId: string, targetId: string, linkType: string = 'relates'): Promise<void> {
    await this.request<void>(
      `/api/v1/workitems/${issueId}/links`,
      {
        method: 'POST',
        body: JSON.stringify({
          target_workitem: targetId,
          link_type: linkType,
        }),
      },
    );
  }

  async removeLink(issueId: string, targetId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/workitems/${issueId}/links/${targetId}`,
      {
        method: 'DELETE',
      },
    );
  }

  // -----------------------------------------------------------------------
  // PingCode-specific helpers
  // -----------------------------------------------------------------------

  /**
   * Get work item children
   */
  async getChildren(issueId: string): Promise<RemoteIssue[]> {
    const res = await this.request<PingCodeListResponse<Record<string, unknown>>>(
      `/api/v1/workitems/${issueId}/children`,
    );

    return (res.list || []).map((item) => {
      const normalized = normalizePingCodeIssue(item);
      return {
        id: String(normalized.id),
        title: String(normalized.title),
        state: normalized.status ? String(normalized.status) : 'unknown',
        url: normalized.platformUrl ? String(normalized.platformUrl) : `${this.apiRoot}/workitems/${normalized.id}`,
        type: normalized.category ? String(normalized.category) : undefined,
      };
    });
  }

  /**
   * Get work item links (relations)
   */
  async getLinks(issueId: string): Promise<{ id: string; type: string; targetId: string }[]> {
    const res = await this.request<PingCodeListResponse<Record<string, unknown>>>(
      `/api/v1/workitems/${issueId}/links`,
    );

    return (res.list || []).map((item: any) => ({
      id: String(item.id),
      type: String(item.link_type || 'relates'),
      targetId: String(item.target_workitem || item.target_id || ''),
    }));
  }
}

export default PingCodeAdapter;
