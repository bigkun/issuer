# Issuer v1 MVP Implementation Plan (Superseded by v2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Issuer MVP — a TypeScript CLI tool that receives natural language from programming agents, enhances work items with AI, and pushes them to GitHub Issues via a stdio adapter, with bidirectional sync.

**Architecture:** Monorepo with a core package (CLI, storage, AI engine, adapter dispatcher) and a built-in GitHub adapter package. Core runs as a Node.js CLI process; adapters run as child processes communicating via JSON over stdio.

**Tech Stack:** TypeScript, Node.js 20+, Commander.js (CLI), better-sqlite3 (SQLite), @modelcontextprotocol/sdk (MCP), OpenAI SDK, Vitest (testing)

---

## Project Structure

```
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── create.ts
│   │   │   ├── list.ts
│   │   │   ├── update.ts
│   │   │   ├── link.ts
│   │   │   ├── sync.ts
│   │   │   └── status.ts
│   │   ├── parser.ts               # Command routing
│   │   └── output.ts               # JSON/human output formatting
│   ├── core/
│   │   ├── models.ts               # WorkItem, SyncState, ProjectConfig types
│   │   └── errors.ts               # Domain errors
│   ├── storage/
│   │   ├── database.ts             # SQLite connection & migrations
│   │   ├── work-item-repo.ts       # WorkItem CRUD
│   │   └── project-config-repo.ts  # Config CRUD
│   ├── ai/
│   │   ├── engine.ts               # AI enhancement orchestrator
│   │   ├── prompts/                # Built-in prompt templates
│   │   │   ├── story.ts
│   │   │   └── bug.ts
│   │   └── providers/
│   │       ├── base.ts
│   │       ├── openai.ts
│   │       └── ollama.ts
│   ├── adapter/
│   │   ├── dispatcher.ts           # Spawns adapters, routes requests
│   │   ├── protocol.ts             # stdio JSON message protocol
│   │   ├── registry.ts             # Adapter registration
│   │   └── types.ts                # Adapter interface TypeScript types
│   ├── config/
│   │   ├── manager.ts              # Config loading/saving
│   │   └── wizard.ts               # Interactive issuer init
│   └── github-adapter/             # Built-in GitHub adapter
│       ├── index.ts                # Adapter entry (stdio protocol)
│       ├── github-client.ts        # GitHub REST API client
│       └── mapper.ts               # WorkItem <=> GitHub Issue mapping
├── prompts/                        # External prompt overrides
│   ├── story.md
│   └── bug.md
└── tests/
    ├── unit/
    └── integration/
```

---

## Task 1: Initialize TypeScript Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "@issuer/cli",
  "version": "0.1.0",
  "description": "AI-driven project management gateway for programming agents",
  "type": "module",
  "bin": {
    "issuer": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "better-sqlite3": "^11.9.1",
    "openai": "^4.85.4",
    "yaml": "^2.7.0",
    "inquirer": "^12.3.0",
    "chalk": "^5.4.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/inquirer": "^9.0.7",
    "@types/node": "^20.17.19",
    "tsx": "^4.19.3",
    "typescript": "^5.7.3",
    "vitest": "^3.0.7"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.log
.env
.DS_Store
coverage/
```

**Step 5: Install dependencies**

Run: `npm install`
Expected: All deps installed successfully

**Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: initialize TypeScript project"
```

---

## Task 2: Define Core Domain Models

**Files:**
- Create: `src/core/models.ts`
- Create: `src/core/errors.ts`
- Test: `tests/unit/core/models.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { WorkItemType, WorkItemStatus, SyncState } from '../../../src/core/models.js';

describe('WorkItemType', () => {
  it('should have all required types', () => {
    expect(WorkItemType.EPIC).toBe('epic');
    expect(WorkItemType.STORY).toBe('story');
    expect(WorkItemType.TASK).toBe('task');
    expect(WorkItemType.BUG).toBe('bug');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/models.test.ts`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```typescript
// src/core/models.ts

export enum WorkItemType {
  EPIC = 'epic',
  STORY = 'story',
  TASK = 'task',
  BUG = 'bug',
}

export enum WorkItemStatus {
  DRAFT = 'draft',
  PENDING_SYNC = 'pending_sync',
  SYNCED = 'synced',
  FAILED = 'failed',
  DELETED = 'deleted',
}

export enum SyncState {
  UP_TO_DATE = 'up_to_date',
  LOCAL_MODIFIED = 'local_modified',
  REMOTE_MODIFIED = 'remote_modified',
  CONFLICT = 'conflict',
}

export interface SubTask {
  id: string;
  title: string;
  description?: string;
  depends_on: string[];
  estimated_effort?: string;
  definition_of_done?: string;
}

export interface CodeRef {
  type: 'pr' | 'commit' | 'branch';
  url: string;
  ref: string;
}

export interface WorkItem {
  local_id: string;
  platform_id?: string;
  type: WorkItemType;
  title: string;
  description?: string;
  status: WorkItemStatus;
  sync_state: SyncState;
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignee?: string;
  parent_id?: string;
  labels: string[];
  acceptance_criteria?: string;
  repro_steps?: string;
  sub_tasks: SubTask[];
  code_refs: CodeRef[];
  content_hash: string;
  created_at: string;
  updated_at: string;
  synced_at?: string;
  raw_input: string;
  project: string;
}

export interface ProjectConfig {
  project_name: string;
  platform: string;
  endpoint?: string;
  credentials: Record<string, string>;
  project_id: string;
  push_mode: 'auto-push' | 'confirm-then-push';
  conflict_strategy: 'platform-wins' | 'local-wins' | 'last-write-wins' | 'prompt';
  field_mappings: Record<string, Record<string, string>>;
  defaults: Record<string, unknown>;
  ai: {
    provider: string;
    model: string;
    temperature: number;
    max_tokens: number;
    enhancements: Record<string, boolean>;
  };
}
```

```typescript
// src/core/errors.ts

export class IssuerError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'IssuerError';
  }
}

export class ValidationError extends IssuerError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AdapterError extends IssuerError {
  constructor(message: string, public readonly adapterName: string) {
    super(message, 'ADAPTER_ERROR');
    this.name = 'AdapterError';
  }
}

export class SyncError extends IssuerError {
  constructor(message: string) {
    super(message, 'SYNC_ERROR');
    this.name = 'SyncError';
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/models.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/models.ts src/core/errors.ts tests/unit/core/models.test.ts
git commit -m "feat(core): define domain models and error types"
```

---

## Task 3: SQLite Database Layer

**Files:**
- Create: `src/storage/database.ts`
- Create: `src/storage/work-item-repo.ts`
- Test: `tests/unit/storage/database.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../../src/storage/database.js';

describe('Database', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('should initialize with work_items table', () => {
    const tables = db.listTables();
    expect(tables).toContain('work_items');
  });

  it('should initialize with project_configs table', () => {
    const tables = db.listTables();
    expect(tables).toContain('project_configs');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/storage/database.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/storage/database.ts

import DatabaseConstructor from 'better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';

const DB_DIR = join(homedir(), '.issuer');
const DB_PATH = join(DB_DIR, 'issuer.db');

const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS work_items (
    local_id TEXT PRIMARY KEY,
    platform_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    sync_state TEXT NOT NULL DEFAULT 'up_to_date',
    priority TEXT NOT NULL DEFAULT 'medium',
    assignee TEXT,
    parent_id TEXT,
    labels TEXT DEFAULT '[]',
    acceptance_criteria TEXT,
    repro_steps TEXT,
    sub_tasks TEXT DEFAULT '[]',
    code_refs TEXT DEFAULT '[]',
    content_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced_at TEXT,
    raw_input TEXT NOT NULL,
    project TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_work_items_project ON work_items(project);
  CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
  `,
  `
  CREATE TABLE IF NOT EXISTS project_configs (
    project_name TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_item_id TEXT,
    operation TEXT NOT NULL,
    platform TEXT NOT NULL,
    request_summary TEXT,
    response_summary TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL
  );
  `,
];

export class Database {
  private db: SQLiteDatabase;

  constructor(path: string = DB_PATH) {
    this.db = new DatabaseConstructor(path);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    for (const migration of MIGRATIONS) {
      this.db.exec(migration);
    }
  }

  listTables(): string[] {
    const stmt = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    return stmt.all().map((row: { name: string }) => row.name);
  }

  getDb(): SQLiteDatabase {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/unit/storage/database.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/storage/database.ts tests/unit/storage/database.test.ts
git commit -m "feat(storage): add SQLite database with migrations"
```

---

## Task 4: WorkItem Repository (CRUD)

**Files:**
- Create: `src/storage/work-item-repo.ts`
- Test: `tests/unit/storage/work-item-repo.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../../src/storage/database.js';
import { WorkItemRepository } from '../../../src/storage/work-item-repo.js';
import { WorkItemType, WorkItemStatus, SyncState } from '../../../src/core/models.js';

describe('WorkItemRepository', () => {
  let db: Database;
  let repo: WorkItemRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    repo = new WorkItemRepository(db);
  });

  it('should create and retrieve a work item', () => {
    const item = repo.create({
      type: WorkItemType.STORY,
      title: 'Test story',
      raw_input: 'Create a login page',
      project: 'test-project',
      priority: 'high',
      status: WorkItemStatus.DRAFT,
      sync_state: SyncState.UP_TO_DATE,
      labels: [],
      sub_tasks: [],
      code_refs: [],
      content_hash: 'hash1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(item.local_id).toBeDefined();
    expect(item.title).toBe('Test story');

    const retrieved = repo.getById(item.local_id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe('Test story');
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/storage/work-item-repo.test.ts`
Expected: FAIL

**Step 3: Implement repository**

```typescript
// src/storage/work-item-repo.ts

import type { Database } from './database.js';
import type { WorkItem, WorkItemType, WorkItemStatus, SyncState } from '../core/models.js';
import { randomUUID } from 'crypto';

export interface CreateWorkItemInput {
  type: WorkItemType;
  title: string;
  description?: string;
  raw_input: string;
  project: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: WorkItemStatus;
  sync_state: SyncState;
  platform_id?: string;
  assignee?: string;
  parent_id?: string;
  labels: string[];
  acceptance_criteria?: string;
  repro_steps?: string;
  sub_tasks: { id: string; title: string; depends_on: string[] }[];
  code_refs: { type: 'pr' | 'commit' | 'branch'; url: string; ref: string }[];
  content_hash: string;
  created_at: string;
  updated_at: string;
  synced_at?: string;
}

export class WorkItemRepository {
  constructor(private db: Database) {}

  create(input: CreateWorkItemInput): WorkItem {
    const localId = randomUUID();
    const stmt = this.db.getDb().prepare(`
      INSERT INTO work_items (
        local_id, platform_id, type, title, description, status, sync_state,
        priority, assignee, parent_id, labels, acceptance_criteria, repro_steps,
        sub_tasks, code_refs, content_hash, created_at, updated_at, synced_at, raw_input, project
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      localId,
      input.platform_id ?? null,
      input.type,
      input.title,
      input.description ?? null,
      input.status,
      input.sync_state,
      input.priority,
      input.assignee ?? null,
      input.parent_id ?? null,
      JSON.stringify(input.labels),
      input.acceptance_criteria ?? null,
      input.repro_steps ?? null,
      JSON.stringify(input.sub_tasks),
      JSON.stringify(input.code_refs),
      input.content_hash,
      input.created_at,
      input.updated_at,
      input.synced_at ?? null,
      input.raw_input,
      input.project
    );

    return this.getById(localId)!;
  }

  getById(localId: string): WorkItem | undefined {
    const stmt = this.db.getDb().prepare('SELECT * FROM work_items WHERE local_id = ?');
    const row = stmt.get(localId) as Record<string, unknown> | undefined;
    return row ? this.hydrate(row) : undefined;
  }

  list(filters?: { project?: string; status?: WorkItemStatus; type?: WorkItemType }): WorkItem[] {
    let sql = 'SELECT * FROM work_items WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.project) {
      sql += ' AND project = ?';
      params.push(filters.project);
    }
    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = this.db.getDb().prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map(r => this.hydrate(r));
  }

  update(localId: string, changes: Partial<WorkItem>): WorkItem | undefined {
    const allowedFields = [
      'title', 'description', 'status', 'sync_state', 'priority',
      'assignee', 'parent_id', 'labels', 'acceptance_criteria',
      'repro_steps', 'sub_tasks', 'code_refs', 'content_hash',
      'updated_at', 'synced_at', 'platform_id'
    ];

    const sets: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(changes)) {
      if (allowedFields.includes(key) && value !== undefined) {
        sets.push(`${key} = ?`);
        params.push(Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }

    if (sets.length === 0) return this.getById(localId);

    params.push(localId);
    const sql = `UPDATE work_items SET ${sets.join(', ')} WHERE local_id = ?`;
    this.db.getDb().prepare(sql).run(...params);

    return this.getById(localId);
  }

  delete(localId: string): boolean {
    const stmt = this.db.getDb().prepare('DELETE FROM work_items WHERE local_id = ?');
    const result = stmt.run(localId);
    return result.changes > 0;
  }

  private hydrate(row: Record<string, unknown>): WorkItem {
    return {
      local_id: row.local_id as string,
      platform_id: row.platform_id as string | undefined,
      type: row.type as WorkItemType,
      title: row.title as string,
      description: row.description as string | undefined,
      status: row.status as WorkItemStatus,
      sync_state: row.sync_state as SyncState,
      priority: row.priority as 'critical' | 'high' | 'medium' | 'low',
      assignee: row.assignee as string | undefined,
      parent_id: row.parent_id as string | undefined,
      labels: JSON.parse(row.labels as string),
      acceptance_criteria: row.acceptance_criteria as string | undefined,
      repro_steps: row.repro_steps as string | undefined,
      sub_tasks: JSON.parse(row.sub_tasks as string),
      code_refs: JSON.parse(row.code_refs as string),
      content_hash: row.content_hash as string,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      synced_at: row.synced_at as string | undefined,
      raw_input: row.raw_input as string,
      project: row.project as string,
    };
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/unit/storage/work-item-repo.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/storage/work-item-repo.ts tests/unit/storage/work-item-repo.test.ts
git commit -m "feat(storage): add WorkItem repository with CRUD operations"
```

---

## Task 5: Config Manager & Interactive Wizard

**Files:**
- Create: `src/config/manager.ts`
- Create: `src/config/wizard.ts`
- Test: `tests/unit/config/manager.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../../../src/config/manager.js';
import type { ProjectConfig } from '../../../src/core/models.js';

describe('ConfigManager', () => {
  let manager: ConfigManager;

  beforeEach(() => {
    manager = new ConfigManager(':memory:');
  });

  it('should save and load project config', () => {
    const config: ProjectConfig = {
      project_name: 'test',
      platform: 'github',
      credentials: { token: 'secret' },
      project_id: 'owner/repo',
      push_mode: 'confirm-then-push',
      conflict_strategy: 'prompt',
      field_mappings: {},
      defaults: {},
      ai: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.3,
        max_tokens: 4096,
        enhancements: { content_completion: true },
      },
    };

    manager.save(config);
    const loaded = manager.get('test');
    expect(loaded).toBeDefined();
    expect(loaded?.project_id).toBe('owner/repo');
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/config/manager.test.ts`
Expected: FAIL

**Step 3: Implement config manager**

```typescript
// src/config/manager.ts

import { Database } from '../storage/database.js';
import type { ProjectConfig } from '../core/models.js';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import YAML from 'yaml';

const CONFIG_DIR = join(homedir(), '.issuer');
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');

export class ConfigManager {
  private db: Database;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath);
  }

  save(config: ProjectConfig): void {
    const stmt = this.db.getDb().prepare(`
      INSERT INTO project_configs (project_name, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_name) DO UPDATE SET
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
    `);

    const now = new Date().toISOString();
    stmt.run(
      config.project_name,
      JSON.stringify(config),
      now,
      now
    );
  }

  get(projectName: string): ProjectConfig | undefined {
    const stmt = this.db.getDb().prepare(
      'SELECT config_json FROM project_configs WHERE project_name = ?'
    );
    const row = stmt.get(projectName) as { config_json: string } | undefined;
    return row ? JSON.parse(row.config_json) : undefined;
  }

  list(): ProjectConfig[] {
    const stmt = this.db.getDb().prepare('SELECT config_json FROM project_configs');
    const rows = stmt.all() as { config_json: string }[];
    return rows.map(r => JSON.parse(r.config_json));
  }

  delete(projectName: string): boolean {
    const stmt = this.db.getDb().prepare(
      'DELETE FROM project_configs WHERE project_name = ?'
    );
    const result = stmt.run(projectName);
    return result.changes > 0;
  }

  loadFromYaml(): ProjectConfig[] {
    if (!existsSync(CONFIG_FILE)) return [];
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const data = YAML.parse(content);
    return (data.projects ?? []) as ProjectConfig[];
  }

  saveToYaml(configs: ProjectConfig[]): void {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const data = { projects: configs };
    writeFileSync(CONFIG_FILE, YAML.stringify(data));
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/unit/config/manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config/manager.ts tests/unit/config/manager.test.ts
git commit -m "feat(config): add ConfigManager with SQLite and YAML support"
```

---

## Task 6: AI Enhancement Engine & Prompts

**Files:**
- Create: `src/ai/providers/base.ts`
- Create: `src/ai/providers/openai.ts`
- Create: `src/ai/engine.ts`
- Create: `src/ai/prompts/story.ts`
- Create: `src/ai/prompts/bug.ts`
- Test: `tests/unit/ai/engine.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { AIEngine } from '../../../src/ai/engine.js';

describe('AIEngine', () => {
  it('should enhance a story with structure', async () => {
    const engine = new AIEngine({ provider: 'mock' });
    const result = await engine.enhance({
      raw_text: '用户需要登录功能',
      type_hint: 'story',
    });

    expect(result.title).toBeDefined();
    expect(result.description).toBeDefined();
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/ai/engine.test.ts`
Expected: FAIL

**Step 3: Implement AI engine**

```typescript
// src/ai/providers/base.ts

export interface AIProvider {
  generate(prompt: string): Promise<string>;
}

export interface AIProviderConfig {
  provider: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}
```

```typescript
// src/ai/providers/openai.ts

import OpenAI from 'openai';
import type { AIProvider, AIProviderConfig } from './base.js';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: AIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model ?? 'gpt-4o';
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens ?? 4096;
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    });
    return response.choices[0]?.message?.content ?? '';
  }
}
```

```typescript
// src/ai/engine.ts

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { OpenAIProvider } from './providers/openai.js';
import type { AIProvider, AIProviderConfig } from './providers/base.js';
import type { WorkItemType } from '../core/models.js';
import { storyPrompt } from './prompts/story.js';
import { bugPrompt } from './prompts/bug.js';

const PROMPTS_DIR = join(homedir(), '.issuer', 'prompts');

export interface EnhanceInput {
  raw_text: string;
  type_hint?: WorkItemType;
}

export interface EnhanceOutput {
  title: string;
  description?: string;
  acceptance_criteria?: string;
  repro_steps?: string;
  sub_tasks: { id: string; title: string; depends_on: string[] }[];
}

export class AIEngine {
  private provider: AIProvider;

  constructor(config: AIProviderConfig) {
    if (config.provider === 'openai') {
      this.provider = new OpenAIProvider(config);
    } else {
      this.provider = new MockProvider();
    }
  }

  async enhance(input: EnhanceInput): Promise<EnhanceOutput> {
    const prompt = this.buildPrompt(input);
    const response = await this.provider.generate(prompt);
    return this.parseResponse(response);
  }

  private buildPrompt(input: EnhanceInput): string {
    const type = input.type_hint ?? 'story';
    const externalPath = join(PROMPTS_DIR, `${type}.md`);

    if (existsSync(externalPath)) {
      return readFileSync(externalPath, 'utf-8').replace('{{RAW_INPUT}}', input.raw_text);
    }

    switch (type) {
      case 'story': return storyPrompt(input.raw_text);
      case 'bug': return bugPrompt(input.raw_text);
      default: return storyPrompt(input.raw_text);
    }
  }

  private parseResponse(response: string): EnhanceOutput {
    try {
      return JSON.parse(response);
    } catch {
      return { title: response.slice(0, 100), sub_tasks: [] };
    }
  }
}

class MockProvider implements AIProvider {
  async generate(prompt: string): Promise<string> {
    return JSON.stringify({
      title: 'Enhanced: ' + prompt.slice(0, 50),
      description: prompt,
      sub_tasks: [],
    });
  }
}
```

**Step 4: Run tests**
Run: `npx vitest run tests/unit/ai/engine.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/ai/ tests/unit/ai/
git commit -m "feat(ai): add AI enhancement engine with OpenAI provider"
```

---

## Task 7: GitHub Adapter (stdio Protocol)

**Files:**
- Create: `src/github-adapter/index.ts`
- Create: `src/github-adapter/github-client.ts`
- Create: `src/github-adapter/mapper.ts`
- Test: `tests/unit/github-adapter/mapper.test.ts`

**Implementation:**
- Adapter entry reads JSON from stdin, writes to stdout
- Implements `create_item`, `update_item`, `query_items`, `link_code`, `get_metadata`, `health`
- Maps WorkItem fields to GitHub Issue fields (labels for type, milestone for iteration)
- GitHub REST API v3 client with PAT auth

**Commit:** `git commit -m "feat(github-adapter): add stdio adapter for GitHub Issues"`

---

## Task 8: Adapter Dispatcher

**Files:**
- Create: `src/adapter/types.ts`
- Create: `src/adapter/protocol.ts`
- Create: `src/adapter/dispatcher.ts`
- Create: `src/adapter/registry.ts`

**Implementation:**
- Spawns adapter as child process (stdio)
- JSON-RPC-like message protocol over stdin/stdout
- `initialize` → capability exchange → request/response → `shutdown`
- Health monitoring with auto-restart

**Commit:** `git commit -m "feat(adapter): add adapter dispatcher with stdio protocol"`

---

## Task 9: CLI Commands

**Files:**
- Create: `src/cli/parser.ts`
- Create: `src/cli/output.ts`
- Create: `src/cli/commands/init.ts`
- Create: `src/cli/commands/create.ts`
- Create: `src/cli/commands/list.ts`
- Create: `src/cli/commands/update.ts`
- Create: `src/cli/commands/link.ts`
- Create: `src/cli/commands/sync.ts`
- Create: `src/cli/commands/status.ts`
- Modify: `src/index.ts`

**Commands to implement:**
- `issuer init` — interactive wizard
- `issuer create --type <type> --text <text> [--project <name>]`
- `issuer list [--status <status>] [--type <type>] [--project <name>]`
- `issuer update --id <id> --status <status>`
- `issuer link --work-item <id> --code-ref <ref>`
- `issuer sync [--project <name>] [--direction <push|pull|both>]`
- `issuer status [--id <id>]`

All output JSON by default; `--human` for formatted.

**Commit:** `git commit -m "feat(cli): implement all CLI commands"`

---

## Task 10: Entry Point & Build

**Files:**
- Create: `src/index.ts`

**Implementation:**
- CLI entry using Commander.js
- Register all commands
- Handle global flags (`--verbose`, `--human`, `--config`)

**Build & Verify:**
Run: `npm run build`
Run: `node dist/index.js --help`
Expected: Shows all available commands

**Commit:** `git commit -m "feat: add CLI entry point and build configuration"`

---

## Execution Options

**Plan complete and saved to `docs/plans/2026-05-06-issuer-v1-mvp.md`.**

Two execution options:

1. **Subagent-Driven (this session)** — Dispatch fresh subagent per task, review between tasks, fast iteration
2. **Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?
