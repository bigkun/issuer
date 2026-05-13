/**
 * AI Agent 注册表 - Skill 安装支持
 * 
 * 配置驱动的多 Agent 检测机制
 * 新增 Agent 只需在此添加配置，无需修改检测逻辑
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface AgentConfig {
  /** Agent 内部标识（用于 --agent 参数） */
  id: string;
  
  /** Agent 显示名称 */
  name: string;
  
  /** Skills 目录（相对于项目根目录或用户主目录） */
  skillsDir: string;
  
  /** 
   * 自定义检测路径（可选）
   * 如果提供，将检查这些路径是否存在（文件或目录）
   * 如果未提供，将检查 skillsDir 是否存在
   */
  detectionPaths?: string[];
  
  /** 是否默认可用（用于 UI 预选择） */
  available?: boolean;
}

/**
 * 支持的 AI Agent 完整列表
 * 
 * 按优先级分组：
 * - 已支持：保持向后兼容
 * - 高优先级：用户量大
 * - 中优先级：增长快
 * - 低优先级：按需添加
 */
export const AGENT_REGISTRY: AgentConfig[] = [
  // ========================================================================
  // 已支持的 Agent（保持向后兼容）
  // ========================================================================
  {
    id: 'claude',
    name: 'Claude Code',
    skillsDir: '.claude/skills',
    available: true,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    skillsDir: '.claude/skills',  // Cursor 使用 Claude 标准路径
    available: true,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    skillsDir: '.github/skills',
    detectionPaths: [
      '.github/copilot-instructions.md',
      '.github/skills',
      '.github/prompts',
    ],
    available: true,
  },
  {
    id: 'qoder',
    name: 'Qoder',
    skillsDir: '.qoder/skills',
    available: true,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    skillsDir: '.opencode/skills',
    available: true,
  },

  // ========================================================================
  // 高优先级 Agent（用户量大）
  // ========================================================================
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    skillsDir: '.codex/skills',
    available: true,
  },
  {
    id: 'windsurf',
    name: 'Windsurf IDE',
    skillsDir: '.windsurf/skills',
    available: true,
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    skillsDir: '.gemini/skills',
    available: true,
  },
  {
    id: 'continue',
    name: 'Continue (VS Code/JetBrains)',
    skillsDir: '.continue/skills',
    available: true,
  },

  // ========================================================================
  // 中优先级 Agent（增长快）
  // ========================================================================
  {
    id: 'cline',
    name: 'Cline',
    skillsDir: '.cline/skills',
    available: true,
  },
  {
    id: 'kilocode',
    name: 'Kilo Code',
    skillsDir: '.kilocode/skills',
    available: true,
  },
  {
    id: 'roocode',
    name: 'RooCode',
    skillsDir: '.roo/skills',
    available: true,
  },
  {
    id: 'trae',
    name: 'Trae IDE',
    skillsDir: '.trae/skills',
    available: true,
  },

  // ========================================================================
  // 低优先级 Agent（按需添加）
  // ========================================================================
  {
    id: 'kiro',
    name: 'AWS Kiro',
    skillsDir: '.kiro/skills',
    available: true,
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    skillsDir: '.qwen/skills',
    available: true,
  },
  {
    id: 'lingma',
    name: '通义灵码 (Lingma)',
    skillsDir: '.lingma/skills',
    available: true,
  },
  {
    id: 'codebuddy',
    name: 'CodeBuddy',
    skillsDir: '.codebuddy/skills',
    available: true,
  },
  {
    id: 'amazon-q',
    name: 'Amazon Q Developer',
    skillsDir: '.amazonq/skills',
    available: true,
  },
  {
    id: 'iflow',
    name: 'iFlow',
    skillsDir: '.iflow/skills',
    available: true,
  },
  {
    id: 'junie',
    name: 'Junie',
    skillsDir: '.junie/skills',
    available: true,
  },
];

/**
 * 检测指定目录中可用的 Agent
 * 
 * @param basePath 基础目录（项目根目录或用户主目录）
 * @returns 可用的 Agent 配置列表
 */
export function detectAvailableAgentsIn(basePath: string): AgentConfig[] {
  return AGENT_REGISTRY.filter(agent => {
    // 优先检查自定义检测路径
    if (agent.detectionPaths && agent.detectionPaths.length > 0) {
      return agent.detectionPaths.some((detectionPath) => {
        try {
          const fullPath = join(basePath, detectionPath);
          statSync(fullPath);  // 文件或目录存在即可
          return true;
        } catch {
          return false;
        }
      });
    }

    // 回退到检查 skillsDir
    try {
      const skillsPath = join(basePath, agent.skillsDir);
      return statSync(skillsPath).isDirectory();
    } catch {
      return false;
    }
  });
}

/**
 * 检测项目中可用的 Agent
 * 
 * @param projectRoot 项目根目录
 * @returns 可用的 Agent 配置列表
 */
export function detectProjectAgents(projectRoot: string): AgentConfig[] {
  return detectAvailableAgentsIn(projectRoot);
}

/**
 * 检测全局安装的 Agent（检查用户主目录）
 * 
 * @returns 全局可用的 Agent 配置列表
 */
export function detectGlobalAgents(): AgentConfig[] {
  return detectAvailableAgentsIn(homedir());
}

/**
 * 根据 ID 获取 Agent 配置
 * 
 * @param agentId Agent 内部标识
 * @returns Agent 配置，如果不存在返回 undefined
 */
export function getAgentConfig(agentId: string): AgentConfig | undefined {
  return AGENT_REGISTRY.find(agent => agent.id === agentId);
}

/**
 * 获取所有支持的 Agent ID 列表
 */
export function getSupportedAgentIds(): string[] {
  return AGENT_REGISTRY.map(agent => agent.id);
}

/**
 * 获取 Agent 的 Skills 完整路径
 * 
 * @param agent Agent 配置
 * @param projectRoot 项目根目录（用于相对路径）
 * @returns Skills 完整路径
 */
export function getAgentSkillsPath(agent: AgentConfig, projectRoot?: string): string {
  if (agent.skillsDir.startsWith('.')) {
    // 相对路径
    return projectRoot 
      ? join(projectRoot, agent.skillsDir)
      : join(homedir(), agent.skillsDir);
  }
  // 绝对路径
  return agent.skillsDir;
}
