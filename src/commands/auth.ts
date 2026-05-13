import { join } from 'node:path';
import { input } from '@inquirer/prompts';
import { ConfigError } from '../core/errors.js';
import { loadProjectConfig, resolveToken, validateToken, writeCredentialsFile, findTokenSource } from '../core/config.js';
import { createAdapter } from '../adapter/factory.js';
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
    console.log(`Credentials saved to ${credPath}`);
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
