import { readdirSync, mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { select } from '@inquirer/prompts';
import { 
  detectProjectAgents, 
  detectGlobalAgents, 
  detectAvailableAgentsIn,
  getAgentConfig, 
  getAgentSkillsPath,
  AGENT_REGISTRY,
  type AgentConfig 
} from '../core/agent-registry.js';

export interface SkillInstallOptions {
  bundledSkillsDir: string;
  targetPath?: string;
  /** Agent ID to install for */
  agent?: string;
  /** Project root for detection */
  projectRoot?: string;
}

export interface SkillInstallResult {
  targetPath: string;
  installed: string[];
}

/**
 * 自动检测并选择目标路径
 */
export function detectTargetPath(
  projectRoot: string = process.cwd(),
  home: string = homedir(),
  agentId?: string
): { path: string; agent?: AgentConfig } {
  // 1. 检测项目目录
  const projectAgents = detectProjectAgents(projectRoot);
  
  // 2. 检测全局目录（使用传入的 home 参数）
  const globalAgents = detectAvailableAgentsIn(home);
  
  // 3. 合并并去重
  const allDetected = [...projectAgents, ...globalAgents];
  const uniqueAgents = Array.from(
    new Map(allDetected.map(a => [a.id, a])).values()
  );

  // 4. 如果指定了 agent，过滤
  let candidates = uniqueAgents;
  if (agentId) {
    candidates = uniqueAgents.filter(a => a.id === agentId);
  }

  // 5. 没有找到任何 Agent
  if (candidates.length === 0) {
    // 返回默认路径（Claude Code）
    const defaultAgent = getAgentConfig('claude');
    if (defaultAgent) {
      return {
        path: join(home, defaultAgent.skillsDir),
        agent: defaultAgent,
      };
    }
    return { path: join(home, '.claude', 'skills') };
  }

  // 6. 只有一个 Agent，直接使用
  if (candidates.length === 1) {
    return {
      path: getAgentSkillsPath(candidates[0], projectRoot),
      agent: candidates[0],
    };
  }

  // 7. 多个 Agent，优先使用项目目录的
  const projectAgent = candidates.find(a => 
    projectAgents.some(pa => pa.id === a.id)
  );
  if (projectAgent) {
    return {
      path: getAgentSkillsPath(projectAgent, projectRoot),
      agent: projectAgent,
    };
  }

  // 8. 使用第一个全局 Agent
  return {
    path: getAgentSkillsPath(candidates[0], projectRoot),
    agent: candidates[0],
  };
}

function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

/**
 * 安装 Skills 到指定目录
 */
export async function runSkillInstall(opts: SkillInstallOptions): Promise<SkillInstallResult> {
  let targetPath = opts.targetPath;
  let detectedAgent: AgentConfig | undefined;

  // 自动检测目标路径
  if (!targetPath) {
    const detection = detectTargetPath(
      opts.projectRoot || process.cwd(),
      homedir(),
      opts.agent
    );
    targetPath = detection.path;
    detectedAgent = detection.agent;
  }

  // 确保目录存在
  mkdirSync(targetPath, { recursive: true });

  // 执行安装
  const installed: string[] = [];
  if (!existsSync(opts.bundledSkillsDir)) {
    return { targetPath, installed };
  }

  for (const name of readdirSync(opts.bundledSkillsDir)) {
    const src = join(opts.bundledSkillsDir, name);
    if (!statSync(src).isDirectory()) continue;
    copyDir(src, join(targetPath, name));
    installed.push(name);
  }

  // 输出结果
  if (installed.length > 0) {
    const agentLabel = detectedAgent ? ` for ${detectedAgent.name}` : '';
    console.log(`\n✓ Installed ${installed.length} skill${installed.length > 1 ? 's' : ''}${agentLabel}`);
    console.log(`  → ${targetPath}`);
    console.log('\nSkills installed:');
    installed.forEach(skill => {
      console.log(`  - ${skill}`);
    });
    console.log('\n📋 Next step:');
    console.log('  In your AI agent, invoke: /issuer <your-requirement>');
  }

  return { targetPath, installed };
}

/**
 * 交互式选择 Agent 并安装
 */
export async function runSkillInstallInteractive(opts: SkillInstallOptions): Promise<SkillInstallResult> {
  const projectRoot = opts.projectRoot || process.cwd();
  
  // 检测可用的 Agent
  const projectAgents = detectProjectAgents(projectRoot);
  const globalAgents = detectGlobalAgents();
  
  // 合并并去重
  const allDetected = [...projectAgents, ...globalAgents];
  const uniqueAgents = Array.from(
    new Map(allDetected.map(a => [a.id, a])).values()
  );

  // 如果没有检测到任何 Agent
  if (uniqueAgents.length === 0) {
    console.log('No supported AI agent detected.');
    console.log('\nSupported agents:');
    AGENT_REGISTRY.forEach(agent => {
      console.log(`  - ${agent.name} (${agent.id}): ${agent.skillsDir}`);
    });
    console.log('\nPlease install an AI agent first, or specify target path:');
    console.log('  issuer skill install --target ~/.claude/skills');
    
    // 使用默认路径
    const defaultAgent = getAgentConfig('claude');
    if (defaultAgent) {
      opts.targetPath = getAgentSkillsPath(defaultAgent, projectRoot);
    }
    return runSkillInstall(opts);
  }

  // 如果只有一个 Agent，直接安装
  if (uniqueAgents.length === 1) {
    const agent = uniqueAgents[0];
    console.log(`✓ Detected ${agent.name}`);
    opts.targetPath = getAgentSkillsPath(agent, projectRoot);
    return runSkillInstall(opts);
  }

  // 多个 Agent，让用户选择
  type ChoiceValue = AgentConfig | 'all';
  const choices: { name: string; value: ChoiceValue }[] = uniqueAgents.map(agent => ({
    name: `${agent.name} (${agent.skillsDir})`,
    value: agent,
  }));

  // 添加"全部安装"选项
  choices.push({
    name: 'All detected agents',
    value: 'all' as ChoiceValue,
  });

  const selected = await select<ChoiceValue>({
    message: 'Which AI agent to install skills for?',
    choices,
  });

  if (selected === 'all') {
    // 安装到所有检测到的 Agent
    const allInstalled: string[] = [];
    let lastTarget = '';
    
    for (const agent of uniqueAgents) {
      const agentPath = getAgentSkillsPath(agent, projectRoot);
      const result = await runSkillInstall({
        ...opts,
        targetPath: agentPath,
      });
      allInstalled.push(...result.installed);
      lastTarget = result.targetPath;
    }
    
    return {
      targetPath: lastTarget,
      installed: allInstalled,
    };
  } else {
    // 安装到选中的 Agent
    opts.targetPath = getAgentSkillsPath(selected, projectRoot);
    return runSkillInstall(opts);
  }
}
