import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { input, select, confirm } from '@inquirer/prompts';
import { stringify as yamlStringify } from 'yaml';
import { ConfigError } from '../core/errors.js';
import { getRegistryEntry, capabilitiesFromRegistry, formatCapabilitySummary, type McpCapabilities } from '../adapter/registry.js';
import { hasPlatformToken, findTokenSource, writeCredentialsFile, validateToken, DEFAULT_DEDUP_CONFIG, type ProjectConfig } from '../core/config.js';
import { DEFAULT_TASKS_DIR } from '../core/task-store.js';
import { createAdapter } from '../adapter/factory.js';

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

// Platforms with built-in adapters (CLI fallback available)
const BUILT_IN_PLATFORMS = ['github', 'gitlab', 'yunxiao'];

// Generic breakdown template for unsupported platforms
const GENERIC_BREAKDOWN_TEMPLATE = `# Generic Breakdown Template

Customize this template to match your team's workflow.
The issuer-breakdown skill will use this as a guide when generating task files.

## Bug

### Structure
- Description
- Reproduction Steps (numbered)
- Expected Behavior
- Actual Behavior
- Environment (version, OS, browser)

### Rules
- Reproduction steps MUST be numbered and reproducible
- Clearly separate Expected vs Actual behavior
- Include environment details

## Feature / Story

### Structure
- User Story (As a / I want / So that)
- Problem Statement
- Acceptance Criteria (checkboxes, min 3)

### Rules
- Start with User Story format
- Acceptance criteria MUST use checkbox syntax: - [ ] criterion
- Minimum 3 acceptance criteria

## Task

### Structure
- Objective
- Implementation Steps (numbered)
- Technical Constraints
- Testing Checklist (checkboxes)

### Rules
- Focus on what needs to be done
- Implementation steps must be numbered and actionable
- Include testing checklist
`;

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
  let yunxiaoDomain: string | undefined;

  if (!opts.nonInteractive) {
    if (!platform) {
      platform = await select({
        message: 'Select platform',
        choices: [
          { name: 'GitHub Issues', value: 'github' },
          { name: 'GitLab Issues', value: 'gitlab' },
          { name: '云效 (Yunxiao)', value: 'yunxiao' },
          { name: 'Other (MCP)', value: '__other__' },
        ],
      });
      if (platform === '__other__') {
        platform = await input({ message: 'Platform name (e.g. jira, linear, asana)', required: true });
      }
    }
    if (platform === 'github') {
      if (!owner) owner = await input({ message: 'GitHub owner (user or org)' });
      if (!repo) repo = await input({ message: 'GitHub repo name' });
    }
    if (platform === 'yunxiao') {
      // Organization ID determines edition: empty → Region, non-empty → Center
      if (!owner) owner = await input({
        message: 'Organization ID (leave empty for Region edition)',
        required: false,
      });

      if (!owner || owner === '') {
        // Region edition: no organizationId, need service endpoint
        owner = 'default';
        console.log('  → Region edition detected');

        yunxiaoDomain = await input({
          message: 'Region service endpoint (e.g. devops.cn-hangzhou.aliyuncs.com)',
          required: true,
        });
      }
      // Center edition: owner already set, domain stays default

      if (!repo) repo = await input({ message: 'Project ID (spaceIdentifierId)' });
    }
    if (platform === 'gitlab') {
      if (!owner) owner = await input({ message: 'GitLab group or namespace' });
      if (!repo) repo = await input({ message: 'GitLab project name or ID' });
    }
    // Unsupported platforms: ask for owner/repo generically
    if (!BUILT_IN_PLATFORMS.includes(platform)) {
      if (!owner) owner = await input({ message: `${platform} owner / workspace / organization` });
      if (!repo) repo = await input({ message: `${platform} project / repo / space ID` });
    }
  }

  if (!platform || !owner || !repo) {
    throw new ConfigError('platform, owner and repo are required');
  }

  // --- Determine if this is a built-in platform ---
  const isBuiltIn = BUILT_IN_PLATFORMS.includes(platform);

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
    // Validate token only for built-in platforms (have adapters)
    if (isBuiltIn) {
      try {
        const tempCfg: ProjectConfig = {
          platform,
          owner,
          repo,
          default_labels: [],
          yunxiao_domain: yunxiaoDomain,
        };
        const adapter = createAdapter(tempCfg, token, opts.cwd);
        const result = await validateToken(adapter);
        if (result.valid) {
          console.log(`✓ ${platform} token is valid`);
        } else {
          console.log(`⚠ Token validation failed: ${result.error}`);
        }
      } catch (e) {
        console.log(`⚠ Token validation failed: ${(e as Error).message}`);
      }
    } else {
      console.log(`⚠ Token saved. Validation skipped — ${platform} uses MCP for sync.`);
    }
  } else {
    console.log(`\n⚠ No ${platform} token configured. You can set it later via:`);
    console.log(`  - Environment variable`);
    console.log(`  - .issuer/credentials.yml`);
    console.log(`  - issuer auth`);
  }

  mkdirSync(join(issuerDir, 'tasks'), { recursive: true });
  mkdirSync(join(issuerDir, 'briefs'), { recursive: true });

  // --- Template setup for unsupported platforms ---
  let breakdownTemplate: string | undefined;
  if (!isBuiltIn) {
    const templatesDir = join(issuerDir, 'templates');
    mkdirSync(templatesDir, { recursive: true });
    const templatePath = join(templatesDir, 'breakdown.md');
    if (!existsSync(templatePath)) {
      writeFileSync(templatePath, GENERIC_BREAKDOWN_TEMPLATE, 'utf8');
      console.log(`\nCreated generic breakdown template: ${templatePath}`);
    }
    breakdownTemplate = '.issuer/templates/breakdown.md';
  }

  // Build mcp_capabilities from registry baseline or live probe
  let mcp_capabilities: McpCapabilities;
  const entry = getRegistryEntry(platform);
  if (opts.probedTools && opts.probedTools.length > 0) {
    const { capabilitiesFromProbeWithRegistry } = await import('../adapter/registry.js');
    mcp_capabilities = capabilitiesFromProbeWithRegistry(platform, opts.probedTools);
  } else if (entry) {
    mcp_capabilities = capabilitiesFromRegistry(entry);
  } else {
    // Unknown platform — assume full MCP capabilities
    mcp_capabilities = {
      channel: 'mcp',
      probed_at: new Date().toISOString(),
      tools: [],
      capabilities: { create: true, update: true, search: true, read: true, comment: true },
    };
  }

  const cfg: Record<string, unknown> = {
    platform,
    owner,
    repo,
    default_labels: [] as string[],
    mcp_capabilities,
    dedup: DEFAULT_DEDUP_CONFIG,
    tasks_dir: DEFAULT_TASKS_DIR,
  };
  
  // Save yunxiao_domain (service endpoint) if not default center endpoint
  if (yunxiaoDomain && yunxiaoDomain !== 'openapi-rdc.aliyuncs.com') {
    cfg.yunxiao_domain = yunxiaoDomain;
  }

  // Save breakdown_template for unsupported platforms
  if (breakdownTemplate) {
    cfg.breakdown_template = breakdownTemplate;
  }
  
  writeFileSync(cfgPath, yamlStringify(cfg), 'utf8');

  // Print capability summary
  console.log(`\nPlatform: ${platform}${entry ? ` (MCP: ${entry.mcpPackage})` : ' (generic / MCP)'}`);
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
