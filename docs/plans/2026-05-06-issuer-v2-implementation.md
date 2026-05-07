# Issuer v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild `@issuer/cli` from scratch as a Skill-layer + CLI-layer architecture, following the approved design in `docs/plans/2026-05-06-issuer-v2-design.md`.

**Architecture:** Skill markdown files teach programming agents to refine/breakdown/sync work items into YAML-frontmatter task files under `.issuer/tasks/`. The CLI reads those files and pushes them to GitHub Issues (or the programming agent uses GitHub MCP directly when available).

**Tech Stack:** TypeScript · Node.js 20+ · Commander · gray-matter · @octokit/rest · @inquirer/prompts · Vitest · tsup.

---

## Task Breakdown

| # | Task | Depends On |
|---|---|---|
| 1 | Project scaffolding (package.json, tsconfig, vitest, tsup, .gitignore, README stub) | — |
| 2 | Core types and errors | 1 |
| 3 | `TaskFile` parser/serializer (frontmatter + body) | 2 |
| 4 | `TaskStore` directory scanner | 3 |
| 5 | Config loader (platform config + credentials) | 2 |
| 6 | Adapter interface | 2 |
| 7 | GitHub mapper (TaskFile ↔ Issue) | 6 |
| 8 | GitHub adapter (Octokit wrapper) | 5, 7 |
| 9 | CLI parser + output helpers | 2 |
| 10 | `issuer init` command | 5, 9 |
| 11 | `issuer push` command | 4, 8, 9 |
| 12 | `issuer status` command | 4, 9 |
| 13 | `issuer list-remote` command | 8, 9 |
| 14 | `issuer skill install` command | 9 |
| 15 | `issuer-refine` skill markdown | — |
| 16 | `issuer-breakdown` skill markdown | — |
| 17 | `issuer-sync` skill markdown | — |
| 18 | `issuer` orchestrator skill markdown | 15, 16, 17 |
| 19 | CLI entry + bin wiring | 10–14 |
| 20 | README with end-to-end usage | 19 |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tsup.config.ts`
- Create: `.gitignore`
- Create: `README.md` (stub)

**Step 1: Write `package.json`**

```json
{
  "name": "@issuer/cli",
  "version": "0.1.0",
  "description": "Skill-driven PM gateway: turn colloquial requirements into structured GitHub Issues.",
  "type": "module",
  "bin": { "issuer": "dist/index.js" },
  "main": "dist/index.js",
  "files": ["dist", "skills"],
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "@octokit/rest": "^21.0.0",
    "commander": "^12.1.0",
    "gray-matter": "^4.0.3",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
```

**Step 4: Write `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  splitting: false,
  dts: false,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
});
```

**Step 5: Write `.gitignore`**

```
node_modules/
dist/
coverage/
.DS_Store
*.log
.env
.env.local
.issuer/
!src/**/.issuer/
```

**Step 6: Write `README.md` (stub)**

```markdown
# @issuer/cli

Skill-driven PM gateway for GitHub Issues. Docs coming soon.
```

**Step 7: Install dependencies and verify**

Run: `npm install`
Expected: no errors, `node_modules/` populated.

Run: `npm run typecheck`
Expected: PASS (no source files yet, tsc exits 0 or with "no inputs" warning — acceptable).

**Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts tsup.config.ts .gitignore README.md package-lock.json
git commit -m "chore: scaffold @issuer/cli project"
```

---

## Task 2: Core Types and Errors

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/errors.ts`
- Create: `tests/unit/core/types.test.ts`

**Step 1: Write the failing test `tests/unit/core/types.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { WorkType, Status, Priority, type TaskFile } from '../../../src/core/types.js';
import { IssuerError, TaskParseError } from '../../../src/core/errors.js';

describe('core types', () => {
  it('exposes WorkType enum values', () => {
    expect(WorkType.Bug).toBe('bug');
    expect(WorkType.Story).toBe('story');
    expect(WorkType.Task).toBe('task');
    expect(WorkType.Epic).toBe('epic');
  });

  it('exposes Status enum values', () => {
    expect(Status.Draft).toBe('draft');
    expect(Status.Ready).toBe('ready');
    expect(Status.Synced).toBe('synced');
  });

  it('exposes Priority enum values', () => {
    expect(Priority.Critical).toBe('critical');
    expect(Priority.Low).toBe('low');
  });

  it('TaskFile type compiles with required fields', () => {
    const file: TaskFile = {
      id: 'x',
      type: WorkType.Bug,
      title: 't',
      status: Status.Draft,
      platform: 'github',
      platform_id: null,
      platform_url: null,
      priority: Priority.Medium,
      labels: [],
      created_at: '2026-05-06T00:00:00Z',
      updated_at: '2026-05-06T00:00:00Z',
      body: '',
      filePath: '/tmp/x.md',
    };
    expect(file.id).toBe('x');
  });
});

describe('errors', () => {
  it('IssuerError carries a message', () => {
    const e = new IssuerError('oops');
    expect(e.message).toBe('oops');
    expect(e).toBeInstanceOf(Error);
  });

  it('TaskParseError extends IssuerError', () => {
    const e = new TaskParseError('bad file', '/tmp/a.md');
    expect(e).toBeInstanceOf(IssuerError);
    expect(e.filePath).toBe('/tmp/a.md');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/types.test.ts`
Expected: FAIL with "Cannot find module '../../../src/core/types.js'"

**Step 3: Write `src/core/types.ts`**

```ts
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

export interface Frontmatter {
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
}
```

**Step 4: Write `src/core/errors.ts`**

```ts
export class IssuerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IssuerError';
  }
}

export class TaskParseError extends IssuerError {
  constructor(
    message: string,
    public readonly filePath: string,
  ) {
    super(`${message} (file: ${filePath})`);
    this.name = 'TaskParseError';
  }
}

export class ConfigError extends IssuerError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class AdapterError extends IssuerError {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/types.test.ts`
Expected: PASS (7 tests).

**Step 6: Commit**

```bash
git add src/core tests/unit/core
git commit -m "feat(core): add TaskFile types, enums, and error hierarchy"
```

---

## Task 3: TaskFile Parser/Serializer

**Files:**
- Create: `src/core/task-file.ts`
- Create: `tests/unit/core/task-file.test.ts`
- Create: `tests/fixtures/tasks/sample-bug.md`

**Step 1: Write the fixture `tests/fixtures/tasks/sample-bug.md`**

```markdown
---
id: login-timeout
type: bug
title: Login times out without feedback
status: ready
platform: github
platform_id: null
platform_url: null
priority: high
labels: [auth, ux]
created_at: 2026-05-06T10:00:00Z
updated_at: 2026-05-06T10:00:00Z
---

## Description

Users hit a timeout on login.

## Acceptance Criteria

- [ ] Show a message on timeout
```

**Step 2: Write the failing test `tests/unit/core/task-file.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTaskFile, serializeTaskFile } from '../../../src/core/task-file.js';
import { Status, WorkType, Priority } from '../../../src/core/types.js';
import { TaskParseError } from '../../../src/core/errors.js';

const FIXTURE = 'tests/fixtures/tasks/sample-bug.md';

describe('parseTaskFile', () => {
  it('parses frontmatter and body from a file', async () => {
    const raw = await readFile(FIXTURE, 'utf8');
    const task = parseTaskFile(raw, FIXTURE);
    expect(task.id).toBe('login-timeout');
    expect(task.type).toBe(WorkType.Bug);
    expect(task.status).toBe(Status.Ready);
    expect(task.priority).toBe(Priority.High);
    expect(task.labels).toEqual(['auth', 'ux']);
    expect(task.platform_id).toBeNull();
    expect(task.body).toContain('## Description');
    expect(task.body).toContain('Show a message on timeout');
    expect(task.filePath).toBe(FIXTURE);
  });

  it('throws TaskParseError on missing required fields', () => {
    const bad = '---\ntitle: no id\n---\n\nbody';
    expect(() => parseTaskFile(bad, '/tmp/bad.md')).toThrow(TaskParseError);
  });

  it('throws TaskParseError on invalid type enum', () => {
    const bad = '---\nid: x\ntype: feature\ntitle: t\nstatus: draft\nplatform: github\nplatform_id: null\nplatform_url: null\npriority: low\nlabels: []\ncreated_at: 2026-05-06T00:00:00Z\nupdated_at: 2026-05-06T00:00:00Z\n---\n\n';
    expect(() => parseTaskFile(bad, '/tmp/bad.md')).toThrow(/type/);
  });
});

describe('serializeTaskFile', () => {
  it('round-trips parse → serialize → parse', async () => {
    const raw = await readFile(FIXTURE, 'utf8');
    const task = parseTaskFile(raw, FIXTURE);
    const serialized = serializeTaskFile(task);
    const again = parseTaskFile(serialized, FIXTURE);
    expect(again.id).toBe(task.id);
    expect(again.status).toBe(task.status);
    expect(again.body.trim()).toBe(task.body.trim());
  });

  it('writes platform_id as string after update, serializes quoted if needed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'issuer-'));
    const raw = await readFile(FIXTURE, 'utf8');
    const task = parseTaskFile(raw, FIXTURE);
    task.platform_id = '123';
    task.platform_url = 'https://github.com/a/b/issues/123';
    task.status = Status.Synced;
    const out = serializeTaskFile(task);
    await writeFile(join(dir, 'out.md'), out);
    const parsed = parseTaskFile(out, join(dir, 'out.md'));
    expect(parsed.platform_id).toBe('123');
    expect(parsed.status).toBe(Status.Synced);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/task-file.test.ts`
Expected: FAIL with "Cannot find module '../../../src/core/task-file.js'"

**Step 4: Write `src/core/task-file.ts`**

```ts
import matter from 'gray-matter';
import { TaskParseError } from './errors.js';
import { Priority, Status, TaskFile, WorkType } from './types.js';

const WORK_TYPES = new Set<string>(Object.values(WorkType));
const STATUSES = new Set<string>(Object.values(Status));
const PRIORITIES = new Set<string>(Object.values(Priority));

function requireStr(obj: Record<string, unknown>, key: string, filePath: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new TaskParseError(`frontmatter.${key} must be a non-empty string`, filePath);
  }
  return v;
}

function requireEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: Set<string>,
  filePath: string,
): T {
  const v = obj[key];
  if (typeof v !== 'string' || !allowed.has(v)) {
    throw new TaskParseError(
      `frontmatter.${key} must be one of ${[...allowed].join(', ')} (got ${String(v)})`,
      filePath,
    );
  }
  return v as T;
}

function optStr(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function requireStrArray(obj: Record<string, unknown>, key: string, filePath: string): string[] {
  const v = obj[key];
  if (!Array.isArray(v)) {
    throw new TaskParseError(`frontmatter.${key} must be an array`, filePath);
  }
  return v.map((x) => {
    if (typeof x !== 'string') {
      throw new TaskParseError(`frontmatter.${key} entries must be strings`, filePath);
    }
    return x;
  });
}

export function parseTaskFile(raw: string, filePath: string): TaskFile {
  let data: matter.GrayMatterFile<string>;
  try {
    data = matter(raw);
  } catch (err) {
    throw new TaskParseError(`failed to parse frontmatter: ${(err as Error).message}`, filePath);
  }
  const fm = (data.data ?? {}) as Record<string, unknown>;

  return {
    id: requireStr(fm, 'id', filePath),
    type: requireEnum<WorkType>(fm, 'type', WORK_TYPES, filePath),
    title: requireStr(fm, 'title', filePath),
    status: requireEnum<Status>(fm, 'status', STATUSES, filePath),
    platform: requireStr(fm, 'platform', filePath),
    platform_id: optStr(fm, 'platform_id'),
    platform_url: optStr(fm, 'platform_url'),
    priority: requireEnum<Priority>(fm, 'priority', PRIORITIES, filePath),
    labels: requireStrArray(fm, 'labels', filePath),
    created_at: requireStr(fm, 'created_at', filePath),
    updated_at: requireStr(fm, 'updated_at', filePath),
    body: data.content,
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
  return matter.stringify(task.body, fm);
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/task-file.test.ts`
Expected: PASS (5 tests).

**Step 6: Commit**

```bash
git add src/core/task-file.ts tests/unit/core/task-file.test.ts tests/fixtures/tasks
git commit -m "feat(core): parseTaskFile/serializeTaskFile with gray-matter"
```

---

## Task 4: TaskStore Directory Scanner

**Files:**
- Create: `src/core/task-store.ts`
- Create: `tests/unit/core/task-store.test.ts`

**Step 1: Write the failing test `tests/unit/core/task-store.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../../../src/core/task-store.js';
import { Priority, Status, WorkType } from '../../../src/core/types.js';

async function setup(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'issuer-store-'));
  await mkdir(join(root, '.issuer', 'tasks'), { recursive: true });
  return root;
}

const SAMPLE = `---
id: sample
type: task
title: Sample
status: draft
platform: github
platform_id: null
platform_url: null
priority: medium
labels: []
created_at: 2026-05-06T00:00:00Z
updated_at: 2026-05-06T00:00:00Z
---

body
`;

describe('TaskStore', () => {
  let root: string;

  beforeEach(async () => {
    root = await setup();
  });

  it('list() returns [] when directory empty', async () => {
    const store = new TaskStore(root);
    const items = await store.list();
    expect(items).toEqual([]);
  });

  it('list() parses existing .md files, ignores non-md', async () => {
    const tasksDir = join(root, '.issuer', 'tasks');
    await writeFile(join(tasksDir, '2026-05-06-sample.md'), SAMPLE);
    await writeFile(join(tasksDir, 'notes.txt'), 'ignored');
    const store = new TaskStore(root);
    const items = await store.list();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('sample');
  });

  it('list({ status }) filters by status', async () => {
    const tasksDir = join(root, '.issuer', 'tasks');
    await writeFile(join(tasksDir, 'a.md'), SAMPLE);
    await writeFile(join(tasksDir, 'b.md'), SAMPLE.replace('status: draft', 'status: ready'));
    const store = new TaskStore(root);
    const ready = await store.list({ status: Status.Ready });
    expect(ready).toHaveLength(1);
    expect(ready[0].status).toBe(Status.Ready);
  });

  it('write() persists a TaskFile to disk and preserves filename', async () => {
    const store = new TaskStore(root);
    const filePath = join(root, '.issuer', 'tasks', 'new.md');
    await store.write({
      id: 'new',
      type: WorkType.Story,
      title: 'New story',
      status: Status.Draft,
      platform: 'github',
      platform_id: null,
      platform_url: null,
      priority: Priority.Medium,
      labels: ['x'],
      created_at: '2026-05-06T00:00:00Z',
      updated_at: '2026-05-06T00:00:00Z',
      body: '\n## Description\n\nhello\n',
      filePath,
    });
    const raw = await readFile(filePath, 'utf8');
    expect(raw).toContain('id: new');
    expect(raw).toContain('hello');
  });

  it('ensureLayout() creates .issuer/tasks when missing', async () => {
    const fresh = await mkdtemp(join(tmpdir(), 'issuer-fresh-'));
    const store = new TaskStore(fresh);
    await store.ensureLayout();
    const items = await store.list();
    expect(items).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/task-store.test.ts`
Expected: FAIL with "Cannot find module '../../../src/core/task-store.js'"

**Step 3: Write `src/core/task-store.ts`**

```ts
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseTaskFile, serializeTaskFile } from './task-file.js';
import { Status, TaskFile } from './types.js';

export interface ListFilter {
  status?: Status;
}

export class TaskStore {
  constructor(private readonly projectRoot: string) {}

  private get tasksDir(): string {
    return join(this.projectRoot, '.issuer', 'tasks');
  }

  async ensureLayout(): Promise<void> {
    await mkdir(this.tasksDir, { recursive: true });
  }

  async list(filter: ListFilter = {}): Promise<TaskFile[]> {
    if (!existsSync(this.tasksDir)) return [];
    const entries = await readdir(this.tasksDir);
    const items: TaskFile[] = [];
    for (const name of entries) {
      if (!name.endsWith('.md')) continue;
      const filePath = join(this.tasksDir, name);
      const raw = await readFile(filePath, 'utf8');
      const task = parseTaskFile(raw, filePath);
      if (filter.status && task.status !== filter.status) continue;
      items.push(task);
    }
    items.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return items;
  }

  async write(task: TaskFile): Promise<void> {
    await mkdir(this.tasksDir, { recursive: true });
    const content = serializeTaskFile(task);
    await writeFile(task.filePath, content, 'utf8');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/task-store.test.ts`
Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add src/core/task-store.ts tests/unit/core/task-store.test.ts
git commit -m "feat(core): TaskStore scans .issuer/tasks/ directory"
```

---

## Task 5: Config Loader

**Files:**
- Create: `src/config/loader.ts`
- Create: `tests/unit/config/loader.test.ts`

**Step 1: Write the failing test `tests/unit/config/loader.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectConfig, resolveGitHubToken } from '../../../src/config/loader.js';
import { ConfigError } from '../../../src/core/errors.js';

describe('loadProjectConfig', () => {
  it('reads .issuer/config.yml and returns parsed config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'issuer-cfg-'));
    await mkdir(join(root, '.issuer'), { recursive: true });
    await writeFile(
      join(root, '.issuer', 'config.yml'),
      'version: 1\nplatform: github\ngithub:\n  owner: acme\n  repo: demo\n',
    );
    const cfg = await loadProjectConfig(root);
    expect(cfg.platform).toBe('github');
    expect(cfg.github?.owner).toBe('acme');
    expect(cfg.github?.repo).toBe('demo');
  });

  it('throws ConfigError when config missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'issuer-cfg2-'));
    await expect(loadProjectConfig(root)).rejects.toBeInstanceOf(ConfigError);
  });
});

describe('resolveGitHubToken', () => {
  const KEYS = ['ISSUER_GITHUB_TOKEN', 'GITHUB_TOKEN'];
  const backup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      backup[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  });

  it('prefers ISSUER_GITHUB_TOKEN', async () => {
    process.env.ISSUER_GITHUB_TOKEN = 'a';
    process.env.GITHUB_TOKEN = 'b';
    expect(await resolveGitHubToken()).toBe('a');
  });

  it('falls back to GITHUB_TOKEN', async () => {
    process.env.GITHUB_TOKEN = 'b';
    expect(await resolveGitHubToken()).toBe('b');
  });

  it('returns null when no token configured', async () => {
    expect(await resolveGitHubToken({ credentialsFile: '/non/existent' })).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config/loader.test.ts`
Expected: FAIL with "Cannot find module".

**Step 3: Write `src/config/loader.ts`**

```ts
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import { ConfigError } from '../core/errors.js';

export interface ProjectConfig {
  version: number;
  platform: string;
  github?: { owner: string; repo: string };
}

export async function loadProjectConfig(projectRoot: string): Promise<ProjectConfig> {
  const path = join(projectRoot, '.issuer', 'config.yml');
  if (!existsSync(path)) {
    throw new ConfigError(`Missing .issuer/config.yml in ${projectRoot}. Run "issuer init" first.`);
  }
  const raw = await readFile(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    throw new ConfigError(`Failed to parse config.yml: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ConfigError('config.yml must be a YAML object');
  }
  const obj = parsed as Record<string, unknown>;
  const platform = typeof obj.platform === 'string' ? obj.platform : null;
  if (!platform) throw new ConfigError('config.yml must have "platform"');
  const version = typeof obj.version === 'number' ? obj.version : 1;
  const github = obj.github as { owner?: unknown; repo?: unknown } | undefined;
  if (platform === 'github') {
    if (!github || typeof github.owner !== 'string' || typeof github.repo !== 'string') {
      throw new ConfigError('github platform requires "github.owner" and "github.repo"');
    }
    return { version, platform, github: { owner: github.owner, repo: github.repo } };
  }
  return { version, platform };
}

export interface ResolveTokenOptions {
  credentialsFile?: string;
}

export async function resolveGitHubToken(opts: ResolveTokenOptions = {}): Promise<string | null> {
  if (process.env.ISSUER_GITHUB_TOKEN) return process.env.ISSUER_GITHUB_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const file = opts.credentialsFile ?? join(homedir(), '.issuer', 'credentials.yml');
  if (!existsSync(file)) return null;
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = YAML.parse(raw) as { github?: { token?: string } } | null;
    return parsed?.github?.token ?? null;
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config/loader.test.ts`
Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add src/config tests/unit/config
git commit -m "feat(config): loadProjectConfig and resolveGitHubToken"
```

---

## Task 6: Adapter Interface

**Files:**
- Create: `src/adapter/types.ts`

**Step 1: Write `src/adapter/types.ts`**

```ts
import { TaskFile } from '../core/types.js';

export interface RemoteIssue {
  id: string;
  url: string;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
}

export interface Adapter {
  readonly name: string;
  createIssue(task: TaskFile): Promise<{ id: string; url: string }>;
  updateIssue(task: TaskFile): Promise<{ id: string; url: string }>;
  listRemote(): Promise<RemoteIssue[]>;
}
```

(No test for a pure interface; will be exercised via the GitHub adapter tests.)

**Step 2: Commit**

```bash
git add src/adapter/types.ts
git commit -m "feat(adapter): define Adapter interface"
```

---

## Task 7: GitHub Mapper

**Files:**
- Create: `src/adapter/github/mapper.ts`
- Create: `tests/unit/adapter/github-mapper.test.ts`

**Step 1: Write the failing test `tests/unit/adapter/github-mapper.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { taskToIssueInput, issueToRemote } from '../../../src/adapter/github/mapper.js';
import { Priority, Status, WorkType, TaskFile } from '../../../src/core/types.js';

const baseTask: TaskFile = {
  id: 'login-bug',
  type: WorkType.Bug,
  title: 'Login timeout',
  status: Status.Ready,
  platform: 'github',
  platform_id: null,
  platform_url: null,
  priority: Priority.High,
  labels: ['auth'],
  created_at: '2026-05-06T00:00:00Z',
  updated_at: '2026-05-06T00:00:00Z',
  body: '## Description\n\ntext\n',
  filePath: '/tmp/x.md',
};

describe('taskToIssueInput', () => {
  it('maps title and body', () => {
    const input = taskToIssueInput(baseTask);
    expect(input.title).toBe('Login timeout');
    expect(input.body).toContain('## Description');
  });

  it('merges labels with type and priority tags', () => {
    const input = taskToIssueInput(baseTask);
    expect(input.labels).toContain('auth');
    expect(input.labels).toContain('type:bug');
    expect(input.labels).toContain('priority:high');
  });

  it('dedupes duplicate labels', () => {
    const task = { ...baseTask, labels: ['type:bug', 'auth'] };
    const input = taskToIssueInput(task);
    const bugLabels = input.labels.filter((l) => l === 'type:bug');
    expect(bugLabels).toHaveLength(1);
  });
});

describe('issueToRemote', () => {
  it('maps octokit issue payload to RemoteIssue', () => {
    const remote = issueToRemote({
      number: 42,
      html_url: 'https://github.com/a/b/issues/42',
      title: 'T',
      state: 'open',
      labels: [{ name: 'type:bug' }, 'auth'],
    });
    expect(remote.id).toBe('42');
    expect(remote.url).toBe('https://github.com/a/b/issues/42');
    expect(remote.state).toBe('open');
    expect(remote.labels).toEqual(expect.arrayContaining(['type:bug', 'auth']));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapter/github-mapper.test.ts`
Expected: FAIL — module not found.

**Step 3: Write `src/adapter/github/mapper.ts`**

```ts
import { RemoteIssue } from '../types.js';
import { TaskFile } from '../../core/types.js';

export interface IssueInput {
  title: string;
  body: string;
  labels: string[];
}

export function taskToIssueInput(task: TaskFile): IssueInput {
  const typeLabel = `type:${task.type}`;
  const priorityLabel = `priority:${task.priority}`;
  const labels = Array.from(new Set([...task.labels, typeLabel, priorityLabel]));
  return {
    title: task.title,
    body: task.body.trim() + '\n',
    labels,
  };
}

type RawLabel = string | { name?: string | null };
interface RawIssue {
  number: number;
  html_url: string;
  title: string;
  state: string;
  labels: RawLabel[];
}

export function issueToRemote(issue: RawIssue): RemoteIssue {
  return {
    id: String(issue.number),
    url: issue.html_url,
    title: issue.title,
    state: issue.state === 'closed' ? 'closed' : 'open',
    labels: issue.labels
      .map((l) => (typeof l === 'string' ? l : l.name ?? ''))
      .filter((x) => x.length > 0),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapter/github-mapper.test.ts`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add src/adapter/github/mapper.ts tests/unit/adapter/github-mapper.test.ts
git commit -m "feat(adapter): GitHub mapper for TaskFile ↔ Issue"
```

---

## Task 8: GitHub Adapter (Octokit wrapper)

**Files:**
- Create: `src/adapter/github/client.ts`
- Create: `src/adapter/github/index.ts`
- Create: `tests/unit/adapter/github-adapter.test.ts`

**Step 1: Write the failing test `tests/unit/adapter/github-adapter.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { GitHubAdapter } from '../../../src/adapter/github/index.js';
import { Priority, Status, WorkType, TaskFile } from '../../../src/core/types.js';

function makeTask(overrides: Partial<TaskFile> = {}): TaskFile {
  return {
    id: 'x',
    type: WorkType.Task,
    title: 'T',
    status: Status.Ready,
    platform: 'github',
    platform_id: null,
    platform_url: null,
    priority: Priority.Medium,
    labels: [],
    created_at: '2026-05-06T00:00:00Z',
    updated_at: '2026-05-06T00:00:00Z',
    body: 'body',
    filePath: '/tmp/x.md',
    ...overrides,
  };
}

const fakeClient = () => {
  const create = vi.fn().mockResolvedValue({
    data: { number: 7, html_url: 'https://github.com/a/b/issues/7' },
  });
  const update = vi.fn().mockResolvedValue({
    data: { number: 7, html_url: 'https://github.com/a/b/issues/7' },
  });
  const listForRepo = vi.fn().mockResolvedValue({
    data: [
      { number: 1, html_url: 'u1', title: 'one', state: 'open', labels: [] },
    ],
  });
  return { rest: { issues: { create, update, listForRepo } }, _spies: { create, update, listForRepo } };
};

describe('GitHubAdapter', () => {
  it('createIssue calls octokit.issues.create and returns id/url', async () => {
    const client = fakeClient();
    const adapter = new GitHubAdapter(client as any, 'acme', 'demo');
    const result = await adapter.createIssue(makeTask());
    expect(result.id).toBe('7');
    expect(client._spies.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme', repo: 'demo', title: 'T' }),
    );
  });

  it('updateIssue requires platform_id', async () => {
    const client = fakeClient();
    const adapter = new GitHubAdapter(client as any, 'acme', 'demo');
    await expect(adapter.updateIssue(makeTask())).rejects.toThrow(/platform_id/);
  });

  it('updateIssue calls octokit.issues.update with issue_number', async () => {
    const client = fakeClient();
    const adapter = new GitHubAdapter(client as any, 'acme', 'demo');
    const result = await adapter.updateIssue(makeTask({ platform_id: '7' }));
    expect(result.id).toBe('7');
    expect(client._spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme', repo: 'demo', issue_number: 7 }),
    );
  });

  it('listRemote calls octokit.issues.listForRepo', async () => {
    const client = fakeClient();
    const adapter = new GitHubAdapter(client as any, 'acme', 'demo');
    const items = await adapter.listRemote();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapter/github-adapter.test.ts`
Expected: FAIL — module not found.

**Step 3: Write `src/adapter/github/client.ts`**

```ts
import { Octokit } from '@octokit/rest';

export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token, userAgent: 'issuer-cli' });
}
```

**Step 4: Write `src/adapter/github/index.ts`**

```ts
import type { Octokit } from '@octokit/rest';
import { Adapter, RemoteIssue } from '../types.js';
import { TaskFile } from '../../core/types.js';
import { AdapterError } from '../../core/errors.js';
import { issueToRemote, taskToIssueInput } from './mapper.js';

export class GitHubAdapter implements Adapter {
  readonly name = 'github';

  constructor(
    private readonly client: Octokit,
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  async createIssue(task: TaskFile): Promise<{ id: string; url: string }> {
    const input = taskToIssueInput(task);
    try {
      const res = await this.client.rest.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: input.title,
        body: input.body,
        labels: input.labels,
      });
      return { id: String(res.data.number), url: res.data.html_url };
    } catch (err) {
      throw new AdapterError(`GitHub create failed: ${(err as Error).message}`, err);
    }
  }

  async updateIssue(task: TaskFile): Promise<{ id: string; url: string }> {
    if (!task.platform_id) {
      throw new AdapterError('cannot update without platform_id');
    }
    const input = taskToIssueInput(task);
    try {
      const res = await this.client.rest.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: Number(task.platform_id),
        title: input.title,
        body: input.body,
        labels: input.labels,
      });
      return { id: String(res.data.number), url: res.data.html_url };
    } catch (err) {
      throw new AdapterError(`GitHub update failed: ${(err as Error).message}`, err);
    }
  }

  async listRemote(): Promise<RemoteIssue[]> {
    try {
      const res = await this.client.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        per_page: 100,
      });
      return res.data.map((issue) =>
        issueToRemote({
          number: issue.number,
          html_url: issue.html_url,
          title: issue.title,
          state: issue.state,
          labels: issue.labels as Array<string | { name?: string | null }>,
        }),
      );
    } catch (err) {
      throw new AdapterError(`GitHub list failed: ${(err as Error).message}`, err);
    }
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapter/github-adapter.test.ts`
Expected: PASS (4 tests).

**Step 6: Commit**

```bash
git add src/adapter/github tests/unit/adapter/github-adapter.test.ts
git commit -m "feat(adapter): GitHubAdapter implementation with Octokit"
```

---

## Task 9: CLI Parser + Output Helpers

**Files:**
- Create: `src/cli/output.ts`
- Create: `src/cli/parser.ts`

**Step 1: Write `src/cli/output.ts`**

```ts
/* eslint-disable no-console */
export function info(msg: string): void {
  console.log(msg);
}

export function success(msg: string): void {
  console.log(`✓ ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`! ${msg}`);
}

export function error(msg: string): void {
  console.error(`✗ ${msg}`);
}

export function table(rows: Record<string, string | number>[]): void {
  if (rows.length === 0) {
    console.log('(empty)');
    return;
  }
  console.table(rows);
}
```

**Step 2: Write `src/cli/parser.ts`** (skeleton; commands registered in Task 19)

```ts
import { Command } from 'commander';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('issuer')
    .description('Skill-driven PM gateway for GitHub Issues.')
    .version('0.1.0');
  return program;
}
```

**Step 3: Commit**

```bash
git add src/cli/output.ts src/cli/parser.ts
git commit -m "feat(cli): output helpers and Commander program skeleton"
```

---

## Task 10 — `init` command

**Files**: `src/commands/init.ts`, `tests/commands/init.test.ts`

**Step 1: Test (`tests/commands/init.test.ts`)**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../src/commands/init.js';

describe('runInit', () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'issuer-init-')); });

  it('creates .issuer/config.yml with provided platform/owner/repo', async () => {
    await runInit({ cwd, platform: 'github', owner: 'acme', repo: 'demo', nonInteractive: true });
    const cfg = readFileSync(join(cwd, '.issuer', 'config.yml'), 'utf8');
    expect(cfg).toContain('platform: github');
    expect(cfg).toContain('owner: acme');
    expect(cfg).toContain('repo: demo');
    expect(existsSync(join(cwd, '.issuer', 'tasks'))).toBe(true);
  });

  it('refuses to overwrite existing config without --force', async () => {
    await runInit({ cwd, platform: 'github', owner: 'a', repo: 'b', nonInteractive: true });
    await expect(
      runInit({ cwd, platform: 'github', owner: 'a', repo: 'b', nonInteractive: true })
    ).rejects.toThrow(/already initialised/i);
  });
});
```

**Step 2: Implementation (`src/commands/init.ts`)**

```ts
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { input, select } from '@inquirer/prompts';
import { stringify as yamlStringify } from 'yaml';
import { ConfigError } from '../core/errors.js';

export interface InitOptions {
  cwd: string;
  platform?: string;
  owner?: string;
  repo?: string;
  force?: boolean;
  nonInteractive?: boolean;
}

export async function runInit(opts: InitOptions): Promise<void> {
  const issuerDir = join(opts.cwd, '.issuer');
  const cfgPath = join(issuerDir, 'config.yml');
  if (existsSync(cfgPath) && !opts.force) {
    throw new ConfigError(`Project already initialised at ${cfgPath}. Use --force to overwrite.`);
  }

  let platform = opts.platform;
  let owner = opts.owner;
  let repo = opts.repo;

  if (!opts.nonInteractive) {
    if (!platform) {
      platform = await select({
        message: 'Select platform',
        choices: [{ name: 'GitHub Issues', value: 'github' }],
      });
    }
    if (platform === 'github') {
      if (!owner) owner = await input({ message: 'GitHub owner (user or org)' });
      if (!repo) repo = await input({ message: 'GitHub repo name' });
    }
  }

  if (!platform || !owner || !repo) {
    throw new ConfigError('platform/owner/repo are required');
  }

  mkdirSync(join(issuerDir, 'tasks'), { recursive: true });
  const cfg = { platform, owner, repo, default_labels: [] as string[] };
  writeFileSync(cfgPath, yamlStringify(cfg), 'utf8');
}
```

**Step 3: Commit**

```bash
git add src/commands/init.ts tests/commands/init.test.ts
git commit -m "feat(cli): init command scaffolds .issuer layout"
```

---

## Task 11 — `push` command

**Files**: `src/commands/push.ts`, `tests/commands/push.test.ts`

**Step 1: Test** — fake adapter, two ready tasks (one with `platform_id`, one without), expect 1 created + 1 updated; verify task files rewritten with `status: synced`.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPush } from '../../src/commands/push.js';
import type { Adapter } from '../../src/adapter/interface.js';

function setup(): { cwd: string; adapter: Adapter; created: string[]; updated: string[] } {
  const cwd = mkdtempSync(join(tmpdir(), 'issuer-push-'));
  mkdirSync(join(cwd, '.issuer', 'tasks'), { recursive: true });
  const fm1 = `---\nid: 2026-05-06-a\ntype: task\ntitle: A\nstatus: ready\nplatform: github\nplatform_id: null\nplatform_url: null\npriority: medium\nlabels: []\ncreated_at: 2026-05-06T00:00:00Z\nupdated_at: 2026-05-06T00:00:00Z\n---\nA body`;
  const fm2 = `---\nid: 2026-05-06-b\ntype: task\ntitle: B\nstatus: ready\nplatform: github\nplatform_id: "42"\nplatform_url: https://x/42\npriority: medium\nlabels: []\ncreated_at: 2026-05-06T00:00:00Z\nupdated_at: 2026-05-06T00:00:00Z\n---\nB body`;
  writeFileSync(join(cwd, '.issuer', 'tasks', '2026-05-06-a.md'), fm1);
  writeFileSync(join(cwd, '.issuer', 'tasks', '2026-05-06-b.md'), fm2);
  const created: string[] = []; const updated: string[] = [];
  const adapter: Adapter = {
    name: 'github',
    async createIssue(t) { created.push(t.id); return { id: '99', url: 'https://x/99' }; },
    async updateIssue(t) { updated.push(t.id); return { id: t.platform_id!, url: t.platform_url! }; },
    async listRemote() { return []; },
  };
  return { cwd, adapter, created, updated };
}

describe('runPush', () => {
  it('creates new and updates existing, marks files synced', async () => {
    const { cwd, adapter, created, updated } = setup();
    const summary = await runPush({ cwd, adapter });
    expect(summary.created).toHaveLength(1);
    expect(summary.updated).toHaveLength(1);
    expect(created).toEqual(['2026-05-06-a']);
    expect(updated).toEqual(['2026-05-06-b']);
    const a = readFileSync(join(cwd, '.issuer', 'tasks', '2026-05-06-a.md'), 'utf8');
    expect(a).toMatch(/status: synced/);
    expect(a).toMatch(/platform_id: ['"]?99['"]?/);
  });
});
```

**Step 2: Implementation (`src/commands/push.ts`)**

```ts
import { writeFileSync } from 'node:fs';
import { TaskStore } from '../core/task-store.js';
import { serializeTaskFile } from '../core/task-file.js';
import { Status, TaskFile } from '../core/types.js';
import type { Adapter } from '../adapter/interface.js';

export interface PushOptions { cwd: string; adapter: Adapter; }
export interface PushSummary {
  created: TaskFile[];
  updated: TaskFile[];
  skipped: TaskFile[];
}

export async function runPush(opts: PushOptions): Promise<PushSummary> {
  const store = new TaskStore(opts.cwd);
  const ready = await store.list({ status: Status.Ready });
  const created: TaskFile[] = []; const updated: TaskFile[] = []; const skipped: TaskFile[] = [];

  for (const task of ready) {
    if (task.platform !== opts.adapter.name) { skipped.push(task); continue; }
    const isUpdate = !!task.platform_id;
    const result = isUpdate
      ? await opts.adapter.updateIssue(task)
      : await opts.adapter.createIssue(task);
    const next: TaskFile = {
      ...task,
      platform_id: result.id,
      platform_url: result.url,
      status: Status.Synced,
      updated_at: new Date().toISOString(),
    };
    writeFileSync(task.filePath, serializeTaskFile(next), 'utf8');
    (isUpdate ? updated : created).push(next);
  }
  return { created, updated, skipped };
}
```

**Step 3: Commit**

```bash
git add src/commands/push.ts tests/commands/push.test.ts
git commit -m "feat(cli): push command syncs ready tasks via adapter"
```

---

## Task 12 — `status` command

**Files**: `src/commands/status.ts`, `tests/commands/status.test.ts`

**Step 1: Test** — write 3 task files (draft/ready/synced), expect counts `{ draft:1, ready:1, synced:1, total:3 }`.

**Step 2: Implementation**

```ts
import { TaskStore } from '../core/task-store.js';
import { Status } from '../core/types.js';

export interface StatusSummary {
  draft: number; ready: number; synced: number; total: number;
}

export async function runStatus(opts: { cwd: string }): Promise<StatusSummary> {
  const store = new TaskStore(opts.cwd);
  const all = await store.list();
  const summary: StatusSummary = { draft: 0, ready: 0, synced: 0, total: all.length };
  for (const t of all) {
    if (t.status === Status.Draft) summary.draft++;
    else if (t.status === Status.Ready) summary.ready++;
    else if (t.status === Status.Synced) summary.synced++;
  }
  return summary;
}
```

**Step 3: Commit**

```bash
git add src/commands/status.ts tests/commands/status.test.ts
git commit -m "feat(cli): status command summarises local tasks"
```

---

## Task 13 — `list-remote` command

**Files**: `src/commands/list-remote.ts`, `tests/commands/list-remote.test.ts`

**Step 1: Test** — fake adapter returns 2 issues; runListRemote returns same array.

**Step 2: Implementation**

```ts
import type { Adapter, RemoteIssue } from '../adapter/interface.js';

export async function runListRemote(opts: { adapter: Adapter }): Promise<RemoteIssue[]> {
  return opts.adapter.listRemote();
}
```

**Step 3: Commit**

```bash
git add src/commands/list-remote.ts tests/commands/list-remote.test.ts
git commit -m "feat(cli): list-remote command via adapter"
```

---

## Task 14 — `skill install` command

**Files**: `src/commands/skill-install.ts`, `tests/commands/skill-install.test.ts`, plus 4 bundled skill markdown files (Task 15-18 produce the actual content; this task wires copy logic).

**Step 1: Test** — given a temp `bundledSkillsDir` containing `issuer.md`, copy into a temp `targetPath`; assert file exists and content matches.

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSkillInstall } from '../../src/commands/skill-install.js';

describe('runSkillInstall', () => {
  it('copies all bundled skills into target directory', async () => {
    const src = mkdtempSync(join(tmpdir(), 'bundled-'));
    const dst = mkdtempSync(join(tmpdir(), 'target-'));
    mkdirSync(join(src, 'issuer'), { recursive: true });
    writeFileSync(join(src, 'issuer', 'SKILL.md'), '# issuer skill');
    const result = await runSkillInstall({ bundledSkillsDir: src, targetPath: dst });
    expect(result.installed).toContain('issuer');
    expect(existsSync(join(dst, 'issuer', 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(dst, 'issuer', 'SKILL.md'), 'utf8')).toBe('# issuer skill');
  });
});
```

**Step 2: Implementation (`src/commands/skill-install.ts`)**

```ts
import { readdirSync, mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface SkillInstallOptions {
  bundledSkillsDir: string;
  targetPath?: string;
}
export interface SkillInstallResult { targetPath: string; installed: string[]; }

const CANDIDATE_TARGETS = ['.agents/skills', '.claude/skills', '.qoder/skills'];

export function detectTargetPath(): string {
  for (const c of CANDIDATE_TARGETS) {
    const p = join(homedir(), c);
    if (existsSync(p)) return p;
  }
  return join(homedir(), CANDIDATE_TARGETS[0]);
}

function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry); const d = join(dst, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

export async function runSkillInstall(opts: SkillInstallOptions): Promise<SkillInstallResult> {
  const target = opts.targetPath ?? detectTargetPath();
  mkdirSync(target, { recursive: true });
  const installed: string[] = [];
  for (const name of readdirSync(opts.bundledSkillsDir)) {
    const src = join(opts.bundledSkillsDir, name);
    if (!statSync(src).isDirectory()) continue;
    copyDir(src, join(target, name));
    installed.push(name);
  }
  return { targetPath: target, installed };
}
```

**Step 3: Commit**

```bash
git add src/commands/skill-install.ts tests/commands/skill-install.test.ts
git commit -m "feat(cli): skill install copies bundled skills to agent skills dir"
```

---

## Task 15 — Skill: `issuer-refine`

**File**: `skills/issuer-refine/SKILL.md`

Defines a Skill that takes raw user text (selection / paragraph / whole file) and rewrites it into a clear PM-ready brief with sections: **Problem**, **Goal**, **Non-goals**, **Acceptance Criteria**, **Open Questions**. Output mode (replace original vs new file) is asked up-front. No external tools, no network. Pure prompt contract.

**Step 1**: Author markdown with frontmatter `name: issuer-refine`, `description: Refine raw requirement text into a structured PM brief`, then INPUTS / OUTPUT / STEPS / GUARDRAILS sections.

**Step 2**: Manual smoke — open in agent, feed a paragraph, verify structured output.

**Step 3: Commit**

```bash
git add skills/issuer-refine/SKILL.md
git commit -m "feat(skill): issuer-refine for structuring raw requirements"
```

---

## Task 16 — Skill: `issuer-breakdown`

**File**: `skills/issuer-breakdown/SKILL.md`

Takes a refined brief and emits one Markdown file per work item under `.issuer/tasks/YYYY-MM-DD-<slug>.md`, each with the canonical frontmatter (status `draft`, no `platform_id`). Skill must:
- Read `.issuer/config.yml` to learn `platform` + `default_labels`.
- Generate slugs from title (lowercase, hyphenated, ASCII).
- Refuse to overwrite existing files unless explicitly instructed.

**Step 3: Commit**

```bash
git add skills/issuer-breakdown/SKILL.md
git commit -m "feat(skill): issuer-breakdown emits per-task .md files"
```

---

## Task 17 — Skill: `issuer-sync`

**File**: `skills/issuer-sync/SKILL.md`

Dual-channel sync orchestrator (MCP-first, CLI fallback):

1. Detect whether a GitHub MCP server is available in the agent session.
2. If yes: call MCP tools (`create_issue`, `update_issue`) directly per ready task and patch the local frontmatter (`platform_id`, `platform_url`, `status: synced`).
3. If no: shell out to `issuer push` and parse its summary.
4. In both cases: only touch tasks with `status: ready`; report a per-task table.

**Step 3: Commit**

```bash
git add skills/issuer-sync/SKILL.md
git commit -m "feat(skill): issuer-sync MCP-first with CLI fallback"
```

---

## Task 18 — Skill: `issuer` orchestrator

**File**: `skills/issuer/SKILL.md`

Three-stage pipeline that delegates to the three atomic skills:

- **Stage 1 — Refine**: invoke `issuer-refine`; ask user to confirm before continuing.
- **Stage 2 — Breakdown**: invoke `issuer-breakdown`; show generated file list, ask user to flip selected files from `draft` → `ready`.
- **Stage 3 — Sync**: invoke `issuer-sync`.

Each stage is a hard checkpoint — the orchestrator never auto-advances without explicit user approval.

**Step 3: Commit**

```bash
git add skills/issuer/SKILL.md
git commit -m "feat(skill): issuer orchestrator chains refine→breakdown→sync"
```

---

## Task 19 — CLI entry + bin wiring

**Files**: `src/index.ts`, `src/cli/program.ts`, update `package.json` `bin` and `tsup` entry list.

**Step 1: Test (`tests/cli/program.test.ts`)** — build the program, invoke `program.parseAsync(['node','issuer','--help'])`, assert exit 0 and help contains all subcommand names: `init`, `push`, `status`, `list-remote`, `skill`.

**Step 2: Implementation (`src/cli/program.ts`)**

```ts
import { createProgram } from './parser.js';
import { runInit } from '../commands/init.js';
import { runPush } from '../commands/push.js';
import { runStatus } from '../commands/status.js';
import { runListRemote } from '../commands/list-remote.js';
import { runSkillInstall } from '../commands/skill-install.js';
import { GitHubAdapter } from '../adapter/github/index.js';
import { loadProjectConfig, resolveGitHubToken } from '../core/config.js';
import { info, success, error, table } from './output.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function buildAdapter(cwd: string) {
  const cfg = await loadProjectConfig(cwd);
  if (cfg.platform !== 'github') throw new Error(`Unsupported platform: ${cfg.platform}`);
  const token = resolveGitHubToken();
  return new GitHubAdapter({ token, owner: cfg.owner, repo: cfg.repo });
}

export function buildProgram() {
  const program = createProgram();

  program.command('init')
    .option('--platform <p>')
    .option('--owner <o>').option('--repo <r>').option('--force')
    .option('-y, --yes', 'non-interactive')
    .action(async (opts) => {
      await runInit({ cwd: process.cwd(), ...opts, nonInteractive: !!opts.yes });
      success('Initialised .issuer/');
    });

  program.command('push').action(async () => {
    const adapter = await buildAdapter(process.cwd());
    const s = await runPush({ cwd: process.cwd(), adapter });
    success(`Pushed: ${s.created.length} created, ${s.updated.length} updated, ${s.skipped.length} skipped`);
  });

  program.command('status').action(async () => {
    const s = await runStatus({ cwd: process.cwd() });
    table([['Status', 'Count'], ['draft', String(s.draft)], ['ready', String(s.ready)], ['synced', String(s.synced)], ['total', String(s.total)]]);
  });

  program.command('list-remote').action(async () => {
    const adapter = await buildAdapter(process.cwd());
    const items = await runListRemote({ adapter });
    table([['#', 'Title', 'State', 'URL'], ...items.map(i => [i.id, i.title, i.state, i.url])]);
  });

  const skill = program.command('skill');
  skill.command('install')
    .option('--target <path>')
    .action(async (opts) => {
      const bundled = join(fileURLToPath(new URL('../../skills', import.meta.url)));
      const r = await runSkillInstall({ bundledSkillsDir: bundled, targetPath: opts.target });
      success(`Installed ${r.installed.length} skill(s) into ${r.targetPath}`);
    });

  return program;
}
```

**`src/index.ts`** (bin entry):

```ts
#!/usr/bin/env node
import { buildProgram } from './cli/program.js';
import { error } from './cli/output.js';

buildProgram().parseAsync(process.argv).catch((e: unknown) => {
  error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
```

Update `package.json`:

```json
{
  "bin": { "issuer": "dist/index.js" },
  "files": ["dist", "skills"]
}
```

`tsup.config.ts` must include shebang preservation (`banner` or rely on tsup's `--shims`); ensure `dist/index.js` keeps the `#!/usr/bin/env node` line.

**Step 3: Commit**

```bash
git add src/index.ts src/cli/program.ts tests/cli/program.test.ts package.json tsup.config.ts
git commit -m "feat(cli): wire all subcommands and bin entry"
```

---

## Task 20 — README

**File**: `README.md`

Replace stub with: 1-paragraph intro, install (`npm i -g @issuer/cli`), quick start (`issuer init` → invoke `issuer` skill in agent → `issuer push`), command reference table, MCP-vs-CLI sync notes, link to design doc.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README quick start and command reference"
```

---

## Done criteria

- All 20 tasks committed with green Vitest suite (`npm test`).
- `npm run build` produces working `dist/index.js` with shebang.
- `node dist/index.js --help` lists `init | push | status | list-remote | skill`.
- `node dist/index.js init -y --platform github --owner X --repo Y` creates valid `.issuer/`.
- `skills/` directory ships 4 SKILL.md files copied by `issuer skill install`.
- README documents the full loop.

## Handoff

Next step is execution. The user can choose:

1. **Subagent-Driven (this session)** — dispatch each task as a subagent in the current chat.
2. **Parallel Session (separate)** — open a new session per task chunk.
