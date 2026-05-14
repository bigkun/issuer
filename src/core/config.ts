import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { ConfigError } from './errors.js';
import type { McpCapabilities } from '../adapter/registry.js';
import type { Adapter } from '../adapter/interface.js';
import { DEFAULT_MCP_CAPABILITIES } from './constants.js';

export interface ProjectConfig {
  platform: string;
  owner: string;
  repo: string;
  default_labels: string[];
  mcp_capabilities?: McpCapabilities;
  dedup?: DedupConfig;
  /** Yunxiao: service endpoint domain (center: openapi-rdc.aliyuncs.com, region: instance endpoint) */
  yunxiao_domain?: string;
  /** Yunxiao: default assignedTo userId for create (auto-fetched via getCurrentUser) */
  assigned_to?: string;
  /** Yunxiao: workitem type mapping (auto-fetched via ListWorkitemTypes) */
  workitem_type_map?: WorkitemTypeMap;
  /** Yunxiao: Bug severity field mapping (auto-fetched on first Bug push) */
  severity_field_map?: SeverityFieldMap;
  /** Yunxiao: Bug priority field mapping (auto-fetched on first Bug push) */
  priority_field_map?: SeverityFieldMap;
  /** PingCode: project ID for API requests */
  pingcode_project_id?: string;
  /** Custom path for task files (default: .issuer/tasks) */
  tasks_dir?: string;
  /** Custom path for refine output (default: .issuer/refine) */
  refine_dir?: string;
  /** Custom breakdown template path (default: built-in platform template or generic) */
  breakdown_template?: string;
}

/** Yunxiao workitem type mapping (categoryId → workitemTypeId). */
export interface WorkitemTypeMap {
  Req?: string;   // 需求类型
  Bug?: string;   // 缺陷类型
  Task?: string;  // 任务类型
}

/** Yunxiao Bug severity field mapping (priority → severity field option ID). */
export interface SeverityFieldMap {
  /** Cloud effect severity field ID */
  fieldId: string;
  /** Priority to severity option ID mapping */
  options: {
    critical?: string;  // P0 - 致命
    high?: string;      // P1 - 严重
    medium?: string;    // P2 - 一般
    low?: string;       // P3 - 建议
  };
}

export interface DedupConfig {
  /** Whether duplicate detection is enabled */
  enabled: boolean;
  /** Similarity threshold (0.0-1.0) */
  threshold: number;
  /** Cache TTL in hours */
  ttl_hours: number;
  /** Action when duplicate is detected: 'upload' | 'skip' | 'prompt' */
  on_match: 'upload' | 'skip' | 'prompt';
}

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  enabled: true,
  threshold: 0.85,
  ttl_hours: 24,
  on_match: 'prompt', // Default: prompt user for action
};

/** Global config interface (can include default values). */
export interface GlobalConfig {
  /** Default platform for new projects */
  default_platform?: string;
  /** Global dedup settings */
  dedup?: Partial<DedupConfig>;
  /** Yunxiao: default assignedTo userId */
  assigned_to?: string;
  /** Priority mappings */
  priority_map?: Record<string, string>;
  /** Default tasks directory */
  tasks_dir?: string;
  /** Default refine directory */
  refine_dir?: string;
  /** Default breakdown template path */
  breakdown_template?: string;
}

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

/** Parse severity_field_map from raw config data. */
function parseSeverityFieldMap(raw: unknown): SeverityFieldMap | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  if (typeof data.fieldId !== 'string') return undefined;
  
  const optionsData = data.options as Record<string, unknown> | undefined;
  if (!optionsData || typeof optionsData !== 'object') return undefined;
  
  return {
    fieldId: data.fieldId as string,
    options: {
      critical: typeof optionsData.critical === 'string' ? optionsData.critical : undefined,
      high: typeof optionsData.high === 'string' ? optionsData.high : undefined,
      medium: typeof optionsData.medium === 'string' ? optionsData.medium : undefined,
      low: typeof optionsData.low === 'string' ? optionsData.low : undefined,
    },
  };
}

/** Load global config from ~/.issuer/config.yml */
export function loadGlobalConfig(): GlobalConfig | null {
  const globalPath = join(homedir(), '.issuer', 'config.yml');
  if (!existsSync(globalPath)) return null;
  
  try {
    const raw = yamlParse(readFileSync(globalPath, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    return raw as GlobalConfig;
  } catch {
    return null;
  }
}

/** Merge global and project configs (project takes precedence). */
function mergeConfigs(global: GlobalConfig | null, project: ProjectConfig): ProjectConfig {
  if (!global) return project;
  
  // Deep merge dedup config
  const mergedDedup = global.dedup && project.dedup
    ? { ...global.dedup, ...project.dedup }
    : (global.dedup ?? project.dedup);
  
  return {
    ...project,
    // Global values as fallback
    assigned_to: project.assigned_to ?? global.assigned_to,
    tasks_dir: project.tasks_dir ?? global.tasks_dir,
    refine_dir: project.refine_dir ?? global.refine_dir,
    breakdown_template: project.breakdown_template ?? global.breakdown_template,
    dedup: mergedDedup as DedupConfig | undefined,
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
  for (const f of ['platform', 'repo'] as const) {
    if (typeof data[f] !== 'string' || !data[f]) {
      throw new ConfigError(`${cfgPath}: '${f}' must be a non-empty string`);
    }
  }
  // owner is required for most platforms, but PingCode allows empty owner
  if (data.platform !== 'pingcode') {
    if (typeof data.owner !== 'string' || !data.owner) {
      throw new ConfigError(`${cfgPath}: 'owner' must be a non-empty string`);
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
        : { ...DEFAULT_MCP_CAPABILITIES },
    };
  }

  const projectConfig: ProjectConfig = {
    platform: data.platform as string,
    owner: data.owner as string,
    repo: data.repo as string,
    default_labels: (labels as string[] | undefined) ?? [],
    mcp_capabilities,
    dedup: data.dedup as DedupConfig | undefined,
    yunxiao_domain: data.yunxiao_domain as string | undefined,
    assigned_to: data.assigned_to as string | undefined,
    workitem_type_map: parseWorkitemTypeMap(data.workitem_type_map),
    severity_field_map: parseSeverityFieldMap(data.severity_field_map),
    priority_field_map: parseSeverityFieldMap(data.priority_field_map),
    tasks_dir: data.tasks_dir as string | undefined,
    refine_dir: data.refine_dir as string | undefined,
    breakdown_template: data.breakdown_template as string | undefined,
  };

  // Load and merge global config
  const globalConfig = loadGlobalConfig();
  return mergeConfigs(globalConfig, projectConfig);
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
  pingcode: { envPrimary: 'ISSUER_PINGCODE_TOKEN', envFallback: 'PINGCODE_TOKEN', credentialsKey: 'pingcode_token' },
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

/** Get token key info for a platform, supporting both built-in and generic platforms. */
function getTokenKeys(platform: string) {
  const builtIn = PLATFORM_TOKEN_KEYS[platform];
  if (builtIn) return builtIn;
  // Generic platform: derive keys from platform name
  const upper = platform.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return {
    envPrimary: `ISSUER_${upper}_TOKEN`,
    envFallback: `${upper}_TOKEN`,
    credentialsKey: `${platform}_token`,
  };
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
  const keys = getTokenKeys(platform);

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
  const keys = getTokenKeys(platform);

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
  const keys = getTokenKeys(platform);

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
  adapter: Adapter,
): Promise<{ valid: true } | { valid: false; error: string }> {
  try {
    await adapter.listRemote();
    return { valid: true };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    return { valid: false, error: msg };
  }
}
