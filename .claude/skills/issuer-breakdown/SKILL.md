---
name: issuer-breakdown
description: Split raw requirement text or a refined brief into one or more `.issuer/tasks/<date>-<slug>.md` work-item files.
---

# issuer-breakdown

**User-initiated only.** This skill must be explicitly invoked by the user (e.g. `/issuer-breakdown` or `/issuer-breakdown <text>`). Never auto-trigger during requirement discussions. The user must explicitly request task breakdown before this skill runs.

Atomic skill. Read raw requirement text or a refined PM brief and emit one Markdown file per work item under `.issuer/tasks/`. **No network, no syncing.** This skill only writes local files.

## Inputs

Two input modes:

### Quick mode (preferred when an argument is provided)

If the user invokes `/issuer-breakdown <text-or-path>` with a direct argument:

- **If the argument is a file path** (e.g. `.issuer/briefs/foo.md`), read it as the brief.
- **If the argument is raw text**, use it directly for breakdown. No need to refine first.
- No further confirmation needed; proceed directly to breakdown and report outputs.

### Interactive mode (when no argument is given)

Ask the user to supply one of:

1. Raw requirement text — break it down directly into tasks.
2. A path to an existing brief file under `.issuer/briefs/`.

Also confirm the current working directory contains `.issuer/config.yml` (from `issuer init`).

## Preconditions

- Read `.issuer/config.yml`. Use its `platform` and `default_labels` for new files.
- If the file does not exist, stop and tell the user to run `issuer init`.
- **Input can be**: raw text, or a brief file at `.issuer/briefs/<slug>.md`.

## Platform-aware breakdown styles

This skill **automatically** applies platform-specific best practices based on your `.issuer/config.yml` `platform` field. **Zero configuration required** — it just works!

### Built-in platform templates

Detailed templates with API field mappings are available in the `templates/` directory:

| Platform   | Template File                    |
|------------|----------------------------------|
| GitHub     | `templates/github.md`            |
| GitLab     | `templates/gitlab.md`            |
| Yunxiao    | `templates/yunxiao.md`           |

For platforms with built-in support, the skill applies the corresponding template automatically. For all other platforms, the **Generic style** (below) is used.

### Generic Style (default for unsupported platforms)

**Characteristics**: Universal, works with any platform via MCP-first approach

#### Bug

**Structure**:
```markdown
## Description

<!-- A clear description of the bug. -->

## Reproduction Steps

1. [Step 1]
2. [Step 2]
3. [Step 3 — error occurs]

## Expected Behavior

<!-- What should happen. -->

## Actual Behavior

<!-- What actually happened. Include error messages, stack traces, or screenshots. -->

## Environment

- **Version**: <!-- e.g. v2.1.0 -->
- **OS/Browser**: <!-- e.g. macOS / Chrome 120 -->
```

#### Feature / Story

**Structure**:
```markdown
## User Story

As a [role]
I want [feature/capability]
So that [benefit/value]

## Problem Statement

<!-- Describe the problem this feature solves. -->

## Acceptance Criteria

- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]
```

#### Task

**Structure**:
```markdown
## Objective

<!-- What needs to be done and why. -->

## Implementation Steps

1. [Step 1]
2. [Step 2]
3. [Step 3]

## Testing Checklist

- [ ] Unit tests added/updated
- [ ] Integration tests verified
- [ ] Manual testing performed
```

### Custom templates (optional)

For project-specific requirements, create `.issuer/templates/breakdown.md`:

```markdown
# [Project Name] Breakdown Rules

## Task Granularity
- Max 2 days per task
- Split if larger

## Required Sections
- User story (mandatory)
- Acceptance criteria (min 3)
- Technical notes (optional)

## Labeling Rules
- Must include: `frontend` or `backend`
- Must include module: `auth`, `payment`, etc.
```

The skill will **merge** your template rules with platform defaults.

To use custom template, add to `.issuer/config.yml`:

```yaml
breakdown_template: .issuer/templates/breakdown.md
```

**Most projects don't need this.** Platform defaults work great out of the box.

### Yunxiao (Alibaba Cloud DevOps) Style

**Characteristics**: Formal, structured, enterprise-ready

> Full template with API field mappings: `templates/yunxiao.md`

#### Requirement (Req) — User story + GWT acceptance criteria

> Full template: `templates/yunxiao.md` → Requirement section

**Structure**:
```markdown
## User Story
As a [role]
I want [feature]
So that [benefit]

## Acceptance Criteria (Given-When-Then)

**Scenario 1: [Scenario Name]**
- Given [precondition]
- When [action]
- Then [expected result]

**Scenario 2: [Scenario Name]**
- Given [precondition]
- When [action]
- Then [expected result]

## Effort Estimation
- Development: X hours
- Testing: Y hours
```

**Rules**:
- ✅ Always use Given-When-Then format
- ✅ Include effort estimation (hours)
- ✅ Minimum 3 acceptance scenarios
- ✅ Formal tone, complete sentences

#### Task — Technical implementation steps

> Full template: `templates/yunxiao.md` → Task section

**Structure**:
```markdown
## Objective
[What needs to be implemented]

## Implementation Steps
1. [Step 1: e.g. Create database schema]
2. [Step 2: e.g. Implement API endpoint]
3. [Step 3: e.g. Add unit tests]

## Technical Constraints
- [Constraint 1: e.g. Must use existing auth service]
- [Constraint 2: e.g. Backward compatible with v1 API]

## Testing Checklist
- [ ] Unit tests for new logic
- [ ] Integration test with dependent services
- [ ] Manual test for edge cases
```

**Rules**:
- ✅ Clear step-by-step breakdown
- ✅ List technical constraints and dependencies
- ✅ Include testing checklist
- ✅ Technical precision over business narrative

#### Bug — Reproduction steps + severity

> Full template: `templates/yunxiao.md` → Bug section

**Structure**:
```markdown
## Environment
- Version: [app version]
- OS/Browser: [environment details]
- Related module: [module name]

## Reproduction Steps
1. [Step 1]
2. [Step 2]
3. [Step 3 — error occurs]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens — include error messages, screenshots if available]

## Impact Scope
- [Who/what is affected]
- [How frequently it occurs]
- [Workaround if available]

## Root Cause (if known)
[Analysis of likely cause]
```

**Rules**:
- ✅ Reproduction steps MUST be numbered and reproducible
- ✅ Clearly distinguish Expected vs Actual
- ✅ Set both `priority` (urgency) and `severity` (impact) in frontmatter
- ✅ Include environment details
- ✅ No effort estimation needed (bugs are fixed, not estimated)

### GitHub Style

**Characteristics**: Casual, developer-friendly, concise

> Full template with API field mappings: `templates/github.md`

**Task body structure**:
```markdown
## User Story
As a [role]
I want [feature]
So that [benefit]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]
- [ ] [Criterion 4]
```

**Rules**:
- ✅ Use Markdown checklist format (`- [ ]`)
- ✅ Casual, direct language
- ✅ No effort estimation required
- ✅ Minimum 3 checklist items
- ✅ Technical details in code blocks if needed

### GitLab Style

**Characteristics**: Technical, precise, test-focused

> Full template with API field mappings: `templates/gitlab.md`

**Task body structure**:
```markdown
## User Story
As a [role]
I want [feature]
So that [benefit]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

## Technical Notes
- Implementation details
- API changes
- Database migrations

## Testing Strategy
- Unit tests to add
- Integration tests needed
```

**Rules**:
- ✅ Markdown checklist + technical notes
- ✅ Include testing strategy section
- ✅ Precise, technical language
- ✅ Mention affected components

### Auto-detection

The skill **automatically** detects platform from `.issuer/config.yml`:

```yaml
platform: yunxiao  # ← Reads this, applies Yunxiao style automatically
```

**No extra configuration needed!**

### Unsupported platforms

For platforms not in the built-in list (GitHub, GitLab, Yunxiao), the Generic style is used automatically.
These platforms can still work via **MCP-first** approach:

1. During `issuer init`, select "Other (MCP)" as the platform
2. The skill uses the Generic template structure for task generation
3. Sync is handled by the MCP server detected at init time
4. If no MCP server is available, the user can manually push via `issuer push` with a custom adapter

The Generic style ensures consistent task files regardless of platform, while MCP-first ensures sync works even without a built-in adapter.

### Brief quality evaluation (optional, only when using a refined brief)

When breaking down from a refined brief (not raw text), evaluate the brief's completeness using the **five-dimension score**.

- **Score ≥ 50** → Proceed with breakdown directly.
- **Score < 50** → Warn user and offer options:
  ```
  Brief quality score: 35/100 (insufficient for breakdown)
  Missing: Clear acceptance criteria, goal statement vague
  Options:
  1. Refine first → invoke issuer-refine to enhance this brief
  2. Proceed anyway → breakdown may produce incomplete tasks
  → Choose 1 or 2?
  ```

  Default recommendation: Option 1 (refine first). Only proceed with Option 2 if user explicitly confirms.
  
> **Note**: When breaking down raw text directly, skip quality evaluation and proceed.

## Output

For each identified work item, write `.issuer/tasks/YYYY-MM-DD-<slug>.md` with this exact frontmatter:

```yaml
---
id: YYYY-MM-DD-<slug>
type: bug | story | task | epic
title: <short imperative title>
status: draft
platform: <from config>
platform_id: null
platform_url: null
priority: critical | high | medium | low
severity: critical | high | medium | low  # Bug type only
labels: [<from config.default_labels>]
created_at: <full ISO 8601 timestamp, e.g. 2026-05-07T14:32:05Z>
updated_at: <full ISO 8601 timestamp, e.g. 2026-05-07T14:32:05Z>
---
<Markdown body: copy of the relevant section of the brief. Structure per type:
- **story/req**: User story → Acceptance criteria (Given-When-Then or checkboxes) → Effort estimation
- **task**: Objective → Implementation steps → Technical constraints → Testing checklist
- **bug**: Environment → Reproduction steps → Expected vs Actual → Impact scope
- **epic**: Overview → Sub-stories/tasks list → Timeline (only when explicitly requested)
- **Acceptance criteria** MUST use checkbox syntax: `- [ ] criterion` so they render as interactive task lists on GitHub/GitLab.
>
```

### Timestamp rules

- `created_at` and `updated_at` MUST be full ISO 8601 date-time strings including hours, minutes, and seconds, in UTC (trailing `Z`), e.g. `2026-05-07T14:32:05Z`.
- Do NOT collapse the time portion to `T00:00:00Z`; always use the actual current wall-clock time.
- Obtain the current time from the system clock at the moment the file is written; do not copy a placeholder.
- On first creation, `created_at` and `updated_at` are equal. On subsequent edits, only `updated_at` advances.

## Slug rules

- Slug MUST match the user's interaction language. For non-Latin languages (e.g. Chinese, Japanese), keep the original characters instead of transliterating.
- Replace whitespace with `-`.
- Strip characters that are illegal in file names on common filesystems: `/ \ : * ? " < > |` and control characters.
- For English / Latin-script content, lowercase it.
- Max 40 characters (count by code points, not bytes).
- If a collision exists in `.issuer/tasks/`, append `-2`, `-3`, … until unique.

## Steps

1. Parse the brief.
2. Decide how many work items it contains. A single small bug is one item. An epic with sub-stories should produce one file per leaf — never an epic file with embedded children.
3. For each item: Pick `type` (`bug` for defects, `story` for user-facing features, `task` for tech work, `epic` only when explicitly requested by the user) and `priority` (default `medium` unless the brief signals urgency).
   - **For Bug type**: Both `priority` and `severity` are REQUIRED and MUST be set:
     - `priority` - How urgently we need to fix it (process priority)
       - `critical` (P0) - Fix immediately, drop everything
       - `high` (P1) - Fix in current sprint
       - `medium` (P2) - Fix in next sprint
       - `low` (P3) - Fix when time permits
     - `severity` - How bad is the impact on users/system
       - `critical` - System crash, data loss, security breach
       - `high` - Major feature broken, no workaround
       - `medium` - Feature impaired, workaround exists
       - `low` - Cosmetic issue, minor inconvenience
     - Example: A typo on the homepage has `priority: low` but `severity: low`. A database corruption bug has `priority: critical` and `severity: critical`.
4. Compute slug (see Slug rules), build frontmatter, write the file.
5. Print a numbered table of created files (in the user's interaction language), then present the approval prompt using the platform's native approval UI or this **exact template** (translate only the natural-language parts to match the user's interaction language):

   **Preferred: Use Agent's native approval UI** (if available):
   - Display task list with checkboxes or selection UI
   - Allow user to select which tasks to promote to `ready`
   - Present "Confirm" / "Edit" / "Skip" actions
   - On "Confirm" → patch selected files' `status:` from `draft` to `ready`
   - On "Edit" → open selected task file(s) for modification
   - On "Skip" → no tasks promoted, stop here

   **Fallback: Text-based prompt**:
   ```
   Select tasks to set as ready and push to <platform>:

   #  File                        Title
   1  2026-05-07-login-error.md   Fix login validation error
   2  2026-05-07-add-oauth.md     Add OAuth2 support

   Enter task numbers or filenames (e.g. 1,2 or all)
   Enter none to skip — no tasks will be promoted.
   ```

   Replace `<platform>` with the value read from `.issuer/config.yml`. The agent then patches the frontmatter `status:` field of each chosen file from `draft` to `ready`. Files not selected stay `draft`.
6. Update `.issuer/index.md` per the **Index upkeep** section below.

## Index upkeep (.issuer/index.md)

`.issuer/index.md` is a project-wide outline maintained jointly with `issuer-refine`. Structure: Topic → Brief → Tasks. Example:

```markdown
# Issuer Index

## <Topic / module>

- **<Brief title>** — [briefs/<slug>.md](briefs/<slug>.md)
  - [ ] `story` <Task title> — [tasks/<id>.md](tasks/<id>.md)  <!-- status: draft -->
  - [x] `bug` <Task title> — [tasks/<id>.md](tasks/<id>.md)  <!-- status: synced, <platform_url> -->
  - [ ] `task` <Task title> — [tasks/<id>.md](tasks/<id>.md)  <!-- status: draft -->
  - [x] `epic` <Task title> — [tasks/<id>.md](tasks/<id>.md)  <!-- status: synced, <platform_url> -->
```

After writing the task files, update the index:

1. Ensure `.issuer/index.md` exists. If missing, create it with the header `# Issuer Index` and the auto-maintained comment.
2. Locate the brief entry that these tasks belong to by matching `<slug>` or title against existing entries under any `## <Topic>` heading:
   - **Match found**: append the new task bullets under the existing brief entry. Do not duplicate the brief line.
   - **No match**: append a new brief entry under a suitable topic heading (same topic-selection logic as `issuer-refine`), linked to `briefs/<slug>.md`. Since breakdown always runs after a brief file exists (see Preconditions), the link target is always valid.
3. Under that brief entry, append each newly created task as an indented sub-bullet (two spaces):
   `  - [ ] <type> <Task title> — [tasks/<id>.md](tasks/<id>.md)  <!-- status: draft -->`
   Where `<type>` is one of: `story`, `bug`, `task`, `epic` (from the task's frontmatter `type:` field).
4. Do not re-add a task line that already exists for the same `<id>`.
5. Preserve every existing topic, brief, and task line untouched. Never reorder or remove entries.

## Guardrails

- **Match the user's interaction language in every output: the chat response, the file `title`, the body (including section headings like "User Story", "Reproduction Steps", etc.), and the generated file name (`<slug>`).** The templates in `templates/` are written in English as a reference specification, but the actual generated content MUST follow the user's language. For example, if the user interacts in Chinese, section headings should be "用户故事", "复现步骤", etc. Only use English when the user explicitly asks or interacts in English.
- **Support both raw text and refined briefs.** No need to refine first unless user explicitly requests it.
- **Index upkeep is append-only.** Never remove or rewrite existing topics, briefs, or task lines in `.issuer/index.md`.
- **Never overwrite an existing file.** If a slug collides with an existing file, use `-2`, `-3`, … or stop and ask.
- **Never set `status: ready` automatically.** The draft → ready promotion is a manual user act.
- **Never set `platform_id` or `platform_url`.** Sync owns those.
- Do not invent labels beyond what `default_labels` provides; new labels should come from explicit user instruction.
