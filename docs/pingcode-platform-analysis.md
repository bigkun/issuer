# PingCode 平台分析与适配器设计参考

## 文档信息

| 字段 | 值 |
|------|-----|
| 用途 | Issuer PingCode 适配器开发参考 |
| 适配器优先级 | P2（阶段三候选） |
| 平台全称 | PingCode（智能化研发管理工具） |
| 核心模块 | 项目管理（Scrum/Kanban）、工作项管理 |

---

## 1. 平台概述

PingCode 是国内领先的智能化研发管理工具，提供需求管理、任务跟踪、缺陷管理、敏捷看板、迭代规划等功能。支持 Scrum 和 Kanban 两种项目管理模式。

**核心特点**：
- 支持多级需求管理（史诗→特性→用户故事）
- 灵活的工作项类型和字段自定义
- 支持工作项层级关系（父子关系、关联关系）
- REST API 开放平台

---

## 2. PingCode 工作项体系

### 2.1 工作项层级结构

PingCode 采用**四级需求管理体系**：

```
Epic（史诗）
  └── Feature（特性）
        └── Story（用户故事）
              ├── Task（任务）
              └── Bug（缺陷）
```

**层级说明**：

| 层级 | 名称 | 说明 | 周期 | 粒度 |
|------|------|------|------|------|
| L1 | Epic（史诗） | 战略级需求，公司重要战略举措 | 1-3 个月 | 最大 |
| L2 | Feature（特性） | 产品级需求，对用户有价值的功能 | 2-4 周 | 中等 |
| L3 | Story（用户故事） | 交付级需求，用户细分场景 | 1-2 周 | 较小 |
| L4 | Task/Bug | 执行级工作项，具体开发任务或缺陷 | 1-7 天 | 最小 |

### 2.2 工作项类型详解

| PingCode 类型 | 英文标识 | 说明 | Issuer 映射 |
|--------------|---------|------|-------------|
| **史诗** | `epic` | 大型战略性需求，包含多个特性 | Epic |
| **特性** | `feature` | 产品功能级需求，包含多个用户故事 | Story（视粒度） |
| **用户故事** | `story` | 用户视角的功能需求，可独立交付 | Story |
| **任务** | `task` | 具体的开发/设计/测试工作 | Task |
| **缺陷** | `bug` | 软件行为偏差或质量问题 | Bug |
| **问题** | `issue` | 通用工作项类型 | Task |

### 2.3 与 Issuer 统一模型的映射

| Issuer 类型 | PingCode 映射（推荐） | 备选映射 | 说明 |
|-------------|----------------------|---------|------|
| **Epic** | Epic（史诗） | Feature（特性） | 根据项目配置选择 |
| **Story** | Story（用户故事） | Feature（特性） | 用户故事为标准映射 |
| **Task** | Task（任务） | — | 一对一映射 |
| **Bug** | Bug（缺陷） | — | 一对一映射 |

> **注意**：
> - PingCode 的 Feature 层级在 Issuer 中可映射为 Story 或 Epic，取决于项目需求粒度
> - 自定义工作项类型通过 ID 标识，适配器需支持动态类型匹配

---

## 3. 工作项字段体系

### 3.1 通用核心字段

| 字段 | 英文标识 | 类型 | 必填 | Issuer 对应字段 |
|------|---------|------|------|-----------------|
| 标题 | `title` | string | 是 | title |
| 描述 | `description` | rich text | 否 | description |
| 负责人 | `assignee` | user | 否 | assignee |
| 参与者 | `participants` | user[] | 否 | — (扩展字段) |
| 优先级 | `priority` | enum | 否 | priority |
| 状态 | `status` | enum (工作流) | 是 | status |
| 标签 | `labels` | string[] | 否 | labels |
| 所属迭代 | `iteration` | reference | 否 | — (扩展字段) |
| 父工作项 | `parent` | reference | 否 | parent_id |
| 故事点 | `story_points` | number | 否 | — (扩展字段) |
| 预估工时 | `estimated_workload` | number | 否 | — (扩展字段) |
| 剩余工时 | `remaining_workload` | number | 否 | — (扩展字段) |
| 创建时间 | `created_at` | datetime | 系统生成 | — |
| 更新时间 | `updated_at` | datetime | 系统生成 | — |

### 3.2 优先级映射

| Issuer 优先级 | PingCode 优先级 | 说明 |
|---------------|----------------|------|
| critical | P0 | 紧急/阻塞 |
| high | P1 | 高优先级 |
| medium | P2 | 中优先级 |
| low | P3 | 低优先级 |

### 3.3 自定义字段

PingCode 支持项目级自定义字段，包括：
- **字段类型**：文本、数字、日期、单选、多选、成员、公式等
- **字段作用域**：项目级、全局级
- **字段验证**：必填、正则、范围等

**适配器设计**：
- 通过 API 获取项目的字段定义（`GET /projects/{id}/fields`）
- 在 `field_mappings` 配置中支持自定义字段映射
- 工作项模板支持自定义字段的新增、删除、排序

---

## 4. 状态流转

### 4.1 典型需求状态流

```
草稿（Draft）
  ↓
待评审（Review）
  ↓
已规划（Planned）
  ↓
进行中（In Progress）
  ↓
已完成（Done）
  ↓
已关闭（Closed）
```

### 4.2 典型缺陷状态流

```
新建（New）
  ↓
已确认（Confirmed）
  ↓
处理中（In Progress）
  ↓
已解决（Resolved）
  ↓
已验证（Verified）
  ↓
已关闭（Closed）
```

### 4.3 状态管理设计

- PingCode 使用**工作流（Workflow）**定义状态流转规则
- 每个项目可自定义工作流
- 适配器需通过 API 获取项目的状态定义（`GET /projects/{id}/statuses`）
- 状态映射：Issuer 状态 ↔ PingCode 状态

---

## 5. REST API 概览

### 5.1 认证方式

- **Token 认证**：`Authorization: Bearer <token>`
- **获取 Token**：在 PingCode 个人设置中生成 API Token

### 5.2 核心 API 端点

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取工作项列表 | GET | `/projects/{id}/work_items` | 分页获取 |
| 获取单个工作项 | GET | `/work_items/{id}` | 全量结构 |
| 创建工作项 | POST | `/projects/{id}/work_items` | 创建新工作项 |
| 更新工作项 | PUT | `/work_items/{id}` | 更新字段 |
| 删除工作项 | DELETE | `/work_items/{id}` | 软删除 |
| 获取父工作项 | GET | `/work_items/{id}/parent` | 获取父项 |
| 获取子工作项 | GET | `/work_items/{id}/children` | 获取子项列表 |
| 添加子工作项 | POST | `/work_items/{id}/children` | 建立父子关系 |
| 获取关联关系 | GET | `/work_items/{id}/links` | 获取关联工作项 |
| 添加关联关系 | POST | `/work_items/{id}/links` | 建立关联 |

### 5.3 创建工作项示例

**请求**：
```http
POST /projects/{project_id}/work_items
Content-Type: application/json
Authorization: Bearer <token>

{
  "work_item_type_id": "story",
  "title": "作为用户，我可以搜索商品",
  "description": "支持关键词搜索和分类筛选",
  "assignee_id": "user_123",
  "priority": "P2",
  "iteration_id": "iter_456",
  "parent_id": "feature_789"
}
```

**响应**：
```json
{
  "id": "story_001",
  "title": "作为用户，我可以搜索商品",
  "work_item_type": {
    "id": "story",
    "name": "用户故事"
  },
  "status": {
    "id": "draft",
    "name": "草稿"
  },
  "assignee": {
    "id": "user_123",
    "name": "张三"
  },
  "created_at": 1715000000000,
  "updated_at": 1715000000000
}
```

### 5.4 更新工作项示例

**请求**：
```http
PUT /work_items/{work_item_id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "status_id": "in_progress",
  "assignee_id": "user_456",
  "priority": "P1",
  "custom_fields": {
    "custom_field_1": "value1"
  }
}
```

### 5.5 父子关系管理

**添加子工作项**：
```http
POST /work_items/{parent_id}/children
Content-Type: application/json

{
  "work_item_type_id": "task",
  "title": "实现搜索功能",
  "assignee_id": "user_123"
}
```

**移除父子关系**：
```http
DELETE /work_items/{child_id}/parent
```

### 5.6 关联关系管理

**添加关联**：
```http
POST /work_items/{source_id}/links
Content-Type: application/json

{
  "target_id": "bug_123",
  "link_type": "blocks"  // blocks, blocked_by, relates_to, duplicates
}
```

**获取关联**：
```http
GET /work_items/{id}/links
```

---

## 6. 适配器设计要点

### 6.1 核心功能

| 功能 | API 方法 | 说明 |
|------|---------|------|
| `createIssue()` | `POST /projects/{id}/work_items` | 创建工作项 |
| `updateIssue()` | `PUT /work_items/{id}` | 更新工作项 |
| `listRemote()` | `GET /projects/{id}/work_items` | 获取工作项列表 |
| `getMetadata()` | `GET /projects/{id}` | 获取项目元数据 |

### 6.2 类型映射策略

```typescript
// PingCode 工作项类型映射
const WORK_ITEM_TYPE_MAP = {
  epic: 'epic',          // 史诗
  feature: 'story',      // 特性 → 用户故事（Issuer）
  story: 'story',        // 用户故事
  task: 'task',          // 任务
  bug: 'bug',            // 缺陷
  issue: 'task',         // 问题 → 任务
};
```

### 6.3 字段映射策略

```typescript
// PingCode 字段映射
const FIELD_MAPPING = {
  title: 'title',
  description: 'description',
  assignee: 'assignee_id',
  priority: 'priority',  // P0/P1/P2/P3
  status: 'status_id',
  labels: 'labels',
  parent: 'parent_id',
  iteration: 'iteration_id',
};
```

### 6.4 优先级映射

```typescript
// Issuer → PingCode 优先级映射
const PRIORITY_MAP = {
  critical: 'P0',
  high: 'P1',
  medium: 'P2',
  low: 'P3',
};
```

### 6.5 状态映射

```typescript
// Issuer → PingCode 状态映射
const STATUS_MAP = {
  draft: 'draft',
  ready: 'planned',
  in_progress: 'in_progress',
  done: 'done',
  synced: 'done',
};
```

---

## 7. 与其他平台的对比

### 7.1 需求层级对比

| 平台 | 层级结构 | 层级数量 | 说明 |
|------|---------|---------|------|
| **PingCode** | Epic → Feature → Story → Task/Bug | 4 级 | 最完整 |
| **GitHub** | Epic → Issue → Sub-issue | 3 级 | 通过 Projects 管理 |
| **GitLab** | Epic → Issue | 2 级 | 企业版支持 Epic |
| **云效** | Theme → 业务需求 → 产品需求 → Task/Bug | 4 级 | 类似 PingCode |
| **Jira** | Epic → Story → Sub-task | 3 级 | 高度可定制 |

### 7.2 API 能力对比

| 能力 | PingCode | GitHub | GitLab | 云效 |
|------|----------|--------|--------|------|
| 创建工作项 | ✓ | ✓ | ✓ | ✓ |
| 更新工作项 | ✓ | ✓ | ✓ | ✓ |
| 父子关系 | ✓ | 部分 | 部分 | ✓ |
| 关联关系 | ✓ | ✓ | ✓ | ✓ |
| 自定义字段 | ✓ | 部分 | ✓ | ✓ |
| 工作流 | ✓ | 部分 | 部分 | ✓ |
| MCP Server | 暂无 | ✓ | ✓ | ✓ |

---

## 8. 实施建议

### 8.1 阶段规划

**阶段一：基础能力**
- [ ] 实现 `createIssue()` 和 `updateIssue()`
- [ ] 支持 Epic、Story、Task、Bug 四种类型
- [ ] 实现基本字段映射（title、description、assignee、priority、status）

**阶段二：增强能力**
- [ ] 实现 `listRemote()` 用于去重检测
- [ ] 支持父子关系（parent_id）
- [ ] 支持自定义字段映射
- [ ] 实现状态流转映射

**阶段三：高级能力**
- [ ] 支持关联关系（links）
- [ ] 支持工作流自定义
- [ ] 支持迭代管理
- [ ] MCP Server 集成

### 8.2 风险与注意事项

1. **API 版本**：PingCode API 持续迭代，需关注版本兼容性
2. **认证方式**：使用 API Token，需指导用户获取
3. **自定义类型**：项目可能使用自定义工作项类型，需动态获取
4. **权限控制**：不同角色有不同操作权限，需处理权限错误
5. **速率限制**：注意 API 调用频率限制

### 8.3 测试策略

- 使用 PingCode 测试环境或测试项目
- 覆盖所有工作项类型的创建和更新
- 验证父子关系和关联关系
- 测试自定义字段映射
- 验证状态流转

---

## 9. 参考资源

- **PingCode 开放平台**：https://open.pingcode.com/
- **API 文档**：https://pingcode.apifox.cn/
- **工作项管理**：https://docs.pingcode.com/agile/project-management/epics-stories-themes
- **API 更新日志**：http://blog.pingcode.com/v5-80-0-release/

---

## 10. 更新历史

| 日期 | 版本 | 说明 | 作者 |
|------|------|------|------|
| 2026-05-13 | 1.0.0 | 初始版本，完成平台调研 | AI Agent |
