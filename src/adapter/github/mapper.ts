import { TaskFile } from '../../core/types.js';
import { RemoteIssue } from '../interface.js';

export interface IssueInput {
  title: string;
  body: string;
  labels: string[];
}

export function taskToIssueInput(task: TaskFile): IssueInput {
  const auto = [`type:${task.type}`, `priority:${task.priority}`];
  const labels = Array.from(new Set([...task.labels, ...auto]));
  return { title: task.title, body: task.body, labels };
}

export interface RawGitHubIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
}

export function issueToRemote(raw: RawGitHubIssue): RemoteIssue {
  return {
    id: String(raw.number),
    title: raw.title,
    state: raw.state,
    url: raw.html_url,
  };
}
