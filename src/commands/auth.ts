import { join } from 'node:path';
import { input } from '@inquirer/prompts';
import { ConfigError } from '../core/errors.js';
import { loadProjectConfig, resolveToken, validateToken, writeCredentialsFile, findTokenSource } from '../core/config.js';

export interface AuthOptions {
  cwd: string;
  /** Explicit token to validate and save. */
  token?: string;
  /** Platform override (defaults to config platform). */
  platform?: string;
  /** Whether to skip prompts (non-interactive). */
  nonInteractive?: boolean;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof globalThis.fetch;
}

export interface AuthResult {
  platform: string;
  valid: boolean;
  error?: string;
  credentialsPath?: string;
}

export async function runAuth(opts: AuthOptions): Promise<AuthResult> {
  // Load project config to determine platform
  let platform = opts.platform;
  let owner: string | undefined;
  let repo: string | undefined;
  try {
    const cfg = await loadProjectConfig(opts.cwd);
    if (!platform) platform = cfg.platform;
    owner = cfg.owner;
    repo = cfg.repo;
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

  // Validate
  const result = await validateToken(platform, token, { owner, repo, fetch: opts.fetch });
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
