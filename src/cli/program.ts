import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProgram } from './parser.js';
import { runInit } from '../commands/init.js';
import { runAuth } from '../commands/auth.js';
import { runPush } from '../commands/push.js';
import { runStatus } from '../commands/status.js';
import { runListRemote } from '../commands/list-remote.js';
import { runSkillInstall } from '../commands/skill-install.js';
import { GitHubAdapter } from '../adapter/github/index.js';
import { GitLabAdapter } from '../adapter/gitlab/index.js';
import { YunxiaoAdapter } from '../adapter/yunxiao/index.js';
import { loadProjectConfig, resolveToken } from '../core/config.js';
import { success, table, error } from './output.js';
import type { Adapter } from '../adapter/interface.js';

async function buildAdapter(cwd: string): Promise<Adapter> {
  const cfg = await loadProjectConfig(cwd);
  const token = resolveToken(cfg.platform, { projectRoot: cwd });

  switch (cfg.platform) {
    case 'github':
      return new GitHubAdapter({ token, owner: cfg.owner, repo: cfg.repo });
    case 'gitlab':
      return new GitLabAdapter({ token, owner: cfg.owner, repo: cfg.repo });
    case 'yunxiao':
      return new YunxiaoAdapter({ token, organizationId: cfg.owner, spaceIdentifierId: cfg.repo });
    default:
      throw new Error(`Unsupported platform: ${cfg.platform}`);
  }
}

function resolveBundledSkillsDir(): string {
  // dist/index.js is the compiled bin; skills/ ships next to dist/
  const here = fileURLToPath(new URL('.', import.meta.url));
  return join(here, '..', 'skills');
}

export function buildProgram() {
  const program = createProgram();

  program
    .command('init')
    .description('Initialise .issuer/ in the current project')
    .option('--platform <platform>', 'platform id (github, gitlab, yunxiao)')
    .option('--owner <owner>', 'platform owner / org')
    .option('--repo <repo>', 'platform repo name')
    .option('--token <token>', 'platform authentication token')
    .option('--force', 'overwrite existing config')
    .option('-y, --yes', 'non-interactive')
    .action(async (opts) => {
      const r = await runInit({
        cwd: process.cwd(),
        platform: opts.platform,
        owner: opts.owner,
        repo: opts.repo,
        token: opts.token,
        force: !!opts.force,
        nonInteractive: !!opts.yes,
      });
      success(`Initialised ${r.configPath}`);
    });

  program
    .command('auth')
    .description('Validate and save platform credentials')
    .option('--token <token>', 'authentication token to validate')
    .option('--platform <platform>', 'platform id (defaults to config)')
    .action(async (opts) => {
      const result = await runAuth({
        cwd: process.cwd(),
        token: opts.token,
        platform: opts.platform,
      });
      if (result.valid) {
        success(`${result.platform} credentials are valid`);
      } else {
        error(`${result.platform} credentials are invalid: ${result.error}`);
      }
    });

  program
    .command('push')
    .description('Push status: ready tasks to the configured platform')
    .action(async () => {
      const adapter = await buildAdapter(process.cwd());
      const s = await runPush({ cwd: process.cwd(), adapter });
      success(
        `Pushed: ${s.created.length} created, ${s.updated.length} updated, ${s.skipped.length} skipped`,
      );
    });

  program
    .command('status')
    .description('Summarise local task counts by status')
    .action(async () => {
      const s = await runStatus({ cwd: process.cwd() });
      table([
        ['Status', 'Count'],
        ['draft', String(s.draft)],
        ['ready', String(s.ready)],
        ['synced', String(s.synced)],
        ['total', String(s.total)],
      ]);
    });

  program
    .command('list-remote')
    .description('List issues on the configured remote platform')
    .action(async () => {
      const adapter = await buildAdapter(process.cwd());
      const items = await runListRemote({ adapter });
      table([
        ['#', 'Title', 'State', 'URL'],
        ...items.map((i) => [i.id, i.title, i.state, i.url]),
      ]);
    });

  const skill = program.command('skill').description('Manage bundled skills');
  skill
    .command('install')
    .description('Copy bundled skills into your agent skills directory')
    .option('--target <path>', 'override the install target directory')
    .action(async (opts) => {
      const r = await runSkillInstall({
        bundledSkillsDir: resolveBundledSkillsDir(),
        targetPath: opts.target,
      });
      success(`Installed ${r.installed.length} skill(s) into ${r.targetPath}`);
    });

  return program;
}
