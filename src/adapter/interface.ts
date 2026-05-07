import { TaskFile } from '../core/types.js';

export interface RemoteIssue {
  id: string;
  title: string;
  state: string;
  url: string;
}

export interface IssueRef {
  id: string;
  url: string;
}

export interface Adapter {
  readonly name: string;
  createIssue(task: TaskFile): Promise<IssueRef>;
  updateIssue(task: TaskFile): Promise<IssueRef>;
  listRemote(): Promise<RemoteIssue[]>;
}
