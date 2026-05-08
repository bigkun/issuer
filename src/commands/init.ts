import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { input, select, confirm } from '@inquirer/prompts';
import { stringify as yamlStringify } from 'yaml';
import { ConfigError } from '../core/errors.js';
import { getRegistryEntry, capabilitiesFromRegistry, formatCapabilitySummary, type McpCapabilities } from '../adapter/registry.js';
import { hasPlatformToken, findTokenSource, writeCredentialsFile, validateToken } from '../core/config.js';

export interface InitOptions {
  cwd: string;
  platform?: string;
  owner?: string;
  repo?: string;
  token?: string;
  agent?: string;
  force?: boolean;
  nonInteractive?: boolean;
  /** Pre-probed MCP tool list (from a live probe). If omitted, the registry baseline is used. */
  probedTools?: string[];
}

export interface InitResult {
  configPath: string;
  credentialsPath?: string;
  skillsPath?: string;
}

// Agent-to-skills-path mapping
const AGENT_SKILLS_PATHS: Record<string, string> = {
  'claude': '.claude/skills',
  'cursor': '.claude/skills',
  'copilot': '.github/skills',
  'qoder': '.qoder/skills',
  'opencode': '.qoder/skills',
};

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const issuerDir = join(opts.cwd, '.issuer');
  const cfgPath = join(issuerDir, 'config.yml');
  if (existsSync(cfgPath) && !opts.force) {
    throw new ConfigError(`Project already initialised at ${cfgPath}. Use --force to overwrite.`);
  }

  let platform = opts.platform;
  let owner = opts.owner;
  let repo = opts.repo;
  let token = opts.token;

  if (!opts.nonInteractive) {
    if (!platform) {
      platform = await select({
        message: 'Select platform',
        choices: [
          { name: 'GitHub Issues', value: 'github' },
          { name: 'GitLab Issues', value: 'gitlab' },
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
    if (platform === 'gitlab') {
      if (!owner) owner = await input({ message: 'GitLab group or namespace' });
      if (!repo) repo = await input({ message: 'GitLab project name or ID' });
    }
  }

  if (!platform || !owner || !repo) {
    throw new ConfigError('platform, owner and repo are required');
  }

  // --- Credential flow ---
  let credentialsPath: string | undefined;
  if (!token) {
    const existing = findTokenSource(platform, { projectRoot: opts.cwd });
    if (existing) {
      console.log(`\nFound ${platform} credentials from ${existing.source}`);
      if (!opts.nonInteractive) {
        const useExisting = await confirm({ message: 'Use this credential?', default: true });
        if (useExisting) token = existing.token;
      } else {
        token = existing.token;
      }
    }
  }
  if (!token && !opts.nonInteractive) {
    token = await input({ message: `${platform} token (leave empty to configure later)`, required: false });
  }
  // Write token to project credentials file if provided
  if (token) {
    const credPath = join(issuerDir, 'credentials.yml');
    writeCredentialsFile(credPath, platform, token);
    credentialsPath = credPath;
    console.log(`Credentials written to ${credPath}`);
    // Validate the token
    const result = await validateToken(platform, token, { owner, repo });
    if (result.valid) {
      console.log(`✓ ${platform} token is valid`);
    } else {
      console.log(`⚠ Token validation failed: ${result.error}`);
    }
  } else {
    console.log(`\n⚠ No ${platform} token configured. You can set it later via:`);
    console.log(`  - Environment variable`);
    console.log(`  - .issuer/credentials.yml`);
    console.log(`  - issuer auth`);
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

  // Determine recommended skills path based on agent
  const skillsPath = opts.agent
    ? AGENT_SKILLS_PATHS[opts.agent] ?? '.claude/skills'
    : undefined;

  // Print next steps
  console.log('\n📋 Next steps:');
  if (skillsPath) {
    console.log(`1. Install skills for ${opts.agent}:`);
    console.log(`   issuer skill install --target ~/${skillsPath}`);
  } else {
    console.log('1. Install skills (auto-detect):');
    console.log('   issuer skill install');
  }
  console.log('2. In your agent, invoke: /issuer <your-requirement>');

  return { configPath: cfgPath, credentialsPath, skillsPath };
}
