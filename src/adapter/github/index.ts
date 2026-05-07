import { Octokit } from '@octokit/rest';
import { TaskFile } from '../../core/types.js';
import { Adapter, IssueRef, RemoteIssue } from '../interface.js';
import { AdapterError } from '../../core/errors.js';
import { taskToIssueInput, issueToRemote, RawGitHubIssue } from './mapper.js';

export interface GitHubAdapterOptions {
  token: string;
  owner: string;
  repo: string;
  octokit?: Octokit;
}

export class GitHubAdapter implements Adapter {
  readonly name = 'github';
  private readonly octokit: Octokit;

  constructor(private readonly opts: GitHubAdapterOptions) {
    this.octokit = opts.octokit ?? new Octokit({ auth: opts.token });
  }

  async createIssue(task: TaskFile): Promise<IssueRef> {
    const input = taskToIssueInput(task);
    try {
      const res = await this.octokit.issues.create({
        owner: this.opts.owner,
        repo: this.opts.repo,
        title: input.title,
        body: input.body,
        labels: input.labels,
      });
      return { id: String(res.data.number), url: res.data.html_url };
    } catch (e) {
      throw new AdapterError(`createIssue failed for ${task.id}`, this.name, e);
    }
  }

  async updateIssue(task: TaskFile): Promise<IssueRef> {
    if (!task.platform_id) {
      throw new AdapterError(`Task ${task.id} has no platform_id`, this.name);
    }
    const input = taskToIssueInput(task);
    try {
      const res = await this.octokit.issues.update({
        owner: this.opts.owner,
        repo: this.opts.repo,
        issue_number: Number(task.platform_id),
        title: input.title,
        body: input.body,
        labels: input.labels,
      });
      return { id: String(res.data.number), url: res.data.html_url };
    } catch (e) {
      throw new AdapterError(`updateIssue failed for ${task.id}`, this.name, e);
    }
  }

  async listRemote(): Promise<RemoteIssue[]> {
    try {
      const res = await this.octokit.issues.listForRepo({
        owner: this.opts.owner,
        repo: this.opts.repo,
        state: 'all',
        per_page: 100,
      });
      return res.data
        .filter((i) => !('pull_request' in i) || !i.pull_request)
        .map((i) => issueToRemote(i as unknown as RawGitHubIssue));
    } catch (e) {
      throw new AdapterError('listRemote failed', this.name, e);
    }
  }
}
