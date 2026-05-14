import { Gitlab } from '@gitbeaker/rest';
import { TaskFile } from '../../core/types.js';
import { Adapter, IssueRef, RemoteIssue } from '../interface.js';
import { AdapterError } from '../../core/errors.js';
import { taskToIssueInput, issueToRemote, RawGitlabIssue } from './mapper.js';
import { GITLAB_DEFAULT_HOST } from '../../core/constants.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface GitLabAdapterOptions {
  /** GitLab Personal Access Token (scope: api). */
  token: string;
  /** GitLab group or namespace (e.g. "my-org"). */
  owner: string;
  /** GitLab project name or ID (e.g. "my-project" or 123). */
  repo: string;
  /** GitLab instance host — defaults to "https://gitlab.com". */
  host?: string;
  /** Custom Gitlab client instance (for testing). */
  client?: Gitlab;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GitLabAdapter implements Adapter {
  readonly name = 'gitlab';
  private readonly api: Gitlab;
  private readonly projectId: string;

  constructor(private readonly opts: GitLabAdapterOptions) {
    this.api = opts.client ?? new Gitlab({
      host: opts.host ?? GITLAB_DEFAULT_HOST,
      token: opts.token,
    });
    // projectId can be "namespace/project" or numeric ID
    this.projectId = `${opts.owner}/${opts.repo}`;
  }

  // -----------------------------------------------------------------------
  // createIssue
  // -----------------------------------------------------------------------

  async createIssue(task: TaskFile): Promise<IssueRef> {
    const input = taskToIssueInput(task);
    try {
      const issue = await this.api.Issues.create(this.projectId, input.title, {
        description: input.description,
        labels: input.labels?.join(','),
      });
      return {
        id: String((issue as any).iid),
        url: (issue as any).web_url,
      };
    } catch (e) {
      throw new AdapterError(`createIssue failed for ${task.id}`, this.name, e);
    }
  }

  // -----------------------------------------------------------------------
  // updateIssue
  // -----------------------------------------------------------------------

  async updateIssue(task: TaskFile): Promise<IssueRef> {
    if (!task.platform_id) {
      throw new AdapterError(`Task ${task.id} has no platform_id`, this.name);
    }
    const input = taskToIssueInput(task);
    try {
      const issue = await this.api.Issues.edit(this.projectId, Number(task.platform_id), {
        title: input.title,
        description: input.description,
        labels: input.labels?.join(','),
      });
      return {
        id: String((issue as any).iid),
        url: (issue as any).web_url,
      };
    } catch (e) {
      throw new AdapterError(`updateIssue failed for ${task.id}`, this.name, e);
    }
  }

  // -----------------------------------------------------------------------
  // listRemote
  // -----------------------------------------------------------------------

  async listRemote(): Promise<RemoteIssue[]> {
    try {
      const issues = await this.api.Issues.all({
        projectId: this.projectId,
        state: 'all',
        perPage: 100,
      });
      return (issues as any[])
        .map((i: any) => issueToRemote(i as unknown as RawGitlabIssue));
    } catch (e) {
      throw new AdapterError('listRemote failed', this.name, e);
    }
  }
}
