# @issuer/cli

> 技能驱动的项目管理网关。拆解需求 → 通过 MCP 同步到任意平台。内置支持：GitHub、GitLab、云效。

[English](README.md) | **中文**

`issuer` 由两个精简层组成：

- **技能 (Skills)** — Markdown 契约，约束编码 Agent 的 AI 如何将原始需求文本转换为结构化的 PM 工作项。`issuer` 本身不包含任何 AI；您已使用的 Agent 提供 AI 能力。
- **CLI** — 一个小型 Node.js 二进制文件，负责网络交互：将准备好的任务文件推送到 GitHub / GitLab / 云效。CLI 从不调用 LLM。

## 安装

```bash
npm i -g @issuer/cli
```

需要 Node.js 20+。

## 快速开始

```bash
# 1. 初始化项目（交互式，或传递参数）
issuer init -y --platform github --owner my-org --repo my-repo

# 2. 将捆绑的技能安装到您的 Agent 中
issuer skill install

# 3. 在您的 Agent（Claude / Qoder / Cursor / OpenCode / …）中调用：
#       /issuer
#    粘贴原始需求文本。技能链：breakdown → sync。
```

Agent 将：

1. 将原始文本拆分为 `.issuer/tasks/YYYY-MM-DD-<slug>.md` 文件，每个文件对应一个工作项，初始状态为 `status: draft`（`issuer-breakdown`）。
2. 询问您将哪些任务设置为 `status: ready`。
3. 将准备好的任务推送到配置的平台（`issuer-sync`）。

> **可选**：添加 `--refine` 标志或要求 Agent 先精炼需求，再拆解任务。

## 工作原理

两个核心技能通过显式用户检查点链接（refine 为可选）：

```
原始文本
  ├─▶ [可选: issuer-refine]  →  丰富的 PRD 风格简报 (.issuer/briefs/<slug>.md)
  │         [检查点 — 用户批准]
  └─▶ 阶段 1: issuer-breakdown  →  任务文件 (.issuer/tasks/*.md, status: draft)
          [检查点 — 用户选择要提升的任务]
  └─▶ 阶段 2: issuer-sync       →  远程工作项 (status: synced)
```

### `/issuer` — 编排器

主流程。通过阶段间的检查点链接 breakdown → sync。

| 阶段 | 技能 | 输出 | 检查点 |
|-------|-------|--------|------------|
| 0（可选） | `issuer-refine` | `.issuer/briefs/<slug>.md` | 用户批准简报文本 |
| 1 | `issuer-breakdown` | `.issuer/tasks/*.md` (draft) | 用户选择哪些文件 → ready |
| 2 | `issuer-sync` | 远程工作项 (synced) | 无 — 自动推送 ready 文件 |

**三种调用模式：**
- **快捷模式**: `/issuer <text>` — 直接进入 breakdown，仍需要阶段 1 检查点
- **交互模式**: `/issuer` — 询问是否先精炼，然后询问源范围和工作目录
- **带精炼**: `/issuer --refine <text>` 或明确要求精炼 → 运行 refine → breakdown → sync

### `/issuer-refine` — 精炼原始需求（可选）

> **注意**：此技能是可选的。仅在用户明确要求时运行。

将粗糙的需求文本**精炼**为专业的 PRD 风格简报。

**使用时机：**
- 需要结构和澄清的复杂需求
- 需要记录验收标准和假设时
- 输入模糊或不完整时

**关键步骤：**
1. **评估输入质量** — 五维评分（结构、专业措辞、可验证性、边界、假设）
2. **揭示假设** — 在进行之前列出模糊的解释
3. **重构模糊需求** — "更快" → "≤2秒"，"更好的用户体验" → "≤3步"
4. **编写简报** — 问题 / 目标 / 假设 / 边界 / 验收标准（复选框）

**输出**: `.issuer/briefs/<slug>.md`，标题本地化以匹配用户语言。

### `/issuer-breakdown` — 将简报拆分为任务

读取原始文本（或精炼的简报）并为每个工作项生成一个 Markdown 文件。

**平台自适应风格**：自动适配您平台的最佳实践 — **零配置即可使用**！

| 平台 | 风格 | 验收标准 | 工作量估算 |
|----------|-------|---------------------|-------------------|
| 云效 (Yunxiao) | 正式、结构化 | Given-When-Then 格式 | ✅ 必需 |
| GitHub | 随意、开发者友好 | Markdown 复选框 | ❌ 可选 |
| GitLab | 技术、精确 | 复选框 + 技术说明 | ❌ 可选 |

**关键步骤：**
1. **解析输入** — 识别工作项（bug/story/task/epic）
2. **应用平台风格** — 根据配置中的 `platform` 自动格式化
3. **写入任务文件** — `.issuer/tasks/YYYY-MM-DD-<slug>.md`，带有 YAML frontmatter
4. **展示批准提示** — 用户选择哪些文件设置为 `status: ready`

**自定义模板**（可选）：

内置平台使用 `skills/issuer-breakdown/templates/` 中的平台特定模板。对于未内置的平台或自定义工作流：

```bash
# 创建自定义模板
cp .issuer/templates/breakdown.md .issuer/templates/my-custom-template.md

# 添加到 config.yml
breakdown_template: .issuer/templates/my-custom-template.md
```

**输出格式：**
```yaml
---
id: 2026-05-07-fix-login
type: bug
title: 修复登录验证错误
status: draft  # → 用户选择后变为 ready
platform: github
labels: []
---
```

### `/issuer-sync` — 推送任务到平台

读取所有 `status: ready` 任务文件并创建/更新远程工作项。

**特性：**
- **MCP 优先**：如果可用，使用 MCP 工具
- **CLI 回退**：如果 MCP 缺少功能，回退到平台 API
- **去重检测**：将标题与缓存的远程问题进行比较
- **状态更新**：将成功同步的任务标记为 `status: synced`

## 平台设置

### 未内置平台（MCP 优先）

**任何具有 MCP 服务器的平台都可以支持** — 无需修改代码！

```bash
issuer init -y --platform "Other (MCP)" --owner my-workspace --repo my-project
```

初始化期间：
- 从平台列表中选择 "Other (MCP)"
- 提供您的工作空间/项目标识符
- 通过 `ISSUER_<PLATFORM>_TOKEN` 环境变量设置令牌
- Issuer 自动在 `.issuer/templates/breakdown.md` 创建通用拆解模板

CLI 使用 MCP 进行同步操作，使用通用模板进行任务生成。

### GitHub

```bash
issuer init -y --platform github --owner my-org --repo my-repo
```

**凭证**（按顺序解析）：

1. `ISSUER_GITHUB_TOKEN`
2. `GITHUB_TOKEN`
3. `~/.issuer/credentials.yml` → `github_token: ghp_xxxx`

在 [github.com/settings/tokens](https://github.com/settings/tokens) 创建具有 `repo` 范围的令牌。

**MCP**：如果 GitHub MCP 服务器已连接到您的 Agent，`issuer-sync` 将直接调用这些工具 — 不需要额外的凭证。

### 云效 (Yunxiao)

```bash
issuer init -y --platform yunxiao --owner <organizationId> --repo <spaceIdentifierId>
```

- `--owner` → 云效 organization ID（企业标识，从 `https://devops.aliyun.com/organization/<organizationId>` 中获取）
- `--repo` → 云效 project ID（spaceIdentifierId / projectId）

**凭证**（按顺序解析）：

1. `ISSUER_YUNXIAO_TOKEN`
2. `YUNXIAO_TOKEN`
3. `~/.issuer/credentials.yml` → `yunxiao_token: xxxx`

在云效 → 个人设置 → 个人访问令牌创建 Personal Access Token，勾选以下权限：
- **项目协作** (工作项读写) — 创建/更新/搜索工作项
- **组织管理 - 用户** (只读) — 首次推送时获取您的用户 ID（GetUserByToken API）

> **注意**：首次 `issuer push` 时，CLI 会自动通过 GetUserByToken API 获取您的用户 ID 并保存到 `.issuer/config.yml`。这需要「组织管理 - 用户」(只读) 权限。

**MCP**：云效 MCP (`alibabacloud-devops-mcp-server`) 目前覆盖 create/search/read (3/5)。更新和注释回退到 CLI 适配器，使用 `Bearer <PAT>` 身份验证调用云效 OpenAPI `openapi-rdc.aliyuncs.com` — 填补完整的 5/5 功能差距。

### GitLab

```bash
issuer init -y --platform gitlab --owner my-group --repo my-project
```

- `--owner` → GitLab 组或命名空间
- `--repo` → GitLab 项目名称或 ID

**MCP**：GitLab 内置 MCP 服务器（GitLab 18.6+，`https://<gitlab.example.com>/api/v4/mcp`）覆盖 create/search/read/comment (4/5)。`update` 回退到 CLI。

## 支持的 Agent

| Agent | 技能路径 | 说明 |
|-------|-------------|-------|
| **Claude Code** | `~/.claude/skills/` | 主要目标，[agentskills.io](https://agentskills.io) 发起者 |
| **Cursor** | `~/.claude/skills/` | 使用 Claude 标准（Nightly 频道） |
| **VS Code Copilot** | `~/.github/skills/` 或 `~/.copilot/skills/` | 多路径支持 |
| **Qoder / OpenCode** | `~/.qoder/skills/` | 自定义路径 |

### 使用特定 Agent 快速开始

```bash
# Claude Code
issuer init -y --platform github --owner my-org --repo my-repo --agent claude
issuer skill install --target ~/.claude/skills

# Cursor
issuer init -y --platform github --owner my-org --repo my-repo --agent cursor
issuer skill install --target ~/.claude/skills

# VS Code Copilot
issuer init -y --platform github --owner my-org --repo my-repo --agent copilot
issuer skill install --target ~/.github/skills

# Qoder / OpenCode
issuer init -y --platform github --owner my-org --repo my-repo --agent qoder
issuer skill install --target ~/.qoder/skills
```

### 自动检测（默认）

如果未指定 `--agent`，`issuer skill install` 会自动检测现有的技能目录：

```bash
issuer init -y --platform github --owner my-org --repo my-repo
issuer skill install  # 检测 ~/.claude/skills, ~/.copilot/skills 等
```

## 同步通道

`issuer-sync` 选择以下之一：

| 平台 | MCP 覆盖 | CLI 回退 |
|---|---|---|
| GitHub | 5/5（创建、更新、搜索、读取、注释） | 不需要 |
| GitLab | 4/5（缺少 `update`） | `issuer push` |
| 云效 | 3/5（缺少 `update`、`comment`） | `issuer push` → OpenAPI（完整 5/5） |

**MCP 优先** — 如果匹配的 MCP 服务器已连接到您的 Agent，技能将直接调用这些工具。

**CLI 回退** — 否则技能调用 `issuer push`，使用平台 SDK / OpenAPI 和从以下位置解析的令牌（按顺序）：
1. `ISSUER_<PLATFORM>_TOKEN`
2. `<PLATFORM>_TOKEN`
3. `~/.issuer/credentials.yml`

### 已测试的平台

| 平台 | MCP 通道 | CLI (API) 通道 | 说明 |
|---|---|---|---|
| GitHub | ✓ 所有测试通过 | ✓ 所有测试通过 | 两个通道均完整 5/5 |
| GitLab | ✓ 测试通过 | ✓ 测试通过 | MCP 缺少 `update`，CLI 覆盖缺口 |
| 云效 (Yunxiao) | ✓ 测试通过 | ✓ 所有测试通过 | MCP 3/5，CLI 通过 OpenAPI → 完整 5/5 |

两个通道对所有支持的平台都处于生产就绪状态。

### 添加新平台（MCP 优先，零代码集成）

**任何具有 MCP 服务器的平台都可以支持** — 不需要 REST API 适配器开发。

#### 选项 1：交互式初始化（推荐）

```bash
issuer init
# 从平台列表中选择 "Other (MCP)"
# 提供工作空间/项目 ID
```

Issuer 自动：
- 探测 MCP 服务器功能
- 创建通用拆解模板
- 配置令牌解析（`ISSUER_<PLATFORM>_TOKEN`）

#### 选项 2：手动设置

1. **在您的 Agent 中配置 MCP 服务器**（Claude Code、Cursor、Qoder 等）
2. **运行 `issuer init`** — issuer 探测 MCP 工具并将功能写入 `.issuer/config.yml`
3. **使用 `issuer-sync`** — 技能直接调用 MCP 工具

如果 MCP 工具不满足最低要求，issuer 会提示您提供选项：
- 修复 MCP 服务器配置
- 使用自定义拆解模板进行任务生成
- 开发自定义 REST 适配器（参见 [适配器开发](#适配器开发)）

#### MCP 检测工作原理

Issuer 使用启发式功能检测，通过关键字匹配：
- `create` + `issue/workitem/task` → 创建功能
- `get/read` + `issue/workitem/task` → 读取功能
- 相同逻辑用于 update、search、comment

**最低要求**：MCP 服务器必须至少公开 **create** 和 **read** 工具。

## 命令

| 命令 | 说明 |
|---|---|
| `issuer init` | 创建 `.issuer/config.yml` 和 `.issuer/tasks/` |
| `issuer status` | 按 `draft` / `ready` / `synced` 统计本地任务 |
| `issuer push` | 推送所有 `status: ready` 任务；标记为 `synced` |
| `issuer list-remote` | 列出配置的远程问题 |
| `issuer skill install` | 将捆绑的技能复制到您的 Agent 技能目录 |

## 项目布局

```
.issuer/
  config.yml           # platform + owner + repo + default labels + mcp_capabilities + dedup
  credentials.yml      # 平台令牌（可选，推荐使用环境变量）
  tasks/                # 每个文件一个工作项
    2026-05-06-add-login.md
  cache.json            # 缓存的远程问题（用于去重检测）
```

> **可选**：`.issuer/briefs/` 目录在使用 `issuer-refine` 时存储精炼的 PRD 风格简报。

每个任务文件都是 YAML frontmatter + Markdown 正文。完整架构和模式请参见 [docs/plans/2026-05-06-issuer-v2-design.md](docs/plans/2026-05-06-issuer-v2-design.md)。

## 状态

MVP。支持 GitHub、GitLab、云效 (Yunxiao)。

## 许可证

MIT。
