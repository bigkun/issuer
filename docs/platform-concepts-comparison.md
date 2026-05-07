# 多平台项目管理概念对比分析

## 文档用途

本文档对 GitHub、GitLab、云效（Yunxiao）、Jira 四大项目管理平台的核心概念进行系统性对比，为 PMAgent 各平台适配器的设计与实现提供统一参考。

---

## 1. 工作项类型体系对比

### 1.1 各平台工作项类型一览

| 概念 | GitHub | GitLab | 云效 (Yunxiao) | Jira |
|------|--------|--------|---------------|------|
| 最高层级目标 | —（无内置） | Epic（可嵌套7层） | 主题 (Theme) | Initiative（Premium）|
| 大型业务目标 | Issue (label:epic) | Epic | 业务需求 | Epic |
| 用户需求 | Issue (label:feature) | Issue | 产品需求 | Story |
| 具体任务 | Issue (label:task) | Task | 任务 | Task |
| 子任务 | Sub-issue | Task（Issue子项） | 子任务 | Sub-task |
| 缺陷 | Issue (label:bug) | Issue (label:bug) | 缺陷 | Bug |
| 测试用例 | —（无内置） | Test Case | 测试用例 (Testhub) | —（需插件） |
| OKR | —（无内置） | Objective / Key Result | — | — |

### 1.2 层级结构对比

**GitHub：**
```
Issue (任意类型，通过 Issue Type 或 Label 区分)
  └── Sub-issue (子议题，可多层嵌套)
```

**GitLab：**
```
Epic (最多嵌套7层)
  └── Epic (子Epic)
  └── Issue
        └── Task
```

**云效：**
```
主题 (Theme)
  └── 业务需求
        └── 产品需求
              ├── 任务
              │     └── 子任务
              └── 缺陷
```

**Jira：**
```
Initiative (Premium/Enterprise)
  └── Epic
        ├── Story
        │     └── Sub-task
        ├── Task
        │     └── Sub-task
        └── Bug
              └── Sub-task
```

### 1.3 PMAgent 统一模型映射总览

| PMAgent 类型 | GitHub 映射 | GitLab 映射 | 云效映射 | Jira 映射 |
|-------------|------------|------------|---------|----------|
| **Epic** | Issue (type:Epic 或 label:epic) | Epic | 主题 或 业务需求 | Epic |
| **Story** | Issue (type:Feature 或 label:feature) | Issue | 产品需求 | Story |
| **Task** | Issue (type:Task 或 label:task) | Task | 任务 | Task |
| **Bug** | Issue (type:Bug 或 label:bug) | Issue (label:bug) | 缺陷 | Bug |
| **Sub-task** | Sub-issue | Task (子项) | 子任务 | Sub-task |

---

## 2. 工作项分类机制对比

### 2.1 类型区分方式

| 平台 | 类型区分机制 | 自定义能力 |
|------|-------------|-----------|
| **GitHub** | Issue Types（组织级，2024年新增）+ Labels | 可创建自定义 Issue Type；Label 无限自定义 |
| **GitLab** | 内置类型（Epic/Issue/Task/Test Case/OKR） | 类型固定，不可自定义；通过 Label 扩展 |
| **云效** | 内置类型 + 自定义工作项模板 | 支持自定义工作项类型和模板字段 |
| **Jira** | Work Types（原 Issue Types） | 完全可自定义类型、层级、字段 |

### 2.2 对适配器设计的影响

| 平台 | 适配器策略 |
|------|-----------|
| **GitHub** | 优先使用 Issue Types（如可用）；否则 fallback 到 Label 方案 |
| **GitLab** | Epic 与 Issue 是不同类型的 Work Item；Task 是 Issue 的子项 |
| **云效** | 需配置映射表，因不同项目模板的类型名称可能不同 |
| **Jira** | 需通过 API 获取项目的可用 Issue Types 再映射 |

---

## 3. 父子关系与层级对比

### 3.1 层级深度

| 平台 | 最大嵌套深度 | 父子关系建立方式 |
|------|------------|----------------|
| **GitHub** | 无限制（Sub-issues 可多层） | 在 Issue 中添加 Sub-issue |
| **GitLab** | Epic 7层；Issue→Task 2层 | Epic 包含 Issue；Issue 包含 Task |
| **云效** | 主题→业务需求→产品需求→任务→子任务（5层） | 层级内嵌套 |
| **Jira** | 标准3层（Epic→Story/Task→Sub-task）；Premium 可扩展 | parent 字段关联 |

### 3.2 跨类型父子约束

| 平台 | 约束规则 |
|------|---------|
| **GitHub** | 任意 Issue 可作为其他 Issue 的 Sub-issue（类型无约束） |
| **GitLab** | Epic→Epic/Issue→Task 严格层级；不可跨级 |
| **云效** | 严格遵循层级定义；产品需求下只能挂任务/子任务/缺陷 |
| **Jira** | 默认 Epic→Story/Task/Bug→Sub-task；Premium 可自定义层级 |

### 3.3 适配器实现要点

```
PMAgent 创建 Sub-task 时：
├── GitHub: 在父 Issue 下添加 Sub-issue
├── GitLab: 在父 Issue 下创建 Task
├── 云效:   在父任务下创建子任务
└── Jira:   创建 Sub-task 并设置 parent 字段
```

---

## 4. 迭代/Sprint 概念对比

### 4.1 迭代机制

| 概念 | GitHub | GitLab | 云效 | Jira |
|------|--------|--------|------|------|
| 迭代容器名称 | Iteration（Projects 字段） | Iteration（组/项目级） | 迭代 (Sprint) | Sprint |
| 定义位置 | Project Settings | Group/Project | 项目内 | Scrum Board |
| 时间固定 | 可自定义长度和间隔 | 可自定义（Cadence） | 可自定义 | 可自定义 |
| 工作项关联 | 通过 Iteration 字段赋值 | 通过 Iteration 字段赋值 | 工作项加入迭代 | Issue 拖入 Sprint |
| Backlog 概念 | 无 Iteration 值的 Items | 无 Iteration 的 Issues | 未排入迭代的需求 | Product Backlog |
| 迭代锁定 | 不支持 | 不支持 | 支持（防止范围蔓延） | 不内置（可通过权限控制） |

### 4.2 里程碑 (Milestone)

| 概念 | GitHub | GitLab | 云效 | Jira |
|------|--------|--------|------|------|
| 名称 | Milestone | Milestone | 里程碑 | Fix Version / Release |
| 用途 | 标记发布节点，聚合 Issue | 标记发布节点，聚合 Issue | 标记项目重要节点 | 版本发布追踪 |
| 与迭代关系 | 独立概念（可并存） | 独立概念（可并存） | 独立概念 | 独立于 Sprint |
| 核心属性 | 标题、描述、截止日期 | 标题、描述、开始/截止日期 | 负责人、预计/实际完成时间 | 名称、发布日期、描述 |
| 进度追踪 | 按关联 Issue 完成比例 | 按关联 Issue/MR 完成比例 | 状态（进行中/已完成/延期） | 按关联 Issue 完成比例 |

### 4.3 PMAgent 迭代映射策略

PMAgent 暂不内置"迭代"为一等工作项类型，但适配器需支持：

| 操作 | 实现方式 |
|------|---------|
| 创建工作项时指定迭代 | 作为 `fields` 扩展字段传递 |
| 按迭代筛选工作项 | `query_items` 的 filter 参数 |
| 获取可用迭代列表 | `get_metadata()` 返回 |

---

## 5. 优先级体系对比

| PMAgent | GitHub | GitLab | 云效 | Jira |
|---------|--------|--------|------|------|
| critical | label:priority/critical | label:priority::critical 或 weight:高 | P0 | Highest / Blocker |
| high | label:priority/high | label:priority::high | P1 | High |
| medium | label:priority/medium | label:priority::medium | P2 | Medium |
| low | label:priority/low | label:priority::low | P3 | Low / Lowest |

### 优先级表达差异

| 平台 | 优先级机制 | 特点 |
|------|-----------|------|
| **GitHub** | Label（无内置优先级字段） | 需通过约定 Label 名称实现；完全自定义 |
| **GitLab** | Label + Weight（权重数值） | Weight 是数值型（0-无上限）；优先级通过 Label 约定 |
| **云效** | 内置优先级字段（P0-P3） | 系统内置，有筛选和排序支持 |
| **Jira** | 内置 Priority 字段 | 预设 Highest/High/Medium/Low/Lowest；可自定义 |

---

## 6. 状态与工作流对比

### 6.1 状态模型

| 平台 | 状态模型 | 自定义程度 |
|------|---------|-----------|
| **GitHub** | 二态（Open / Closed）+ Status 字段（Projects） | Projects 中可自定义 Status 列（如 Todo/In Progress/Done） |
| **GitLab** | 二态（Open / Closed）+ Labels 模拟状态 | 可通过 Board 定义状态列；Label 驱动 |
| **云效** | 多态状态流（可自定义） | 完全自定义状态和流转规则；支持自动化 |
| **Jira** | 多态工作流（Workflow） | 完全自定义状态、流转、条件、后处理 |

### 6.2 典型状态流对比

**GitHub Projects Status：**
```
No Status → Todo → In Progress → Done
```

**GitLab Board 状态：**
```
Open → (Label: Doing) → (Label: Review) → Closed
```

**云效需求状态流：**
```
待规划 → 开发中 → 测试中 → 待验收 → 已完成 → 已关闭
```

**Jira 典型工作流：**
```
To Do → In Progress → In Review → Done
```

### 6.3 PMAgent 状态映射策略

PMAgent 不预定义固定状态集，而是：
1. 适配器通过 `get_metadata()` 返回平台可用状态列表。
2. 用户在项目配置中定义语义映射。
3. Agent 使用语义化状态名（如 "done"、"in_progress"），适配器转换为平台实际值。

建议的语义状态集：

| 语义状态 | 含义 | GitHub | GitLab | 云效 | Jira |
|---------|------|--------|--------|------|------|
| todo | 待处理 | Open + Status:Todo | Open | 待规划 | To Do |
| in_progress | 进行中 | Open + Status:In Progress | Open + Label:Doing | 开发中 | In Progress |
| in_review | 审查中 | Open + Status:In Review | Open + Label:Review | 测试中/待验收 | In Review |
| done | 已完成 | Closed + Status:Done | Closed | 已完成 | Done |
| cancelled | 已取消 | Closed (not planned) | Closed | 已关闭 | Cancelled |

---

## 7. 代码关联机制对比

### 7.1 关联方式

| 平台 | PR/MR 关联 | Commit 关联 | Branch 关联 | 自动关闭 |
|------|-----------|------------|------------|---------|
| **GitHub** | `#issue_id` 或 `fixes #id` 在 PR 中 | commit message 中引用 `#id` | 分支名含 issue 号 | `fixes/closes #id` 自动关闭 |
| **GitLab** | `#issue_id` 或 `Closes #id` 在 MR 中 | commit message 中引用 `#id` | 从 Issue 创建分支 | `Closes #id` 自动关闭 |
| **云效** | 通过"研发资产"关联 MR | 通过"研发资产"关联 Commit | 通过"研发资产"关联分支 | 可通过自动化规则实现 |
| **Jira** | Smart Commit 或 Development Panel | Smart Commit `PROJ-123` | 分支名含 Issue Key | 可通过 workflow 配置 |

### 7.2 适配器 `link_code()` 实现差异

| 平台 | 实现方式 |
|------|---------|
| **GitHub** | 通过 API 创建 Issue 与 PR/Commit 的引用；或在 Issue body 中添加链接 |
| **GitLab** | 通过 API 添加 Issue 的 related merge requests；或 Notes 方式 |
| **云效** | 调用研发资产关联 API |
| **Jira** | 通过 Remote Link API 或 Development Information API |

### 7.3 PMAgent `code_ref` 自动识别后的平台动作

| 引用类型 | GitHub | GitLab | 云效 | Jira |
|---------|--------|--------|------|------|
| PR/MR URL | 添加 cross-reference | 添加 related MR | 关联研发资产 | 添加 Remote Link |
| Commit SHA | 在 Issue 评论中引用 | 在 Issue 评论中引用 | 关联研发资产 | 添加 Remote Link |
| Branch | 无直接 API（可评论） | 无直接 API（可评论） | 关联研发资产 | 添加 Remote Link |

---

## 8. 标签/分类体系对比

| 维度 | GitHub | GitLab | 云效 | Jira |
|------|--------|--------|------|------|
| 标签名称 | Label | Label | 标签 | Label |
| 作用域 | 仓库级 | 项目级 + 组级 | 项目级 | 全局 / 项目级 |
| 颜色支持 | 是 | 是 | 是 | 是 |
| 多选 | 是 | 是 | 是 | 是 |
| 用于类型区分 | 是（传统方案） | 是 | 否（有专门类型字段） | 否（有专门类型字段） |
| 用于状态模拟 | 否 | 是（Board 列映射） | 否 | 否 |
| Component | 无 | 无 | 模块 | Component |

---

## 9. 项目组织方式对比

| 维度 | GitHub | GitLab | 云效 | Jira |
|------|--------|--------|------|------|
| 项目标识 | `owner/repo` | `namespace/project` (project_id) | 组织ID + 项目ID | Project Key (如 PROJ) |
| 组/空间概念 | Organization | Group/Sub-group | 组织 | Project / Portfolio |
| 跨项目管理 | GitHub Projects (跨仓库) | Group-level Epics/Issues | 项目集 | Portfolio (Premium) |
| 项目模板 | Repository Template | Project Template | 项目模板（敏捷/经典等） | Project Template |

---

## 10. 自定义字段对比

| 维度 | GitHub | GitLab | 云效 | Jira |
|------|--------|--------|------|------|
| 自定义字段支持 | Projects 中的自定义字段 | Custom Fields (Ultimate) | 支持 | 完善支持 |
| 字段类型 | Text/Number/Date/Single Select/Iteration | 各种类型 | 文本/数字/日期/单选/多选等 | 文本/数字/日期/选择/级联/用户等 |
| 定义层级 | Project 级 | Group/Project 级 | 项目级 | 全局/项目级 |
| API 可访问 | 是 (GraphQL) | 是 | 是 | 是 |

---

## 11. API 模型与认证对比

| 维度 | GitHub | GitLab | 云效 | Jira |
|------|--------|--------|------|------|
| API 风格 | REST v3 + GraphQL v4 | REST v4 + GraphQL | REST | REST v2/v3 |
| 认证方式 | PAT / OAuth App / GitHub App | PAT / OAuth / Deploy Token | PAT / OAuth 2.0 | API Token / OAuth 2.0 / PAT |
| 分页方式 | Link header (REST) / Cursor (GraphQL) | Offset + Keyset | Cursor / Offset | Offset (startAt + maxResults) |
| Rate Limiting | 5000 req/hour (PAT) | 规则复杂（按类型限流） | 有限流（需确认具体值） | 无硬性限制（但有 concurrent 限制） |
| Webhook | 支持 | 支持 | 支持 | 支持 |
| 批量操作 | GraphQL mutations | 部分 API 支持 | 部分支持 | Bulk API |

---

## 12. 测试管理对比

| 维度 | GitHub | GitLab | 云效 | Jira |
|------|--------|--------|------|------|
| 内置测试管理 | 无 | Test Case (Work Item) | Testhub（完整模块） | 无（需 Zephyr/Xray 插件） |
| 测试用例存储 | — | 项目内 Work Item | 独立用例库（可跨项目复用） | 插件管理 |
| 测试计划 | — | — | 支持（关联迭代） | 插件管理 |
| 测试执行 | — | — | 支持（状态：通过/失败/阻塞/跳过） | 插件管理 |
| 测试报告 | — | — | 支持（可导出 PDF/图片） | 插件管理 |
| 与缺陷关联 | — | — | 执行中可直接创建缺陷 | 插件管理 |

### PMAgent 测试用例生成的平台对接策略

| 平台 | 对接方式 |
|------|---------|
| **GitHub** | 不直接对接；生成的 Gherkin 文件存储在代码仓库 |
| **GitLab** | 创建 Test Case 类型的 Work Item |
| **云效** | 通过 API 在 Testhub 用例库中创建用例 |
| **Jira** | 依赖用户安装的测试插件 API（如 Zephyr） |

---

## 13. 关键差异总结

### 13.1 类型系统差异

| 差异点 | 影响 | 适配器策略 |
|--------|------|-----------|
| GitHub 传统上无内置类型 | 需要 Label 或新 Issue Types 区分 | 检测是否启用 Issue Types，否则 fallback Label |
| GitLab Epic 是独立于 Issue 的类型 | 创建 Epic 和 Issue 用不同 API | 适配器内部分路由 |
| 云效层级比其他平台多一层 | PMAgent Epic 可能映射到多个层级 | 用户可配置映射到"主题"还是"业务需求" |
| Jira 高度可自定义 | 需动态获取类型定义 | 每次初始化时拉取项目 schema |

### 13.2 状态模型差异

| 差异点 | 影响 | 适配器策略 |
|--------|------|-----------|
| GitHub 本质是二态 (Open/Closed) | 细粒度状态依赖 Projects | 优先操作 Projects Status 字段 |
| GitLab 也是二态 + Label | Board 列 = Label | 适配器同时更新 state 和 label |
| 云效/Jira 是真正的多态工作流 | 有状态流转约束 | 需先查询合法路径再更新 |

### 13.3 组织模型差异

| 差异点 | 影响 | 适配器策略 |
|--------|------|-----------|
| GitHub 以 repo 为中心 | 工作项属于 repo | project_id = "owner/repo" |
| GitLab 以 Group/Project 为中心 | Epic 属于 Group，Issue 属于 Project | 需同时配置 group 和 project |
| 云效以组织/项目为中心 | 扁平化 | project_id = 组织ID + 项目ID |
| Jira 以 Project Key 为中心 | 所有 Issue 有 Key 前缀 | project_id = Project Key |

---

## 14. 适配器设计统一建议

### 14.1 适配器初始化流程

```
1. 连接验证 (health check)
2. 获取项目/仓库元数据
3. 获取可用工作项类型
4. 获取字段定义（含自定义字段）
5. 获取状态/工作流定义
6. 获取可用迭代/里程碑列表
7. 返回 capabilities 声明
```

### 14.2 类型映射配置模板

```yaml
# 适配器类型映射配置（用户在 pmagent init 时设置）
type_mappings:
  epic:
    github: { type: "Epic" }          # Issue Type = Epic
    gitlab: { type: "epic" }           # Work Item Type
    yunxiao: { type: "theme" }         # 或 "business_requirement"
    jira: { type: "Epic" }             # Issue Type name

  story:
    github: { type: "Feature", fallback_label: "feature" }
    gitlab: { type: "issue" }
    yunxiao: { type: "product_requirement" }
    jira: { type: "Story" }

  task:
    github: { type: "Task", fallback_label: "task" }
    gitlab: { type: "task" }
    yunxiao: { type: "task" }
    jira: { type: "Task" }

  bug:
    github: { type: "Bug", fallback_label: "bug" }
    gitlab: { type: "issue", label: "bug" }
    yunxiao: { type: "defect" }
    jira: { type: "Bug" }
```

### 14.3 状态映射配置模板

```yaml
# 适配器状态映射配置
status_mappings:
  github:
    todo: { state: "open", project_status: "Todo" }
    in_progress: { state: "open", project_status: "In Progress" }
    done: { state: "closed", project_status: "Done", state_reason: "completed" }
    cancelled: { state: "closed", project_status: "Done", state_reason: "not_planned" }

  gitlab:
    todo: { state: "opened" }
    in_progress: { state: "opened", add_label: "Doing" }
    done: { state: "closed" }

  yunxiao:
    todo: "待规划"
    in_progress: "开发中"
    in_review: "测试中"
    done: "已完成"
    cancelled: "已关闭"

  jira:
    todo: "To Do"
    in_progress: "In Progress"
    in_review: "In Review"
    done: "Done"
```

### 14.4 通用注意事项

| 事项 | 说明 |
|------|------|
| **幂等性** | 所有 create/update 操作需支持幂等（避免重复创建） |
| **错误恢复** | 网络失败 → 重试；认证失败 → 明确提示；限流 → 退避 |
| **字段验证** | push 前根据 metadata 预校验必填字段和合法值 |
| **增量同步** | 使用 `updated_after` 参数实现增量拉取 |
| **内容格式** | 描述字段统一使用 Markdown；各平台渲染差异由适配器处理 |
| **ID 追踪** | 本地存储 platform_id 用于后续更新和关联 |

---

## 15. 各平台 API 文档入口

| 平台 | API 文档 | 说明 |
|------|---------|------|
| GitHub | https://docs.github.com/en/rest | REST API v3 |
| GitHub | https://docs.github.com/en/graphql | GraphQL API v4（Projects 等需要） |
| GitLab | https://docs.gitlab.com/api/rest/ | REST API v4 |
| GitLab | https://docs.gitlab.com/api/graphql/ | GraphQL API |
| 云效 | https://help.aliyun.com/zh/yunxiao/developer-reference/ | Open API |
| Jira | https://developer.atlassian.com/cloud/jira/platform/rest/v3/ | Jira Cloud REST API v3 |
| Jira | https://developer.atlassian.com/server/jira/platform/rest-apis/ | Jira Server REST API |
