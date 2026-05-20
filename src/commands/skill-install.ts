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
 * 展开路径中的 ~ 为用户主目录
 */
function expandHome(p: string): string {
  if (p === '~') {
    return homedir();
  }
  // 支持 ~/path (Unix) 和 ~\path (Windows) 格式
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return join(homedir(), p.slice(2));
  }
  return p;
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
  } else {
    // 展开用户提供的路径中的 ~
    targetPath = expandHome(targetPath);
  }

  // 确保目录存在
  mkdirSync(targetPath, { recursive: true });

  // 执行安装
  const installed: string[] = [];
  if (!existsSync(opts.bundledSkillsDir)) {
    console.log(`\n⚠ Skills directory not found: ${opts.bundledSkillsDir}`);
    console.log('  This may be a packaging issue. Please report to the issuer maintainers.');
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
    if (detectedAgent) {
      console.log(`  In ${detectedAgent.name}, invoke: /issuer <your-requirement>`);
    } else {
      console.log('  In your AI agent, invoke: /issuer <your-requirement>');
    }
  } else {
    console.log(`\n⚠ No skills found in: ${opts.bundledSkillsDir}`);
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

  // 排序优先度：1. Universal Agents (agents), 2. Claude Code (claude), 3. Cursor (cursor)
  const priorityOrder = ['agents', 'claude', 'cursor'];
  uniqueAgents.sort((a, b) => {
    const idxA = priorityOrder.indexOf(a.id);
    const idxB = priorityOrder.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });

  // 如果没有检测到任何 Agent
  if (uniqueAgents.length === 0) {
    console.log('No supported AI agent detected.');
    console.log('\nSupported agents:');
    AGENT_REGISTRY.forEach(agent => {
      console.log(`  - ${agent.name} (${agent.id}): ${agent.skillsDir}`);
    });
    console.log('\nPlease install an AI agent first, or specify target path:');
    const homeDir = homedir();
    console.log(`  issuer skill install --target "${join(homeDir, '.claude', 'skills')}"`);
    
    // 使用默认路径（Claude Code）
    const defaultAgent = getAgentConfig('claude');
    if (defaultAgent) {
      // 优先使用全局路径
      opts.targetPath = getAgentSkillsPath(defaultAgent, projectRoot, true);
    }
    return runSkillInstall(opts);
  }

  // 如果只有一个 Agent，直接安装
  if (uniqueAgents.length === 1) {
    const agent = uniqueAgents[0];
    console.log(`✓ Detected ${agent.name}`);
    
    const scope = await select<'global' | 'local'>({
      message: `Which installation scope do you prefer for ${agent.name}?`,
      choices: [
        { name: `User level (Global, e.g. ~/${agent.skillsDir})`, value: 'global' },
        { name: `Workspace level (Local project, e.g. ./${agent.skillsDir})`, value: 'local' },
      ],
    });
    const preferGlobal = scope === 'global';

    opts.targetPath = getAgentSkillsPath(agent, projectRoot, preferGlobal);
    return runSkillInstall(opts);
  }

  // 多个 Agent，让用户选择
  type ChoiceValue = AgentConfig | 'all';
  const choices: { name: string; value: ChoiceValue }[] = uniqueAgents.map(agent => ({
    name: `${agent.name} (${agent.skillsDir})`,
    value: agent,
  }));
  
  // 添加“全部安装”选项
  choices.push({
    name: 'All detected agents',
    value: 'all' as ChoiceValue,
  });
  
  const selected = await select<ChoiceValue>({
    message: 'Which AI agent to install skills for?',
    choices,
  });

  const scope = await select<'global' | 'local'>({
    message: 'Which installation scope do you prefer?',
    choices: [
      { name: 'User level (Global, in user home directory)', value: 'global' },
      { name: 'Workspace level (Local project, in current project directory)', value: 'local' },
    ],
  });
  const preferGlobal = scope === 'global';
  
  if (selected === 'all') {
    // 安装到所有检测到的 Agent
    const allInstalled: string[] = [];
    let lastTarget = '';
      
    for (const agent of uniqueAgents) {
      const agentPath = getAgentSkillsPath(agent, projectRoot, preferGlobal);
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
    opts.targetPath = getAgentSkillsPath(selected, projectRoot, preferGlobal);
    return runSkillInstall(opts);
  }
}
