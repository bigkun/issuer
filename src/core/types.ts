export enum WorkType {
  Bug = 'bug',
  Story = 'story',
  Task = 'task',
  Epic = 'epic',
}

export enum Status {
  Draft = 'draft',
  Ready = 'ready',
  Synced = 'synced',
}

export enum Priority {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export interface TaskFile {
  id: string;
  type: WorkType;
  title: string;
  status: Status;
  platform: string;
  platform_id: string | null;
  platform_url: string | null;
  priority: Priority;
  labels: string[];
  created_at: string;
  updated_at: string;
  body: string;
  filePath: string;
}

export const WORK_TYPES = Object.values(WorkType);
export const STATUSES = Object.values(Status);
export const PRIORITIES = Object.values(Priority);
