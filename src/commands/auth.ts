import { join } from 'node:path';
import { input } from '@inquirer/prompts';
import { ConfigError } from '../core/errors.js';
import { loadProjectConfig, resolveToken, validateToken, writeCredentialsFile, findTokenSource } from '../core/config.js';
import { createAdapter } from '../adapter/factory.js';
import { hasApiAdapter } from '../adapter/registry.js';
import type { Adapter } from '../adapter/interface.js';

export interface AuthOptions {
  cwd: string;
  /** Explicit token to validate and save. */
  token?: string;
  /** Platform override (defaults to config platform). */
  platform?: string;
  /** Whether to skip prompts (non-interactive). */
  nonInteractive?: boolean;
  /** Pre-built adapter for testing (bypasses createAdapter). */
  adapter?: Adapter;
}

export interface AuthResult {
  platform: string;
  valid: boolean;
  error?: string;
  credentialsPath?: string;
}

export async function runAuth(opts: AuthOptions): Promise<AuthResult> {
  // Load project config to determine platform
  let cfg: import('../core/config.js').ProjectConfig | undefined;
  let platform = opts.platform;
  try {
    cfg = await loadProjectConfig(opts.cwd);
    if (!platform) platform = cfg.platform;
  } catch {
    if (!platform) {
      throw new ConfigError('No platform configured. Run `issuer init` first or specify --platform.');
    }
  }

  // MCP-only platforms don't use CLI token validation — auth is handled by the MCP server
  if (cfg && !hasApiAdapter(cfg.platform)) {
    console.log(`ℹ '${cfg.platform}' is an MCP-only platform.`);
    console.log(`  Authentication is handled by the MCP server (e.g., Atlassian Rovo OAuth 2.1).`);
    console.log(`  No CLI token validation is required.\n`);
    console.log(`  To configure Rovo MCP auth, run the following in your terminal:`);
    console.log(`    npx -y mcp-remote https://mcp.atlassian.com/v1/mcp`);
    console.log(`  Then restart your AI agent (Cursor, Claude Desktop, etc.)\n`);
    return { platform: cfg.platform, valid: true };
  }

  // Resolve token: explicit > existing > prompt
  let token = opts.token;
  if (!token) {
    const existing = findTokenSource(platform, { projectRoot: opts.cwd });
    if (existing) {
      console.log(`Found ${platform} credentials from ${existing.source}`);
      token = existing.token;
    }
  }
  
  if (!token && !opts.nonInteractive) {
    token = await input({ message: `Enter ${platform} token` });
  }
  if (!token) {
    return {
      platform,
      valid: false,
      error: 'No token provided. Use --token or run interactively.',
    };
  }

  // Validate via adapter.listRemote()
  if (!cfg) {
    return {
      platform,
      valid: false,
      error: 'Cannot validate token without project config. Run `issuer init` first.',
    };
  }
  const adapter = opts.adapter ?? createAdapter(cfg, token, opts.cwd);
  const result = await validateToken(adapter);
  if (result.valid) {
    // Write to project credentials file
    const credPath = join(opts.cwd, '.issuer', 'credentials.yml');
    writeCredentialsFile(credPath, platform, token);
    console.log(`✓ ${platform} token is valid`);
    console.log(`  → Saved to ${credPath}`);
    return {
      platform,
      valid: true,
      credentialsPath: credPath,
    };
  }

  console.log(`✗ ${platform} token is invalid: ${result.error}`);
  return {
    platform,
    valid: false,
    error: result.error,
  };
}
