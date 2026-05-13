import type { Adapter } from './interface.js';
import type { ProjectConfig } from '../core/config.js';
import { GitHubAdapter } from './github/index.js';
import { GitLabAdapter } from './gitlab/index.js';
import { YunxiaoAdapter } from './yunxiao/index.js';
import { PingCodeAdapter } from './pingcode/index.js';

/**
 * Create an Adapter instance from project config + token.
 * Used by both `issuer auth` (token validation) and `issuer push` (sync).
 */
export function createAdapter(cfg: ProjectConfig, token: string, cwd: string): Adapter {
  switch (cfg.platform) {
    case 'github':
      return new GitHubAdapter({ token, owner: cfg.owner, repo: cfg.repo });
    case 'gitlab':
      return new GitLabAdapter({ token, owner: cfg.owner, repo: cfg.repo });
    case 'yunxiao':
      return new YunxiaoAdapter({
        token,
        organizationId: cfg.owner,
        spaceIdentifierId: cfg.repo,
        projectRoot: cwd,
        assignedTo: cfg.assigned_to,
        workitemTypeMap: cfg.workitem_type_map,
        domain: cfg.yunxiao_domain,
      });
    case 'pingcode':
      return new PingCodeAdapter({
        token,
        projectId: cfg.pingcode_project_id || cfg.repo,
        projectRoot: cwd,
      });
    default:
      throw new Error(`Unsupported platform: ${cfg.platform}`);
  }
}
