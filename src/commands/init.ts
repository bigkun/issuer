import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { input, select } from '@inquirer/prompts';
import { stringify as yamlStringify } from 'yaml';
import { ConfigError } from '../core/errors.js';
import { getRegistryEntry, capabilitiesFromRegistry, formatCapabilitySummary, type McpCapabilities } from '../adapter/registry.js';

export interface InitOptions {
  cwd: string;
  platform?: string;
  owner?: string;
  repo?: string;
  force?: boolean;
  nonInteractive?: boolean;
  /** Pre-probed MCP tool list (from a live probe). If omitted, the registry baseline is used. */
  probedTools?: string[];
}

export async function runInit(opts: InitOptions): Promise<{ configPath: string }> {
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
        choices: [
          { name: 'GitHub Issues', value: 'github' },
          { name: '云效 (Yunxiao)', value: 'yunxiao' },
        ],
      });
    }
    if (platform === 'github') {
      if (!owner) owner = await input({ message: 'GitHub owner (user or org)' });
      if (!repo) repo = await input({ message: 'GitHub repo name' });
    }
    if (platform === 'yunxiao') {
      if (!owner) owner = await input({ message: '云效组织 ID (organizationId)' });
      if (!repo) repo = await input({ message: '云效项目 ID (spaceIdentifierId)' });
    }
  }

  if (!platform || !owner || !repo) {
    throw new ConfigError('platform, owner and repo are required');
  }

  mkdirSync(join(issuerDir, 'tasks'), { recursive: true });
  mkdirSync(join(issuerDir, 'briefs'), { recursive: true });

  // Build mcp_capabilities from registry baseline or live probe
  let mcp_capabilities: McpCapabilities;
  const entry = getRegistryEntry(platform);
  if (opts.probedTools && opts.probedTools.length > 0) {
    const { capabilitiesFromProbe } = await import('../adapter/registry.js');
    mcp_capabilities = capabilitiesFromProbe(platform, opts.probedTools);
  } else if (entry) {
    mcp_capabilities = capabilitiesFromRegistry(entry);
  } else {
    // Unknown platform — assume full capabilities, user will be warned
    mcp_capabilities = {
      channel: 'mcp',
      probed_at: new Date().toISOString(),
      tools: [],
      capabilities: { create: true, update: true, search: true, read: true, comment: true },
    };
  }

  const cfg = { platform, owner, repo, default_labels: [] as string[], mcp_capabilities };
  writeFileSync(cfgPath, yamlStringify(cfg), 'utf8');

  // Print capability summary
  console.log(`\nPlatform: ${platform}${entry ? ` (MCP: ${entry.mcpPackage})` : ''}`);
  console.log(formatCapabilitySummary(mcp_capabilities));
  if (mcp_capabilities.channel === 'mcp') {
    const gaps = (['create', 'update', 'search', 'read', 'comment'] as const)
      .filter((c) => !mcp_capabilities.capabilities[c]);
    if (gaps.length > 0) {
      console.log(`\n⚠ ${gaps.join(', ')} not available via MCP — \`issuer push\` (CLI) will handle these.`);
    }
  } else {
    console.log('\n⚠ No MCP server detected — all sync operations will use CLI.');
  }

  return { configPath: cfgPath };
}
