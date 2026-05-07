# PMAgent — 产品需求文档 (v1.1)

## 文档信息

| 字段 | 值 |
|------|-----|
| 产品名称 | PMAgent |
| 版本 | 1.1 |
| 最后更新 | 2026-05-06 |
| 目标用户 | 编程 Agent（Claude Code、OpenCode、Gemini CLI、Codex CLI 等）及其使用者 |
| 核心理念 | AI 驱动的项目管理网关，让 Agent 能够以自然语言管理需求、任务、缺陷，并同步至任意项目管理平台 |

---

## 1. 产品概述

### 1.1 问题陈述

编程 Agent 在执行开发任务时，需要频繁与项目管理工具交互（创建需求、记录缺陷、拉取待办任务、关联代码提交等）。当前痛点包括：

- Agent 无法直接操作 Jira、GitHub Issues 等平台，需要人工搬运。
- 用户用自然语言描述需求后，Agent 无法自动将其转化为规范的工作项并同步到系统中。
- 不同项目管理平台（Jira、GitHub、GitLab、云效等）的 API 模型、字段、状态流差异巨大，Agent 难以适配。
- 项目管理工作流（需求拆解、任务分配、缺陷跟踪）本身需要专业结构，而 Agent 缺乏领域知识。

### 1.2 产品定位

PMAgent 是一个**本地运行的中介服务**，位于编程 Agent 与项目管理平台之间。它：

- 接收 Agent 传来的自然语言或结构化输入。
- 利用 AI 能力对输入进行理解、完善、结构化拆解。
- 将结果转换为目标平台可接受的工作项格式。
- 通过可插拔的适配器，将工作项推送到指定项目管理平台。
- 维护本地同步状态，支持**全双向同步**。

### 1.3 产品目标

| 目标 | 衡量标准 |
|------|----------|
| 降低 Agent 使用项目管理工具的门槛 | Agent 只需传递原始文本，无需关心平台差异 |
| 提升工作项质量 | AI 自动补全描述、验收标准、重现步骤 |
| 实现跨平台统一管理 | 同一套输入可输出到 Jira、GitHub、GitLab 或云效 |
| 支持第三方扩展 | 社区可为新平台开发适配器，无需修改核心代码 |
| 保证数据安全 | 所有凭证本地存储；AI 处理可选用本地模型 |

---

## 2. 用户角色与使用场景

### 2.1 主要用户：编程 Agent

Agent 通过 MCP Tools 或 CLI 命令调用 PMAgent。

| 场景 | Agent 行为 | PMAgent 职责 |
|------|------------|--------------|
| 用户提出新需求 | Agent 调用 `create`，传入对话文本 | AI 完善为 Story，推送到平台，返回 Issue Key |
| 开发中遇到缺陷 | Agent 调用 `create`，附上错误日志 | AI 生成缺陷报告（重现步骤、环境），推送 Bug |
| 开始编码前获取上下文 | Agent 调用 `list` | 从平台拉取未完成工作项，返回结构化列表 |
| 提交代码后关联 | Agent 调用 `link`，传递任意 git 引用 | 自动识别引用类型（PR/MR/Commit/Branch），关联到工作项 |
| 完成任务后 | Agent 调用 `update`，标记状态为 Done | 同步更新平台状态，更新本地记录 |
| 同步最新状态 | Agent 调用 `sync` | 双向同步：推送本地变更，拉取远端变更，检测冲突 |

### 2.2 次要用户：人类开发者

- 通过 Agent 间接使用 PMAgent，也可直接使用 CLI 工具手工管理工作项。
- 配置 PMAgent（设置目标平台、API 认证、项目映射、AI 模型偏好、同步策略）。

### 2.3 第三方适配器开发者

- 为 PMAgent 开发新平台的适配器（如 Trello、ClickUp、Azure DevOps）。
- 遵循 PMAgent 公开的适配器接口规范。
- 适配器通过 **stdio** 或 **本地 HTTP** 与 PMAgent 核心通信——不支持进程内加载。

---

## 3. 核心功能

### 3.1 工作项类型与生命周期

#### 3.1.1 统一工作项类型

| 类型 | 描述 | 平台映射示例 |
|------|------|-------------|
| **Epic（史诗）** | 大型业务目标，包含多个 Story | Jira Epic、GitHub Milestone、GitLab Epic |
| **Story（需求）** | 面向用户的可交付价值 | Jira Story、GitHub Issue (label:feature)、GitLab Issue |
| **Task（任务）** | 为完成 Story 产生的具体开发工作 | Jira Task/Sub-task、GitHub Issue (label:task)、GitLab Issue |
| **Bug（缺陷）** | 软件行为与预期不符的问题 | Jira Bug、GitHub Issue (label:bug)、GitLab Issue (label:bug) |

#### 3.1.2 内部生命周期状态

```
草稿(Draft) → 待同步(Pending Sync) → 已同步(Synced) → 失败(Failed) → 已删除(Deleted)
                      ↑                        |
                      +-------- 重试(Retry) ----+
```

| 状态 | 说明 |
|------|------|
| **草稿** | 本地已创建，AI 增强进行中或等待用户确认 |
| **待同步** | 已就绪，可推送到平台 |
| **已同步** | 成功与平台同步；已记录平台 ID |
| **失败** | 推送/同步失败；已存储错误详情；可重试 |
| **已删除** | 本地软删除（是否从平台删除取决于配置） |

#### 3.1.3 平台同步状态（双向同步用）

| 同步状态 | 说明 |
|----------|------|
| **一致** | 本地与远端内容哈希一致 |
| **本地已修改** | 本地有变更未推送 |
| **远端已修改** | 平台有变更未拉取 |
| **冲突** | 自上次同步后本地和远端均有修改 |

### 3.2 AI 智能增强模块

**输入**：原始自然语言（可能不完整、口语化、含截图 OCR 文本、错误日志等）。  
**输出**：结构化的标准工作项。

#### 3.2.1 内容完善

| 类型 | AI 生成内容 |
|------|------------|
| **Story（需求）** | 背景说明、用户故事（As a… I want… so that…）、验收标准（Given…When…Then…）、非功能需求、优先级建议 |
| **Bug（缺陷）** | 标题、描述、重现步骤、预期结果、实际结果、环境/版本信息、严重程度建议 |
| **Task（任务）** | 技术方案、依赖项、产出物、估算工作量、完成定义 |

#### 3.2.2 任务拆解

当输入是一个中等粒度需求时，AI 自动拆解为若干子任务：

- **粒度原则**：每个子任务工作量为 0.5～2 天。
- **依赖模型**：通过可选的 `depends_on` 字段声明显式依赖图。
  - 未声明 `depends_on` 的子任务默认可并行执行。
  - 声明了依赖的子任务需等待依赖项完成。
- **完整性**：每个子任务包含独立的完成定义（DoD）。

**子任务数据结构**：
```json
{
  "id": "sub-1",
  "title": "实现登录 API 端点",
  "description": "...",
  "depends_on": [],          // 可选，空数组 = 无依赖
  "estimated_effort": "1d",
  "definition_of_done": "API 在有效凭证下返回 JWT token；单元测试通过"
}
```

#### 3.2.3 规范文档生成（可选，非 MVP 范围）

- **PRD 生成**：Markdown 格式，可本地保存或作为附件推送到平台。
- **测试用例生成**：Gherkin 格式（Given-When-Then），可导出。
  - 云效：优先通过 Testhub API 直接创建用例（平台测试管理最完善）。
  - 其他平台：生成 Gherkin 文件存储到本地或代码仓库。

### 3.3 推送行为配置

推送行为**按项目可配置**，控制 AI 增强后的工作项是自动推送还是需要确认：

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| **auto-push（自动推送）** | AI 生成 → 立即推送到平台 | 信任度高的工作流、高频场景 |
| **confirm-then-push（确认后推送）**（默认） | AI 生成 → 返回草稿给 Agent/用户 → 用户确认 → 再推送 | 安全优先，发布前审查 |

配置示例：
```yaml
projects:
  my-project:
    push_mode: confirm-then-push  # 或 "auto-push"
```

### 3.4 多平台适配中心

#### 3.4.1 适配器通信协议

**所有适配器**（内置和第三方）均通过以下两种机制之一与 PMAgent 核心通信：

| 协议 | 说明 | 适用场景 |
|------|------|----------|
| **stdio** | PMAgent 将适配器作为子进程启动；通过 stdin/stdout 传输 JSON 消息 | 轻量级适配器，任意语言实现 |
| **本地 HTTP** | 适配器作为独立本地服务运行；PMAgent 通过 localhost HTTP 调用 | 长期运行的适配器，需共享状态 |

不支持进程内/动态库加载。这确保了：
- 适配器开发语言无关。
- 进程隔离（适配器崩溃不影响核心）。
- 无论适配器来源，接口统一。

#### 3.4.2 适配器接口契约

每个适配器必须实现：

| 能力 | 方法 | 说明 |
|------|------|------|
| **创建** | `create_item(work_item) → platform_id, url` | 在平台创建工作项 |
| **更新** | `update_item(platform_id, changes) → success` | 更新字段/状态 |
| **查询** | `query_items(filters, pagination) → items[]` | 分页搜索/列表 |
| **删除** | `delete_item(platform_id) → success` | 从平台删除 |
| **关联代码** | `link_code(platform_id, code_ref) → success` | 将代码引用附加到工作项 |
| **获取元数据** | `get_metadata() → types, fields, statuses` | 获取平台 schema |
| **健康检查** | `health() → status` | 验证适配器连通性 |

#### 3.4.3 平台元数据自动发现

适配器从平台获取元数据（可用工作项类型、字段定义、状态流转图），用于：
- 帮助用户在 `pmagent init` 时配置字段映射。
- 推送前验证工作项格式。
- 展示可用状态用于流转操作。

#### 3.4.4 内置适配器（官方提供）

按开发优先级排列：

| 优先级 | 适配器 | 平台 | 范围 | 交付阶段 |
|--------|--------|------|------|----------|
| P0 | github | GitHub | Issues、Projects、Milestones | 阶段一（MVP） |
| P1 | yunxiao | 阿里云效 | 工作项 | 阶段二 |
| P1 | gitlab | GitLab | Issues、Epics | 阶段二 |
| P2 | jira | Jira | Software / Work Management | 阶段三 |
| P2+ | 其他 | 社区贡献 | 视适配器而定 | 阶段三+ |

### 3.5 代码关联（自动识别）

`link_to_code` 能力接受**任意 git 引用**并自动识别其类型：

| 引用类型 | 识别模式 | 平台操作 |
|----------|----------|----------|
| **Pull Request / Merge Request** | URL 包含 `/pull/` 或 `/merge_requests/` | 将 PR/MR 关联到工作项 |
| **Commit SHA** | 7-40 位十六进制字符串 | 将 commit 关联到工作项 |
| **Branch 名称** | 匹配分支模式的字符串（如 `feature/xxx`） | 将分支关联到工作项 |
| **混合 URL** | 完整的 GitHub/GitLab URL | 自动解析并分类 |

Agent 只需传递任意引用；PMAgent 负责分类并执行平台特定的关联操作。

### 3.6 双向同步与冲突解决

#### 3.6.1 同步机制

- **推送（Push）**：本地变更 → 平台（创建/更新）。
- **拉取（Pull）**：平台变更 → 本地（通过内容哈希比对检测修改）。
- **增量同步**：仅同步自上次同步时间戳以来变更的项目。
- **自动重试**：失败的同步最多重试 3 次，采用指数退避（1s、2s、4s）。

> **分阶段实现说明**：
> - **MVP（阶段一）**：Push 完整支持；Pull 为只读拉取 + 本地 diff 比对；冲突检测可识别但仅支持 `prompt` 策略（暂停并提示用户决定）。
> - **阶段二**：完整增量同步；支持全部四种冲突解决策略（platform-wins / local-wins / last-write-wins / prompt）；自动合并能力。

#### 3.6.2 冲突解决策略

冲突策略**按项目可配置**：

| 策略 | 行为 |
|------|------|
| **platform-wins（平台优先）** | 冲突时平台版本覆盖本地 |
| **local-wins（本地优先）** | 冲突时本地版本推送覆盖平台 |
| **last-write-wins（最后写入优先）** | 比较修改时间戳，较新版本胜出 |
| **prompt（提示）**（默认） | 暂停冲突项的同步；通知 Agent/用户决定 |

配置示例：
```yaml
projects:
  my-project:
    conflict_strategy: prompt  # platform-wins | local-wins | last-write-wins | prompt
```

#### 3.6.3 冲突检测机制

- 每个已同步项存储 `content_hash`（有意义字段的 SHA-256 哈希）。
- 拉取时：比较远端哈希与上次同步时存储的哈希。
- 推送时：比较本地哈希与上次同步时存储的哈希。
- 如果两者都与存储哈希不同 → 检测到冲突 → 应用配置的策略。

### 3.7 本地存储与状态管理

PMAgent 维护本地 SQLite 数据库，包含：

| 表/存储 | 用途 |
|---------|------|
| **work_items** | 所有工作项的本地副本（原始输入、AI 增强结果、内部状态、平台 ID、内容哈希） |
| **sync_log** | 每次同步操作记录（时间戳、请求/响应摘要、错误） |
| **project_configs** | 项目配置（平台、凭证引用、映射） |
| **adapter_registry** | 已安装适配器及其连接信息 |

特性：
- 事务安全操作。
- 自动每日备份（可配置）。
- 数据库恢复：从备份恢复或重建索引。
- 导出/导入能力用于迁移。

### 3.8 项目配置

每个项目配置包含：

```yaml
project_name: my-project
platform: github                    # 使用的适配器
endpoint: https://api.github.com    # API 端点
credentials_ref: my-github-token    # 加密凭证引用
project_id: owner/repo              # 平台特定项目标识

push_mode: confirm-then-push        # auto-push | confirm-then-push
conflict_strategy: prompt           # platform-wins | local-wins | last-write-wins | prompt

field_mappings:
  priority:
    high: P1
    medium: P2
    low: P3
  type:
    story: enhancement
    bug: bug
    task: task

defaults:
  parent_epic: EPIC-001             # 新建 Story 自动挂载到此 Epic
  assignee: auto                    # auto = 当前用户

ai:
  provider: openai                  # openai | ollama | anthropic
  model: gpt-4o
  temperature: 0.3
  max_tokens: 4096
  enhancements:
    content_completion: true
    task_decomposition: true
    prd_generation: false
    test_case_generation: false
```

### 3.9 集成接口

#### 3.9.1 MCP 协议接口（推荐用于 Claude Code / OpenCode）

PMAgent 作为 MCP Server 运行，暴露以下 Tools：

| Tool | 参数 | 返回值 |
|------|------|--------|
| `create_work_item` | `raw_text`, `type_hint?`, `project?`, `parent_id?` | `{local_id, platform_id?, url?, status, enhanced_content}` |
| `list_work_items` | `status?`, `type?`, `assignee?`, `project?`, `page?`, `limit?` | `{items[], total, page}` |
| `update_work_item` | `id`, `status?`, `description?`, `assignee?`, `fields?` | `{success, sync_status}` |
| `link_to_code` | `work_item_id`, `code_ref` | `{success, ref_type_detected, platform_link?}` |
| `get_sync_status` | `work_item_id?`, `project?` | `{items_status[], last_sync, conflicts[]}` |
| `sync` | `project?`, `direction?` | `{pushed, pulled, conflicts[], errors[]}` |
| `decompose_task` | `work_item_id` 或 `raw_text`, `project?` | `{sub_tasks[], dependency_graph}` |

#### 3.9.2 命令行接口（通用）

```
pmagent init                                          # 交互式配置向导
pmagent create --type <story|task|bug> --text <...>  # 创建工作项
        [--project <name>] [--parent <id>] [--no-ai]
pmagent list [--status <pending|done|all>]            # 列出工作项
        [--type <story|task|bug>] [--project <name>]
pmagent update --id <id> --status <new_status>        # 更新工作项
        [--fields <json>]
pmagent link --work-item <id> --code-ref <ref>        # 关联代码引用
pmagent sync [--project <name>] [--direction <push|pull|both>]  # 双向同步
pmagent status [--id <id>]                            # 查看同步状态
pmagent adapter install <package_source>              # 安装适配器
pmagent adapter list                                  # 列出已安装适配器
pmagent adapter remove <name>                         # 移除适配器
```

所有命令默认输出 JSON（供 Agent 消费），可通过 `--human` 标志获取格式化输出。

### 3.10 第三方适配器开发与分发

- 适配器为独立可执行程序或服务（任意语言）。
- 通过 stdio（推荐）或本地 HTTP 与核心通信。
- 必须实现完整的适配器接口契约（§3.4.2）。
- 安装方式：`pmagent adapter install <git-url | local-path | registry-name>`。
- 适配器清单文件（`pmagent-adapter.json`）：

```json
{
  "name": "trello",
  "version": "1.0.0",
  "protocol": "stdio",
  "executable": "./trello-adapter",
  "platforms": ["windows", "macos", "linux"],
  "author": "community",
  "description": "PMAgent 的 Trello 看板适配器"
}
```

### 3.11 数据安全与隐私

| 关注点 | 解决方案 |
|--------|----------|
| API Token 存储 | 系统密钥链（Windows Credential Manager / macOS Keychain / Linux Secret Service）或 AES-256 加密本地文件 |
| AI 数据处理（本地模式） | 调用本地模型（Ollama 等），数据不离开机器 |
| AI 数据处理（云端模式） | 使用用户自己的 API Key；HTTPS 传输；不与第三方共享数据 |
| 日志记录 | 凭证不写入日志；可选的敏感字段脱敏模式 |
| 适配器信任 | 非受信来源的适配器需用户显式确认；鼓励开源审查 |

---

## 4. 产品架构

### 4.1 逻辑架构

```
+----------------+      +------------------------------------+
|  编程 Agent    |      |           PMAgent 核心              |
| (Claude Code等) | <--> | +--------------------------------+ |
+----------------+      | |    集成接口层                    | |
                        | | - MCP Server                    | |
                        | | - CLI Parser                    | |
                        | +--------------------------------+ |
                        | |    AI 增强与拆解模块             | |
                        | | - 内容完善引擎                   | |
                        | | - 任务拆解器（依赖图）           | |
                        | | - PRD/测试用例生成器(可选)       | |
                        | +--------------------------------+ |
                        | |    本地存储与状态管理            | |
                        | | - SQLite 工作项仓库             | |
                        | | - 同步日志                      | |
                        | | - 冲突检测器                    | |
                        | +--------------------------------+ |
                        | |    适配器调度中心                | |
                        | | - 适配器注册表                  | |
                        | | - 请求路由                      | |
                        | | - 进程管理（启动/停止/健康检查） | |
                        | +--------------------------------+ |
                        +------------------------------------+
                                     |
                                     | (stdio / 本地 HTTP)
                                     v
        +------------+  +------------+  +------------+
        | Jira适配器 |  | GitHub适配器|  | 云效适配器  |  ... (第三方)
        +------------+  +------------+  +------------+
               |                |                |
               v                v                v
            Jira API        GitHub API        云效 API
```

### 4.2 核心组件职责

| 组件 | 职责 |
|------|------|
| **集成接口层** | 接收 Agent 请求（MCP/CLI），参数校验，调用内部服务，返回统一格式响应 |
| **AI 增强与拆解模块** | 调用 AI 模型（本地/云端）完成内容完善、任务拆解。各能力可独立开关 |
| **本地存储与状态管理** | 维护工作项生命周期状态、同步状态、配置信息。提供事务性操作、备份恢复 |
| **适配器调度中心** | 根据当前激活的项目配置，动态加载对应适配器进程，路由标准化工作项请求 |
| **平台适配器** | 实现与具体平台 API 的交互。每个适配器独立部署，通过 stdio/HTTP 通信 |

### 4.3 数据流：创建工作项

```
Agent                   接口层          AI模块         存储            调度中心         适配器          平台
  |                       |               |             |               |              |             |
  |-- create(text,type) ->|               |             |               |              |             |
  |                       |-- enhance() ->|             |               |              |             |
  |                       |<- 结构化项 ---|             |               |              |             |
  |                       |-- save(draft) ------------>|               |              |             |
  |                       |               |             |               |              |             |
  |           [若 push_mode = auto-push]  |             |               |              |             |
  |                       |-- push() ---------------------------->|              |             |
  |                       |               |             |               |-- create() ->|             |
  |                       |               |             |               |              |-- POST -->  |
  |                       |               |             |               |              |<- id,url -- |
  |                       |               |             |<-- 更新状态=已同步 ---------|              |
  |<-- {local_id, platform_id, url} ------|             |               |              |             |
  |                       |               |             |               |              |             |
  |       [若 push_mode = confirm-then-push]            |               |              |             |
  |<-- {local_id, draft, awaiting_confirmation} --------|               |              |             |
```

### 4.4 数据流：双向同步

```
存储                   调度中心          适配器           平台
 |                       |               |              |
 |== 推送阶段 ===========|               |              |
 |-- 获取本地已修改项 -->|               |              |
 |                       |-- update() -->|              |
 |                       |               |-- PUT ----->|
 |                       |               |<-- 成功 ----|
 |<-- 标记已同步,更新哈希|               |              |
 |                       |               |              |
 |== 拉取阶段 ===========|               |              |
 |                       |-- query() --->|              |
 |                       |               |-- GET ----->|
 |                       |               |<-- items ---|
 |<-- 比较哈希 ---------|               |              |
 |                       |               |              |
 | [无冲突] 更新本地副本  |               |              |
 | [有冲突] 标记冲突,应用策略             |              |
```

### 4.5 扩展性设计

- **新增平台**：仅需开发新适配器（实现接口契约），无需改动 PMAgent 核心。
- **新增 AI 能力**：AI 模块设计为可插拔处理器（需求完善器、任务拆解器、测试用例生成器），通过配置启用/禁用。
- **新增集成方式**：未来可增加 WebSocket 或 HTTP REST API，适应更多 Agent。

---

## 5. 约束与非功能需求

### 5.1 运行约束

| 约束 | 要求 |
|------|------|
| **部署方式** | 必须在用户本地或用户可控的内网服务器运行；不依赖中心化服务 |
| **跨平台** | 支持 Windows、macOS、Linux |
| **资源占用** | 空闲内存 < 100MB；不强制要求 GPU（本地 AI 模型路径用户可配置） |
| **离线能力** | 可离线创建/编辑/存储工作项；网络恢复后自动同步；AI 增强使用云端模型时需网络 |
| **安全性** | API Token 等秘密不得以明文写入日志或配置文件 |
| **可观测性** | 可配置日志级别（debug/info/warn/error）；结构化 JSON 日志 |

### 5.2 性能要求

| 指标 | 目标 |
|------|------|
| API 响应（不含 AI 处理时间） | < 2 秒 |
| AI 增强处理（本地模型） | < 10 秒/次 |
| AI 增强处理（云端模型） | < 15 秒/次 |
| 并发请求处理 | ≥ 5 个并行请求 |
| 同步吞吐量 | ≥ 50 项/分钟 |

### 5.3 可靠性要求

- 网络请求失败时自动重试（最多 3 次，指数退避：1s、2s、4s）。
- 异步同步任务支持断点续传。
- 数据库损坏时具备恢复机制（从备份恢复或重建索引）。
- 适配器崩溃：进程隔离，核心继续运行；记录错误日志。

### 5.4 易用性要求

- 提供交互式配置向导（`pmagent init`），引导用户完成首次项目配置。
- 错误信息明确提示原因（如"认证失败：Token 已过期。请运行 `pmagent init` 更新凭证。"）。
- `--verbose` 标志提供详细调试输出。
- 提供完整文档：适配器开发指南、Agent 集成示例、配置参考。

---

## 6. 交付路线图

### 阶段一：MVP（核心闭环）

| 功能 | 范围 |
|------|------|
| CLI 接口 | `create`、`list`、`update`、`link`、`sync`、`status` 命令 |
| AI 内容完善 | 支持 Story 和 Bug 类型；可配置 prompt 模板 |
| 任务拆解 | 可选的 `depends_on` 依赖图 |
| 本地存储 | SQLite，含备份/恢复 |
| 推送行为 | 可配置自动推送或确认后推送 |
| 双向同步 | 推送：完整支持；拉取：只读拉取 + 本地 diff；冲突：默认 `prompt` 策略（完整冲突自动解决延至阶段二） |
| 代码关联 | 自动识别 PR/MR、Commit、Branch 引用 |
| 内置适配器 | **GitHub Issues**（stdio 协议）— 最高优先级 |
| 配置管理 | 交互式 `pmagent init` 向导；YAML 配置文件 |

### 阶段二：增强集成

| 功能 | 范围 |
|------|------|
| MCP Server | 完整 MCP 协议支持，适配 Claude Code / OpenCode |
| 增加适配器 | **云效、GitLab**（内置，stdio）— P1 优先级 |
| 完整双向同步 | 增量同步、冲突自动解决策略（platform-wins / local-wins / last-write-wins） |
| PRD 生成 | 可选的 Markdown PRD 从需求生成 |
| 测试用例生成 | 可选的 Gherkin 格式输出（优先对接云效 Testhub；其他平台生成本地文件） |
| 适配器热加载 | 无需重启核心即可添加/移除适配器 |

### 阶段三：开放生态

| 功能 | 范围 |
|------|------|
| 适配器 SDK 与文档 | 发布接口规范、示例适配器模板 |
| 动态适配器加载 | `pmagent adapter install` 支持从 git/registry 安装 |
| Jira 适配器 | Jira Software / Work Management — P2 优先级 |
| 第三方适配器支持 | 社区贡献的其他平台适配器 |
| Web 仪表板（可选） | 查看同步状态、可视化解决冲突 |

### 阶段四：高级功能

| 功能 | 范围 |
|------|------|
| Webhook 接收器 | 实时接收平台变更通知 |
| 冲突可视化 | 交互式冲突解决界面 |
| 多模型 AI 路由 | 不同增强任务路由到不同模型 |
| Agent 插件系统 | 为主流 Agent 提供预置集成配置 |

---

## 7. 成功度量指标

| 指标 | 目标 | 衡量方式 |
|------|------|----------|
| 采用率 | 首月 500+ 下载 | 包管理器统计 |
| 效率提升 | 从提出需求到创建工作项的耗时降低 70% | 用户调研 |
| AI 结构完整性 | >80% 生成的工作项结构完整（格式和模板正确，具体内容可能需微调） | 结构校验通过率 |
| 适配器生态 | 发布 3 个月后社区贡献 ≥5 个适配器 | 注册表统计 |
| 稳定性 | API 调用失败率 <1%（排除平台自身故障） | 错误日志 |
| 同步正确性 | 0 次因冲突解决导致的数据丢失 | 事故报告 |

---

## 8. 风险与应对

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| AI 生成质量不达预期 | 中 | 高 | 多模型选择；默认确认后再推送；收集反馈优化 prompt；目标为"结构完整"而非"内容完美" |
| 平台 API 变更导致适配器失效 | 中 | 中 | 适配器版本锁定；适配器级错误检测；社区快速修复机制 |
| 第三方适配器安全漏洞 | 低 | 高 | 开源审查要求；信任分级（官方/验证/社区）；沙箱化进程执行 |
| 本地数据库损坏 | 低 | 中 | 自动每日备份；导出/导入；从平台重建能力 |
| 冲突解决导致数据丢失 | 低 | 高 | 默认策略=提示（人工决定）；所有解决操作审计日志；撤销能力 |
| 适配器进程不稳定 | 中 | 低 | 进程隔离；自动重启（含退避）；健康检查监控 |

---

## 9. 待决问题（实施前需确认）

| # | 问题 | 选项 | 决定截止 |
|---|------|------|----------|
| 1 | ~~技术栈选择（语言、框架）~~ | **已决定：TypeScript** | ✅ 已确认 |
| 2 | ~~AI prompt 版本管理策略~~ | **混合方案：内置默认 + 外部文件覆盖** | ✅ 已确认 |
| 3 | ~~凭证加密方式~~ | **MVP 暂不加密（明文存储，后续迭代补充）** | ✅ 已确认 |
| 4 | ~~内置适配器优先使用的协议~~ | **stdio** | ✅ 已确认 |
| 5 | 目标 MCP SDK 版本 | 实施时的最新稳定版 | 阶段二启动前 |

---

## 9.1 基于调研的设计决策记录

以下决策基于对 GitHub / GitLab / 云效 / Jira 四大平台的调研结果：

| # | 决策 | 原因 |
|---|------|------|
| D1 | 状态模型采用二层架构（语义状态层 + 平台状态层） | GitHub/GitLab 是二态模型（Open/Closed），云效/Jira 是多态工作流；不可硬编码统一状态集 |
| D2 | MVP 双向同步简化为「Push 完整 + Pull 只读 + 冲突仅 prompt」 | 完整冲突自动解决涉及内容 normalize、哈希比对、平台自动化规则干扰等复杂场景，MVP 应聚焦核心闭环 |
| D3 | AI 增强目标从"无需修改 >80%"调整为"结构完整 >80%" | Agent 传入的 raw_text 往往非常简短，AI 难以凭空补全完整业务细节；结构正确是底线，内容微调由用户完成 |
| D4 | 测试用例生成标记为可选且非 MVP | GitHub 无测试管理，GitLab 简陋，Jira 依赖第三方插件；仅云效 Testhub 完整，跨平台统一代价过高 |
| D5 | 类型映射必须可配置（不可硬编码） | 云效层级多一层（主题→业务需求→产品需求→任务），Jira 完全可自定义，GitHub 正过渡到 Issue Types |
| D6 | 适配器初始化需通过 `get_metadata()` 获取平台 schema | 各平台类型/状态/字段定义差异大；动态获取比静态配置更健壮 |

---

## 10. 术语表

| 术语 | 定义 |
|------|------|
| **Agent** | AI 驱动的编程助手（Claude Code、OpenCode 等） |
| **适配器（Adapter）** | 独立进程，负责在 PMAgent 统一模型与特定平台 API 之间转换 |
| **工作项（Work Item）** | 可跟踪单元的统称（Epic、Story、Task、Bug） |
| **MCP** | Model Context Protocol — AI 工具集成标准协议 |
| **内容哈希（Content Hash）** | 工作项有意义字段的 SHA-256 哈希，用于变更检测 |
| **DoD** | Definition of Done — 子任务完成的明确标准 |
| **stdio 协议** | 通过子进程的 stdin/stdout 以 JSON 消息通信 |

---

## 附录 A：适配器接口协议规范（stdio）

### 消息格式

```json
// 请求（PMAgent → 适配器，通过 stdin）
{
  "id": "req-001",
  "method": "create_item",
  "params": {
    "type": "bug",
    "title": "登录页面超时无提示",
    "description": "...",
    "fields": { "priority": "high", "labels": ["ux"] }
  }
}

// 成功响应（适配器 → PMAgent，通过 stdout）
{
  "id": "req-001",
  "result": {
    "platform_id": "PROJ-123",
    "url": "https://github.com/owner/repo/issues/123"
  }
}

// 错误响应
{
  "id": "req-001",
  "error": {
    "code": 401,
    "message": "认证失败：Token 已过期"
  }
}
```

### 适配器生命周期

1. PMAgent 启动适配器进程。
2. 发送 `initialize` 消息，包含连接配置。
3. 适配器响应其能力声明和元数据。
4. PMAgent 发送工作请求；适配器响应结果。
5. PMAgent 发送 `shutdown`；适配器优雅退出。

---

## 附录 B：统一工作项数据模型

```json
{
  "local_id": "uuid-v4",
  "platform_id": "PROJ-123",
  "type": "story | task | bug | epic",
  "title": "string",
  "description": "string (markdown)",
  "status": "draft | pending_sync | synced | failed | deleted",
  "sync_state": "up_to_date | local_modified | remote_modified | conflict",
  "priority": "critical | high | medium | low",
  "assignee": "string?",
  "parent_id": "local_id 或 platform_id?",
  "labels": ["string"],
  "acceptance_criteria": "string? (Given-When-Then)",
  "repro_steps": "string? (仅缺陷类型)",
  "sub_tasks": [
    {
      "id": "sub-1",
      "title": "string",
      "depends_on": ["sub-id"],
      "estimated_effort": "string",
      "definition_of_done": "string"
    }
  ],
  "code_refs": [
    { "type": "pr | commit | branch", "url": "string", "ref": "string" }
  ],
  "content_hash": "sha256",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "synced_at": "ISO-8601?",
  "raw_input": "string (Agent 传入的原始文本)",
  "project": "config-name"
}
```
