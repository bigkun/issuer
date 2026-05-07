import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as yamlParse } from 'yaml';
import { ConfigError } from './errors.js';
import type { McpCapabilities } from '../adapter/registry.js';

export interface ProjectConfig {
  platform: string;
  owner: string;
  repo: string;
  default_labels: string[];
  mcp_capabilities?: McpCapabilities;
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
  };
}

export interface TokenResolveOptions {
  env?: NodeJS.ProcessEnv;
  credentialsFile?: string;
}

export function resolveGitHubToken(opts: TokenResolveOptions = {}): string {
  const env = opts.env ?? process.env;
  if (env.ISSUER_GITHUB_TOKEN) return env.ISSUER_GITHUB_TOKEN;
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  const credPath = opts.credentialsFile ?? join(homedir(), '.issuer', 'credentials.yml');
  if (existsSync(credPath)) {
    try {
      const data = yamlParse(readFileSync(credPath, 'utf8')) as Record<string, unknown> | null;
      const token = data?.github_token;
      if (typeof token === 'string' && token) return token;
    } catch (e) {
      throw new ConfigError(`Failed to parse ${credPath}`, e);
    }
  }
  throw new ConfigError(
    'No GitHub token found. Set ISSUER_GITHUB_TOKEN, GITHUB_TOKEN, or write github_token: <token> to ~/.issuer/credentials.yml',
  );
}
