# PingCode Work Item Templates

PingCode supports multiple project types, each with different work item types and field structures:

| Project Type | Work Item Types | Description |
|-------------|----------------|-------------|
| **Scrum** | epic, feature, story, task, bug | Agile iterative development |
| **Kanban** | epic, feature, story, task, bug, issue | Visual workflow management |
| **Waterfall** | 需求(UUID), task, bug, 阶段(UUID), 里程碑(UUID) | Plan-driven development |
| **Hybrid** | All types from above | Mixed methodology |

> **Important**: PingCode does **NOT** support Markdown natively. The issuer adapter automatically converts Markdown to HTML tags before sending to PingCode API. You can write descriptions in Markdown format, and they will be converted to HTML.

References:
- https://open.pingcode.com/#api-创建工作项
- https://pingcode.com/spaces/si4PJHASUg/pages/FeBtpH

## Project Type Detection

On first `issuer push`, the adapter automatically:
1. Queries project info via `GET /v1/project/projects`
2. Extracts `project_type` field (scrum/kanban/waterfall/hybrid)
3. Saves to `config.yml` as `pingcode_project_type`
4. Uses this to optimize work item type mapping

If the project type is not yet cached, the adapter will query it during the first push.

## issuer Frontmatter → PingCode API Mapping

Field conversion in adapter `createIssue()` (src/adapter/pingcode/index.ts):

| issuer frontmatter | PingCode API Field | Description |
|--------------------|-------------------|-------------|
| `title` | `title` | Work item title (required) |
| `body` | `description` | **Markdown format** (auto-converted to HTML by adapter) |
| `type` | `type_id` | Resolved via `ensureTypeId()` with project-type-aware mapping |
| `priority` | `priority_id` | Not yet implemented (requires UUID lookup) |
| `dependencies` | — | Informational for AI agent only |
| `labels` | — | PingCode has no native labels field |
| `assigned_to` | `assignee_id` | User ID |
| `parent_id` | `parent_id` | Parent work item ID |
| `status` | `state_id` | Workflow state ID |
| (config) `repo` | `project_id` | Project ID (auto-resolved from identifier) |
| `platform_id` | — | Written by sync after creation (`short_id`) |
| `platform_url` | — | Written by sync after creation (`html_url`) |

### type → type_id Mapping (Project-Type-Aware)

The adapter uses a **3-tier cache** (memory → config.yml → API) with project-type-aware fallback:

#### Scrum/Kanban/Hybrid Projects

| issuer `type` | PingCode `type_id` | Chinese Name |
|---------------|-------------------|--------------|
| `epic` | `epic` | 史诗 |
| `feature` | `feature` | 特性 |
| `story` | `story` | 用户故事 |
| `task` | `task` | 任务 |
| `bug` | `bug` | 缺陷 |
| `issue` | `issue` | 事务 (Kanban/Hybrid only) |

#### Waterfall Projects

| issuer `type` | PingCode `type_id` | Chinese Name | Format |
|---------------|-------------------|--------------|--------|
| `story` | `6a02bbcc...` (UUID) | 需求 | UUID |
| `task` | `task` | 任务 | String |
| `bug` | `bug` | 缺陷 | String |
| `epic` | `6a02bbcc...` (UUID) | 阶段/里程碑 | UUID |

> **Note**: In Waterfall projects, `story` maps to `需求` (requirement), which has a UUID type_id, not a string.

### Type Mismatch Warning

If the project type is not yet cached in `config.yml`, the adapter queries it on first push. If the generated task types in `.issuer/tasks/` don't match the actual project types available in PingCode, the user will be prompted to:

1. **Adjust task types** - Go back and modify the task files to match the project's work item types
2. **Force push** - Proceed anyway (may fail if the type_id is invalid)

---

## Epic (Scrum/Kanban)

### Description Template (Markdown → HTML)

```markdown
# Strategic Direction

[Describe the long-term product strategy and business objectives this epic supports.]

## Business Value

[What business value will this epic deliver?]

## Scope

[Define the boundaries: what's included and what's excluded.]

## Success Metrics

- [Metric 1: How to measure success]
- [Metric 2: Key performance indicators]

## Dependencies

- [Dependency 1: Related epics or external systems]
- [Dependency 2: Prerequisites]
```

---

## Feature (Scrum/Kanban)

### Description Template (Markdown → HTML)

```markdown
# Feature Overview

**Parent Epic:** [Epic title or ID]

[Describe this feature and how it contributes to the parent epic.]

## User Value

[What value does this feature provide to end users?]

## Scope & Boundaries

**In Scope:**
- [Capability 1]
- [Capability 2]

**Out of Scope:**
- [Exclusion 1]

## User Stories

This feature includes the following user stories:
- [Story 1 title]
- [Story 2 title]

## Acceptance Criteria

[Define the criteria that must be met for this feature to be considered complete.]
```

---

## User Story (Scrum/Kanban) / 需求 (Waterfall)

### Description Template (Markdown → HTML)

```markdown
# User Story

**As a** [role/persona]  
**I want** [capability/action]  
**So that** [business value/benefit]

## Background & Context

[Describe the context: why this is needed, what problem it solves.]

## Detailed Description

[Describe the feature scope, interaction flow, and key rules.]

### Core Flow

1. [Step 1: User action or system behavior]
2. [Step 2: User action or system behavior]
3. [Step 3: Expected outcome]

### Key Rules & Constraints

- [Rule 1: Condition and expected behavior]
- [Rule 2: Business logic or validation]
- [Rule 3: Edge case handling]

## Acceptance Criteria

**Scenario 1: [Scenario name]**
- **Given** [precondition]
- **When** [action]
- **Then** [expected result]

**Scenario 2: [Scenario name]**
- **Given** [precondition]
- **When** [action]
- **Then** [expected result]

## Non-Functional Requirements

- **Performance:** [Response time, throughput, etc.]
- **Security:** [Authentication, authorization, data protection]
- **Usability:** [Accessibility, user experience considerations]
```

---

## Task

### Description Template (Markdown → HTML)

```markdown
# Task Objective

**Parent Work Item:** [Story/Feature title or ID]

[What needs to be accomplished?]

## Implementation Details

[Technical approach, design decisions, or implementation steps.]

## Technical Notes

- [Note 1: Architecture or design consideration]
- [Note 2: Technology or tool selection]
- [Note 3: Integration points or dependencies]

## Acceptance Criteria

- [ ] [Criterion 1: What must be true for this task to be complete]
- [ ] [Criterion 2: Testable outcome]
- [ ] [Criterion 3: Code review or documentation requirement]

## Dependencies

- [Dependency 1: Prerequisite tasks or work items]
- [Dependency 2: External systems or APIs]
```

---

## Bug / 缺陷

### Description Template (Markdown → HTML)

```markdown
# Bug Summary

[Brief description of the issue.]

## Environment

- **Platform:** [Web/Mobile/API/etc.]
- **Browser/OS:** [Browser name and version, OS version]
- **PingCode Project:** [Project name/ID]
- **Environment:** [Development/Staging/Production]

## Steps to Reproduce

1. [Step 1: Navigate to page X]
2. [Step 2: Perform action Y]
3. [Step 3: Observe result Z]

## Expected Behavior

[What should have happened?]

## Actual Behavior

[What actually happened?]

## Impact & Severity

- **Severity:** [Critical/High/Medium/Low]
- **Impact:** [How many users affected? What business impact?]

## Screenshots/Logs

[Attach screenshots, error logs, or screen recordings if available.]

## Additional Context

[Any other relevant information: related work items, recent changes, etc.]
```

---

## Issue (Kanban/Hybrid Only)

### Description Template (Markdown → HTML)

```markdown
# Issue Details

**Issue Type:** [Custom issue type]

## Description

[Describe the issue, request, or custom work item.]

## Context

[Provide background information and context.]

## Requirements

- [Requirement 1]
- [Requirement 2]

## Expected Outcome

[What should be the result after this issue is resolved?]
```

---

## Breakdown Guidelines for PingCode

### 1. Project Type Awareness

When breaking down requirements for PingCode:

**If `pingcode_project_type` is not in config.yml:**
- Ask the user: "What is your PingCode project type? (scrum/kanban/waterfall/hybrid)"
- Save the answer to guide type selection

**If project type is known:**
- Scrum/Kanban: Use `story`, `task`, `bug`, `epic`, `feature`
- Waterfall: Use `story` (maps to 需求), `task`, `bug`

### 2. Description Format

**CRITICAL**: PingCode does NOT support Markdown natively, but the issuer adapter **automatically converts Markdown to HTML** before sending to the API.

- Write descriptions in **Markdown format** as usual
- The adapter will convert:
  - Headers (`#`, `##`, `###`) → `<h1>`, `<h2>`, `<h3>`
  - Bold (`**text**`) → `<strong>text</strong>`
  - Italic (`*text*`) → `<em>text</em>`
  - Lists (`- item`, `1. item`) → `<ul><li>`, `<ol><li>`
  - Links (`[text](url)`) → `<a href="url">text</a>`
  - Code (`` `code` ``) → `<code>code</code>`
  - Code blocks (``` ```) → `<pre><code>`
  - Line breaks → `<br>`

**Example:**

```markdown
# User Story

**As a** user  
**I want** to login  
**So that** I can access my account

## Acceptance Criteria

- **Given** I'm on the login page
- **When** I enter valid credentials
- **Then** I should be redirected to dashboard
```

Will be converted to HTML and sent to PingCode.

### 3. Type Selection Strategy

**Scrum Projects:**
- Epic → Features → Stories → Tasks (hierarchical breakdown)
- Bugs as needed

**Kanban Projects:**
- Similar to Scrum, but may include `issue` type
- Focus on flow and WIP limits

**Waterfall Projects:**
- Plan → Milestones → Requirements (需求) → Tasks
- story type automatically maps to 需求 (UUID)
- No epic/feature hierarchy

### 4. Parent-Child Relationships

Use `parentId` in frontmatter to establish hierarchy:

```yaml
---
type: task
title: Implement login API
parentId: STORY-123  # Parent story's platform_id
---
```

### 5. Priority Mapping

PingCode priorities are UUIDs (not yet fully implemented). For now:
- Include priority in the description as plain text
- Example: `Priority: High (P1)`
