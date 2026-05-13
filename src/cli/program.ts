import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, unlinkSync } from 'node:fs';
import { createProgram } from './parser.js';
import { runInit } from '../commands/init.js';
import { runAuth } from '../commands/auth.js';
import { runPush } from '../commands/push.js';
import { runStatus } from '../commands/status.js';
import { runListRemote } from '../commands/list-remote.js';
import { runSkillInstall, runSkillInstallInteractive } from '../commands/skill-install.js';
import { runCacheRefresh } from '../commands/cache.js';
import { createAdapter } from '../adapter/factory.js';
import { loadProjectConfig, resolveToken, DEFAULT_DEDUP_CONFIG } from '../core/config.js';
import { loadCache, getCachePath, getCacheAge } from '../core/cache.js';
import { Status, TaskFile } from '../core/types.js';
import { REMOTE_STATE_OPEN, PROMPT_OPTION_UPLOAD, PROMPT_OPTION_SKIP } from '../core/constants.js';
import { success, table, error } from './output.js';
import type { Adapter } from '../adapter/interface.js';

async function buildAdapter(cwd: string): Promise<Adapter> {
  const cfg = await loadProjectConfig(cwd);
  const token = resolveToken(cfg.platform, { projectRoot: cwd });
  return createAdapter(cfg, token, cwd);
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
    .option('--agent <agent>', 'target agent (claude, cursor, copilot, qoder, opencode)')
    .option('--force', 'overwrite existing config')
    .option('-y, --yes', 'non-interactive')
    .action(async (opts) => {
      const r = await runInit({
        cwd: process.cwd(),
        platform: opts.platform,
        owner: opts.owner,
        repo: opts.repo,
        token: opts.token,
        agent: opts.agent,
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
    .option('--no-dedup', 'Disable duplicate detection entirely (upload all tasks)')
    .option('--dedup-action <action>', 'Action when duplicate detected: upload|skip|prompt (overrides config)', (val) => {
      if (!['upload', 'skip', 'prompt'].includes(val)) {
        throw new Error(`Invalid --dedup-action: ${val}. Must be upload, skip, or prompt`);
      }
      return val;
    })
    .action(async (opts) => {
      const cwd = process.cwd();
      const adapter = await buildAdapter(cwd);
      const cfg = await loadProjectConfig(cwd);
      const dedup = cfg.dedup ?? DEFAULT_DEDUP_CONFIG;
      
      // Build effective dedup config with CLI overrides
      const effectiveDedup = {
        ...dedup,
        enabled: opts.noDedup ? false : dedup.enabled,
        on_match: opts.dedupAction ?? dedup.on_match,
      };
      
      const s = await runPush({ cwd, adapter, dedupConfig: effectiveDedup });
      
      // Show duplicates if found
      if (s.duplicates.length > 0) {
        console.log('\n⚠ Potential duplicates detected:');
        for (const d of s.duplicates) {
          console.log(`  "${d.task.title}" matches:`);
          for (const m of d.matches) {
            console.log(`    - #${m.issue.id} "${m.issue.title}" (${Math.round(m.score * 100)}%)`);
          }
        }
        console.log('');
        
        const cfg = await loadProjectConfig(cwd);
        const dedup = cfg.dedup ?? DEFAULT_DEDUP_CONFIG;
        
        // Handle 'prompt' mode with user interaction
        if (effectiveDedup.on_match === 'prompt' && s.duplicateSkipped.length > 0) {
          console.log(`Found ${s.duplicates.length} potential duplicate(s).`);
          console.log('What would you like to do?');
          console.log('  1) Upload all duplicates');
          console.log('  2) Skip all duplicates');
          console.log('  3) Quit without uploading');
          
          const readline = await import('node:readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          
          const answer = await new Promise<string>((resolve) => {
            rl.question('Enter your choice (1/2/3): ', (input) => {
              rl.close();
              resolve(input.trim());
            });
          });
          
          if (answer === PROMPT_OPTION_UPLOAD) {
            // Upload all duplicates
            console.log('\nUploading all duplicates...');
            for (const dup of s.duplicates) {
              const task = dup.task;
              const result = await adapter.createIssue(task);
              const next = {
                ...task,
                platform_id: result.id,
                platform_url: result.url,
                status: Status.Synced,
                updated_at: new Date().toISOString(),
              } as TaskFile;
              const { writeFileSync } = await import('node:fs');
              const { serializeTaskFile } = await import('../core/task-file.js');
              writeFileSync(task.filePath, serializeTaskFile(next), 'utf8');
              s.created.push(next);
            }
            console.log(`✓ Uploaded ${s.duplicates.length} duplicate(s)\n`);
          } else if (answer === PROMPT_OPTION_SKIP) {
            console.log(`✓ Skipped ${s.duplicates.length} duplicate(s)\n`);
          } else {
            console.log('✓ Cancelled\n');
            return;
          }
        }
      }
      
      // Show summary
      if (s.duplicates.length > 0) {
        console.log('\n───────────────────────────────────────────────────────');
        console.log('  Duplicate Detection');
        console.log('───────────────────────────────────────────────────────');
        console.log(`  Found:      ${s.duplicates.length}`);
        console.log(`  Uploaded:   ${s.duplicateUploaded.length}`);
        console.log(`  Skipped:    ${s.duplicateSkipped.length}`);
        
        if (s.duplicateUploaded.length > 0) {
          console.log('\n  Uploaded duplicates:');
          for (const t of s.duplicateUploaded) {
            console.log(`    ✓ "${t.title}"`);
          }
        }
        
        if (s.duplicateSkipped.length > 0) {
          console.log('\n  Skipped duplicates:');
          for (const t of s.duplicateSkipped) {
            console.log(`    ✗ "${t.title}"`);
          }
        }
      }
      
      console.log('');
      
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
      // 如果没有指定 target，使用交互式选择 Agent
      if (!opts.target) {
        const r = await runSkillInstallInteractive({
          bundledSkillsDir: resolveBundledSkillsDir(),
          projectRoot: process.cwd(),
        });
        success(`Installed ${r.installed.length} skill(s) into ${r.targetPath}`);
      } else {
        const r = await runSkillInstall({
          bundledSkillsDir: resolveBundledSkillsDir(),
          targetPath: opts.target,
        });
        success(`Installed ${r.installed.length} skill(s) into ${r.targetPath}`);
      }
    });

  const cache = program.command('cache').description('Manage local issue cache');
  cache
    .command('refresh')
    .description('Refresh local issue cache from platform')
    .action(async () => {
      const adapter = await buildAdapter(process.cwd());
      const r = await runCacheRefresh({ cwd: process.cwd(), adapter });
      success(`Refreshed ${r.count} issues into ${r.path}`);
    });

  cache
    .command('status')
    .description('Show cache status')
    .action(async () => {
      const c = loadCache(process.cwd());
      if (!c) {
        console.log('No cache found. Run `issuer cache refresh` first.');
        return;
      }
      const age = getCacheAge(c);
      console.log(`Cache: ${c.issues.length} issues from ${c.platform}`);
      console.log(`Fetched: ${c.fetched_at} (${age}h ago)`);
    });

  cache
    .command('clear')
    .description('Clear local issue cache')
    .action(async () => {
      const path = getCachePath(process.cwd());
      if (existsSync(path)) {
        unlinkSync(path);
        success('Cache cleared');
      } else {
        console.log('No cache to clear');
      }
    });

  return program;
}
