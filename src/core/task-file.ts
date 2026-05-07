import matter from 'gray-matter';
import { TaskFile, WorkType, Status, Priority, WORK_TYPES, STATUSES, PRIORITIES } from './types.js';
import { TaskParseError } from './errors.js';

const REQUIRED_FIELDS = [
  'id', 'type', 'title', 'status', 'platform',
  'platform_id', 'platform_url', 'priority', 'labels',
  'created_at', 'updated_at',
] as const;

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

function coerceTimestamp(v: unknown, field: string, filePath: string): string {
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  throw new TaskParseError(`${field} must be an ISO timestamp string`, filePath);
}

export function parseTaskFile(raw: string, filePath: string): TaskFile {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (e) {
    throw new TaskParseError('failed to parse frontmatter', filePath, e);
  }
  const fm = parsed.data as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in fm)) {
      throw new TaskParseError(`missing required field: ${field}`, filePath);
    }
  }

  if (typeof fm.id !== 'string' || !fm.id) {
    throw new TaskParseError('id must be a non-empty string', filePath);
  }
  if (!WORK_TYPES.includes(fm.type as WorkType)) {
    throw new TaskParseError(`type must be one of ${WORK_TYPES.join('|')}`, filePath);
  }
  if (typeof fm.title !== 'string' || !fm.title) {
    throw new TaskParseError('title must be a non-empty string', filePath);
  }
  if (!STATUSES.includes(fm.status as Status)) {
    throw new TaskParseError(`status must be one of ${STATUSES.join('|')}`, filePath);
  }
  if (typeof fm.platform !== 'string' || !fm.platform) {
    throw new TaskParseError('platform must be a non-empty string', filePath);
  }
  if (!isStringOrNull(fm.platform_id)) {
    throw new TaskParseError('platform_id must be string or null', filePath);
  }
  if (!isStringOrNull(fm.platform_url)) {
    throw new TaskParseError('platform_url must be string or null', filePath);
  }
  if (!PRIORITIES.includes(fm.priority as Priority)) {
    throw new TaskParseError(`priority must be one of ${PRIORITIES.join('|')}`, filePath);
  }
  if (!Array.isArray(fm.labels) || !fm.labels.every((l) => typeof l === 'string')) {
    throw new TaskParseError('labels must be an array of strings', filePath);
  }
  const created_at = coerceTimestamp(fm.created_at, 'created_at', filePath);
  const updated_at = coerceTimestamp(fm.updated_at, 'updated_at', filePath);

  return {
    id: fm.id,
    type: fm.type as WorkType,
    title: fm.title,
    status: fm.status as Status,
    platform: fm.platform,
    platform_id: fm.platform_id as string | null,
    platform_url: fm.platform_url as string | null,
    priority: fm.priority as Priority,
    labels: fm.labels as string[],
    created_at,
    updated_at,
    body: parsed.content.replace(/^\n+/, ''),
    filePath,
  };
}

export function serializeTaskFile(task: TaskFile): string {
  const fm = {
    id: task.id,
    type: task.type,
    title: task.title,
    status: task.status,
    platform: task.platform,
    platform_id: task.platform_id,
    platform_url: task.platform_url,
    priority: task.priority,
    labels: task.labels,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
  return matter.stringify(task.body.endsWith('\n') ? task.body : task.body + '\n', fm);
}
