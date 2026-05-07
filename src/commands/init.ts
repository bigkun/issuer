import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { input, select } from '@inquirer/prompts';
import { stringify as yamlStringify } from 'yaml';
import { ConfigError } from '../core/errors.js';

export interface InitOptions {
  cwd: string;
  platform?: string;
  owner?: string;
  repo?: string;
  force?: boolean;
  nonInteractive?: boolean;
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
        choices: [{ name: 'GitHub Issues', value: 'github' }],
      });
    }
    if (platform === 'github') {
      if (!owner) owner = await input({ message: 'GitHub owner (user or org)' });
      if (!repo) repo = await input({ message: 'GitHub repo name' });
    }
  }

  if (!platform || !owner || !repo) {
    throw new ConfigError('platform, owner and repo are required');
  }

  mkdirSync(join(issuerDir, 'tasks'), { recursive: true });
  const cfg = { platform, owner, repo, default_labels: [] as string[] };
  writeFileSync(cfgPath, yamlStringify(cfg), 'utf8');
  return { configPath: cfgPath };
}
