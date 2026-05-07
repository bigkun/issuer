import { TaskFile } from '../../core/types.js';
import { RemoteIssue } from '../interface.js';

// ---------------------------------------------------------------------------
// Issue input for GitLab API
// ---------------------------------------------------------------------------

export interface GitlabIssueInput {
  title: string;
  description: string;
  labels?: string[];
  assignee_ids?: number[];
  milestone_id?: number;
  confidential?: boolean;
  epic_id?: number;
}

/** Convert a TaskFile to a GitLab issue creation/update input. */
export function taskToIssueInput(task: TaskFile): GitlabIssueInput {
  const auto = [`type:${task.type}`, `priority:${task.priority}`];
  const labels = Array.from(new Set([...task.labels, ...auto]));
  return {
    title: task.title,
    description: task.body,
    labels,
  };
}

// ---------------------------------------------------------------------------
// Raw GitLab issue shape (from @gitbeaker/rest)
// ---------------------------------------------------------------------------

export interface RawGitlabIssue {
  iid: number;
  title: string;
  state: string;
  web_url: string;
}

/** Convert a raw GitLab issue to the generic RemoteIssue shape. */
export function issueToRemote(raw: RawGitlabIssue): RemoteIssue {
  return {
    id: String(raw.iid),
    title: raw.title,
    state: raw.state,
    url: raw.web_url,
  };
}
