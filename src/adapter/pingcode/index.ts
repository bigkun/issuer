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
import { loadProjectConfig, saveProjectConfig } from '../../core/config.js';
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
  /** PingCode access token (resolved from credentials). */
  token: string;
  /** PingCode project identifier (e.g., "SCR"). Will be resolved to project ID on init. */
  projectIdentifier: string;
  /** Project root path for saving config updates. */
  projectRoot: string;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof globalThis.fetch | ((...args: any[]) => Promise<any>);
}

// ---------------------------------------------------------------------------
// Token Management
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface ProjectInfo {
  id: string;
  identifier: string;
  name: string;
  url: string;
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
  private readonly projectIdentifier: string;
  private readonly projectRoot: string;
  private readonly httpFetch: typeof globalThis.fetch;

  /** PingCode public cloud API root */
  private readonly apiRoot = 'https://open.pingcode.com';
  
  /** Resolved project ID (from identifier) */
  private projectId: string | null = null;

  constructor(opts: PingCodeAdapterOptions) {
    this.token = opts.token;
    this.projectIdentifier = opts.projectIdentifier;
    this.projectRoot = opts.projectRoot;
    this.httpFetch = (opts.fetch ?? globalThis.fetch) as typeof globalThis.fetch;
  }

  /**
   * Get project ID: from cache > config > API resolution
   */
  private async getProjectId(): Promise<string> {
    // 1. Return cached value if available
    if (this.projectId) {
      return this.projectId;
    }

    // 2. Try to load from config.yml
    try {
      const config = await loadProjectConfig(this.projectRoot);
      if (config.pingcode_project_id) {
        this.projectId = config.pingcode_project_id;
        return this.projectId;
      }
    } catch {
      // Config not found or invalid, will resolve via API
    }

    // 3. Resolve via API and save to config
    return this.resolveAndCacheProjectId();
  }

  /**
   * Resolve project identifier to project ID via API and cache it
   */
  private async resolveAndCacheProjectId(): Promise<string> {
    const url = new URL(`${this.apiRoot}/v1/project/projects`);
    url.searchParams.set('identifier', this.projectIdentifier);

    console.log(`\n🔍 [PingCode Debug] Resolving project identifier...`);
    console.log(`   Identifier: ${this.projectIdentifier}`);
    console.log(`   API URL: ${url.toString()}`);
    console.log(`   Token: ${this.token.substring(0, 20)}...`);

    const res = await this.httpFetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    console.log(`   Response Status: ${res.status} ${res.statusText}`);
    
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      console.log(`   Response Body: ${errorBody}`);
      throw new AdapterError(
        this.name,
        `Failed to resolve project identifier: ${res.status}`,
      );
    }

    const data = await res.json() as { values?: ProjectInfo[]; list?: ProjectInfo[] };
    console.log(`   Response Data:`, JSON.stringify(data, null, 2));
    
    // PingCode API returns 'values' field, not 'list'
    const projects = data.values || data.list || [];
    
    if (projects.length === 0) {
      console.log(`   ❌ No projects found with identifier '${this.projectIdentifier}'`);
      throw new AdapterError(
        this.name,
        `Project with identifier '${this.projectIdentifier}' not found`,
      );
    }

    const projectId = projects[0].id;
    this.projectId = projectId;
    console.log(`   ✓ Found project: ${projects[0].name} (ID: ${projectId})`);

    // Save to config.yml for future use
    try {
      saveProjectConfig(this.projectRoot, {
        pingcode_project_id: projectId,
      });
      console.log(`   → Saved to .issuer/config.yml\n`);
    } catch (err: any) {
      // Don't fail if config save fails, just warn
      console.warn(` Warning: Could not save project ID to config: ${err.message}`);
    }

    return projectId;
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

    console.log(`\n [PingCode API] ${options.method || 'GET'} ${url}`);
    if (options.body) {
      console.log(`   Request Body: ${options.body}`);
    }

    const res = await this.httpFetch(url, {
      ...options,
      headers,
    });

    console.log(`   Response Status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.log(`   Error Response: ${body}`);
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
    const projectId = await this.getProjectId();
    const payload = buildCreatePayload(task);

    const data = await this.request<Record<string, unknown>>(
      `/v1/project/work_items?project_id=${projectId}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );

    const id = String(data.id || '');
    const url = String(data.url || `${this.apiRoot}/v1/project/work_items/${id}`);

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
      `/v1/project/work_items/${task.platform_id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );

    return { id: task.platform_id, url: `${this.apiRoot}/v1/project/work_items/${task.platform_id}` };
  }

  async getIssue(issueId: string): Promise<RemoteIssue | null> {
    try {
      const data = await this.request<Record<string, unknown>>(
        `/v1/project/work_items/${issueId}`,
      );

      if (!data || !data.id) return null;

      const normalized = normalizePingCodeIssue(data);

      return {
        id: String(normalized.id),
        title: String(normalized.title),
        state: normalized.status ? String(normalized.status) : 'unknown',
        url: normalized.platformUrl ? String(normalized.platformUrl) : `${this.apiRoot}/v1/project/work_items/${normalized.id}`,
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
    const projectId = await this.getProjectId();
    const params = new URLSearchParams();

    params.set('project_id', projectId);

    if (options?.category) {
      // TODO: Map category to workitem_type_id
      // For now, we search by title only
    }

    if (options?.title) {
      params.set('subject', options.title);
    }

    if (options?.assignee) {
      params.set('assignee_id', options.assignee);
    }

    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    params.set('page', String(page));
    params.set('per_page', String(pageSize));

    console.log(`\n📋 [PingCode API] List Work Items`);
    console.log(`   URL: ${this.apiRoot}/v1/project/work_items`);
    console.log(`   Params: ${params.toString()}`);

    const res = await this.request<PingCodeListResponse<Record<string, unknown>>>(
      `/v1/project/work_items?${params.toString()}`,
    );

    return (res.list || []).map((item) => {
      const normalized = normalizePingCodeIssue(item);
      return {
        id: String(normalized.id),
        title: String(normalized.title),
        state: normalized.status ? String(normalized.status) : 'unknown',
        url: normalized.platformUrl ? String(normalized.platformUrl) : `${this.apiRoot}/v1/project/work_items/${normalized.id}`,
        type: normalized.category ? String(normalized.category) : undefined,
      };
    });
  }

  async listWorkitemTypes(): Promise<{ id: string; name: string; category: string }[]> {
    const projectId = await this.getProjectId();
    const res = await this.request<PingCodeListResponse<PingCodeWorkItemType>>(
      `/v1/project/work_item_types?project_id=${projectId}`,
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
      `/v1/project/work_items/${issueId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content: comment }),
      },
    );
  }

  async setParent(issueId: string, parentId: string): Promise<void> {
    await this.request<void>(
      `/v1/project/work_items/${issueId}/parent`,
      {
        method: 'PUT',
        body: JSON.stringify({ parent_id: parentId }),
      },
    );
  }

  async removeParent(issueId: string): Promise<void> {
    await this.request<void>(
      `/v1/project/work_items/${issueId}/parent`,
      {
        method: 'DELETE',
      },
    );
  }

  async addLink(issueId: string, targetId: string, linkType: string = 'relates'): Promise<void> {
    await this.request<void>(
      `/v1/project/work_items/${issueId}/links`,
      {
        method: 'POST',
        body: JSON.stringify({
          target_workitem_id: targetId,
          link_type: linkType,
        }),
      },
    );
  }

  async removeLink(issueId: string, targetId: string): Promise<void> {
    await this.request<void>(
      `/v1/project/work_items/${issueId}/links/${targetId}`,
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
      `/v1/workitems/workitems/${issueId}/children`,
    );

    return (res.list || []).map((item) => {
      const normalized = normalizePingCodeIssue(item);
      return {
        id: String(normalized.id),
        title: String(normalized.title),
        state: normalized.status ? String(normalized.status) : 'unknown',
        url: normalized.platformUrl ? String(normalized.platformUrl) : `${this.apiRoot}/v1/project/work_items/${normalized.id}`,
        type: normalized.category ? String(normalized.category) : undefined,
      };
    });
  }

  /**
   * Get work item links (relations)
   */
  async getLinks(issueId: string): Promise<{ id: string; type: string; targetId: string }[]> {
    const res = await this.request<PingCodeListResponse<Record<string, unknown>>>(
      `/v1/workitems/workitems/${issueId}/links`,
    );

    return (res.list || []).map((item: any) => ({
      id: String(item.id),
      type: String(item.link_type || 'relates'),
      targetId: String(item.target_workitem_id || item.target_id || ''),
    }));
  }
}

export default PingCodeAdapter;
