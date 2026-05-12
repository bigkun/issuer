import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { ConfigError } from './errors.js';
import type { McpCapabilities } from '../adapter/registry.js';

export interface ProjectConfig {
  platform: string;
  owner: string;
  repo: string;
  default_labels: string[];
  mcp_capabilities?: McpCapabilities;
  dedup?: DedupConfig;
  /** Yunxiao: default assignedTo userId for create (auto-fetched via getCurrentUser) */
  assigned_to?: string;
  /** Yunxiao: workitem type mapping (auto-fetched via ListWorkitemTypes) */
  workitem_type_map?: WorkitemTypeMap;
}

/** Yunxiao workitem type mapping (categoryId → workitemTypeId). */
export interface WorkitemTypeMap {
  Req?: string;   // 需求类型
  Bug?: string;   // 缺陷类型
  Task?: string;  // 任务类型
}

export interface DedupConfig {
  enabled: boolean;
  threshold: number;
  ttl_hours: number;
  on_match: 'prompt' | 'skip' | 'continue';
}

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  enabled: true,
  threshold: 0.85,
  ttl_hours: 24,
  on_match: 'prompt',
};

/** Parse workitem_type_map from raw config data. */
function parseWorkitemTypeMap(raw: unknown): WorkitemTypeMap | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const map = raw as Record<string, unknown>;
  return {
    Req: typeof map.Req === 'string' ? map.Req : undefined,
    Bug: typeof map.Bug === 'string' ? map.Bug : undefined,
    Task: typeof map.Task === 'string' ? map.Task : undefined,
  };
}

export async function loadProjectConfig(projectRoot: string): Promise<ProjectConfig> {
  const cfgPath = join(projectRoot, '.issuer', 'config.yml');
  if (!existsSync(cfgPath)) {
    throw new ConfigError(`Missing ${cfgPath}. Run \`issuer init\` first.`);
  }
  let raw: unknown;
  try {
    raw = yamlParse(readFileSync(cfgPath, 'utf8'));
  } catch (e) {
    throw new ConfigError(`Failed to parse ${cfgPath}`, e);
  }
  if (!raw || typeof raw !== 'object') {
    throw new ConfigError(`${cfgPath} must contain a mapping`);
  }
  const data = raw as Record<string, unknown>;
  for (const f of ['platform', 'owner', 'repo'] as const) {
    if (typeof data[f] !== 'string' || !data[f]) {
      throw new ConfigError(`${cfgPath}: '${f}' must be a non-empty string`);
    }
  }
  const labels = data.default_labels;
  if (labels !== undefined && (!Array.isArray(labels) || !labels.every((l) => typeof l === 'string'))) {
    throw new ConfigError(`${cfgPath}: 'default_labels' must be an array of strings`);
  }
  // Parse mcp_capabilities (optional section)
  let mcp_capabilities: McpCapabilities | undefined;
  if (data.mcp_capabilities && typeof data.mcp_capabilities === 'object') {
    const mc = data.mcp_capabilities as Record<string, unknown>;
    mcp_capabilities = {
      channel: mc.channel === 'cli' ? 'cli' : 'mcp',
      probed_at: typeof mc.probed_at === 'string' ? mc.probed_at : new Date().toISOString(),
      tools: Array.isArray(mc.tools) ? (mc.tools as string[]) : [],
      capabilities: typeof mc.capabilities === 'object' && mc.capabilities !== null
        ? mc.capabilities as McpCapabilities['capabilities']
        : { create: true, update: true, search: true, read: true, comment: true },
    };
  }

  return {
    platform: data.platform as string,
    owner: data.owner as string,
    repo: data.repo as string,
    default_labels: (labels as string[] | undefined) ?? [],
    mcp_capabilities,
    assigned_to: data.assigned_to as string | undefined,
    workitem_type_map: parseWorkitemTypeMap(data.workitem_type_map),
  };
}

/** Save project config with updated fields. */
export function saveProjectConfig(projectRoot: string, updates: Partial<ProjectConfig>): void {
  const cfgPath = join(projectRoot, '.issuer', 'config.yml');
  if (!existsSync(cfgPath)) {
    throw new ConfigError(`Missing ${cfgPath}. Cannot save.`);
  }
  const existing = yamlParse(readFileSync(cfgPath, 'utf8')) as Record<string, unknown>;
  const merged = { ...existing, ...updates };
  writeFileSync(cfgPath, yamlStringify(merged), 'utf8');
}

export interface TokenResolveOptions {
  env?: NodeJS.ProcessEnv;
  /** Project root — used to look up `.issuer/credentials.yml` at project level. */
  projectRoot?: string;
  /** Override path for the global credentials file (defaults to `~/.issuer/credentials.yml`). */
  credentialsFile?: string;
}

// ---------------------------------------------------------------------------
// Platform → token key mapping
// ---------------------------------------------------------------------------

const PLATFORM_TOKEN_KEYS: Record<string, {
  envPrimary: string;
  envFallback: string;
  credentialsKey: string;
}> = {
  github:  { envPrimary: 'ISSUER_GITHUB_TOKEN',  envFallback: 'GITHUB_TOKEN',  credentialsKey: 'github_token' },
  gitlab:  { envPrimary: 'ISSUER_GITLAB_TOKEN',  envFallback: 'GITLAB_TOKEN',  credentialsKey: 'gitlab_token' },
  yunxiao: { envPrimary: 'ISSUER_YUNXIAO_TOKEN', envFallback: 'YUNXIAO_TOKEN', credentialsKey: 'yunxiao_token' },
};

function readTokenFromCredentialsFile(filePath: string, key: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    const data = yamlParse(readFileSync(filePath, 'utf8')) as Record<string, unknown> | null;
    const token = data?.[key];
    if (typeof token === 'string' && token) return token;
  } catch {
    // ignore parse errors — fall through to next source
  }
  return null;
}

/**
 * Resolve a platform token with 4-level priority:
 * 1. `ISSUER_<PLATFORM>_TOKEN` env var
 * 2. `<PLATFORM>_TOKEN` env var
 * 3. Project-level `.issuer/credentials.yml`
 * 4. Global `~/.issuer/credentials.yml`
 */
export function resolveToken(platform: string, opts: TokenResolveOptions = {}): string {
  const env = opts.env ?? process.env;
  const keys = PLATFORM_TOKEN_KEYS[platform];
  if (!keys) {
    throw new ConfigError(`Unknown platform: ${platform}. Cannot resolve token.`);
  }

  // 1. Primary environment variable
  if (env[keys.envPrimary]) return env[keys.envPrimary] as string;
  // 2. Fallback environment variable
  if (env[keys.envFallback]) return env[keys.envFallback] as string;

  // 3. Project-level credentials file (.issuer/credentials.yml)
  if (opts.projectRoot) {
    const projectCredPath = join(opts.projectRoot, '.issuer', 'credentials.yml');
    const token = readTokenFromCredentialsFile(projectCredPath, keys.credentialsKey);
    if (token) return token;
  }

  // 4. Global credentials file (~/.issuer/credentials.yml)
  const globalCredPath = opts.credentialsFile ?? join(homedir(), '.issuer', 'credentials.yml');
  const token = readTokenFromCredentialsFile(globalCredPath, keys.credentialsKey);
  if (token) return token;

  throw new ConfigError(
    `No ${platform} token found. Set ${keys.envPrimary}, ${keys.envFallback}, ` +
    `or write ${keys.credentialsKey}: <token> to .issuer/credentials.yml (project) or ~/.issuer/credentials.yml (global)`,
  );
}

/**
 * @deprecated Use `resolveToken('github', opts)` instead.
 */
export function resolveGitHubToken(opts: TokenResolveOptions = {}): string {
  return resolveToken('github', opts);
}

// ---------------------------------------------------------------------------
// Token helpers: has / write / validate
// ---------------------------------------------------------------------------

/** Check whether a token exists for the given platform (without throwing). */
export function hasPlatformToken(platform: string, opts: TokenResolveOptions = {}): boolean {
  try {
    resolveToken(platform, opts);
    return true;
  } catch {
    return false;
  }
}

/** Return the token source description for display, or null if none found. */
export function findTokenSource(platform: string, opts: TokenResolveOptions = {}): { token: string; source: string } | null {
  const env = opts.env ?? process.env;
  const keys = PLATFORM_TOKEN_KEYS[platform];
  if (!keys) return null;

  if (env[keys.envPrimary]) return { token: env[keys.envPrimary] as string, source: keys.envPrimary };
  if (env[keys.envFallback]) return { token: env[keys.envFallback] as string, source: keys.envFallback };

  if (opts.projectRoot) {
    const projectCredPath = join(opts.projectRoot, '.issuer', 'credentials.yml');
    const token = readTokenFromCredentialsFile(projectCredPath, keys.credentialsKey);
    if (token) return { token, source: projectCredPath };
  }

  const globalCredPath = opts.credentialsFile ?? join(homedir(), '.issuer', 'credentials.yml');
  const token = readTokenFromCredentialsFile(globalCredPath, keys.credentialsKey);
  if (token) return { token, source: globalCredPath };

  return null;
}

/** Write a platform token to a credentials file (creates if needed). */
export function writeCredentialsFile(filePath: string, platform: string, token: string): void {
  const keys = PLATFORM_TOKEN_KEYS[platform];
  if (!keys) throw new ConfigError(`Unknown platform: ${platform}`);

  let existing: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    try {
      const parsed = yamlParse(readFileSync(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object') existing = parsed as Record<string, unknown>;
    } catch {
      // overwrite on parse error
    }
  }

  existing[keys.credentialsKey] = token;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, yamlStringify(existing), 'utf8');
}

/**
 * Validate a token by querying the issue list endpoint.
 * Uses repo-scoped APIs instead of /user, because fine-grained tokens
 * may not have user-level read permission but do have repo issue access.
 * Returns `{ valid: true }` on success or `{ valid: false, error }` on failure.
 */
export async function validateToken(
  platform: string,
  token: string,
  opts?: { owner?: string; repo?: string; host?: string; fetch?: typeof globalThis.fetch },
): Promise<{ valid: true } | { valid: false; error: string }> {
  const httpFetch = opts?.fetch ?? globalThis.fetch;
  const owner = opts?.owner ?? '';
  const repo = opts?.repo ?? '';
  try {
    switch (platform) {
      case 'github': {
        if (!owner || !repo) return { valid: false, error: 'owner and repo are required to validate GitHub token' };
        const res = await httpFetch(`https://api.github.com/repos/${owner}/${repo}/issues?per_page=1`, {
          headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'issuer-cli' },
        });
        if (!res.ok) return { valid: false, error: `GitHub API ${res.status}` };
        return { valid: true };
      }
      case 'gitlab': {
        if (!owner || !repo) return { valid: false, error: 'owner and repo are required to validate GitLab token' };
        const host = opts?.host ?? 'https://gitlab.com';
        const projectId = encodeURIComponent(`${owner}/${repo}`);
        const res = await httpFetch(`${host}/api/v4/projects/${projectId}/issues?per_page=1`, {
          headers: { 'PRIVATE-TOKEN': token },
        });
        if (!res.ok) return { valid: false, error: `GitLab API ${res.status}` };
        return { valid: true };
      }
      case 'yunxiao': {
        if (!owner) return { valid: false, error: 'organizationId is required to validate 云效 token' };
        const domain = 'openapi-rdc.aliyuncs.com';
        const res = await httpFetch(
          `https://${domain}/oapi/v1/projex/organizations/${owner}/workitems:search`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-yunxiao-token': token },
            body: JSON.stringify({ category: 'Req', spaceType: 'Project', page: 1, perPage: 1 }),
          },
        );
        if (!res.ok) return { valid: false, error: `云效 API ${res.status}` };
        return { valid: true };
      }
      default:
        return { valid: false, error: `Unknown platform: ${platform}` };
    }
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}
