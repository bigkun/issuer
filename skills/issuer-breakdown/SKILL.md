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

### Yunxiao (Alibaba Cloud DevOps) Style

**Characteristics**: Formal, structured, enterprise-ready

**Task body structure**:
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
- ✅ Always use Given-When-Then format for acceptance criteria
- ✅ Include effort estimation (hours)
- ✅ Formal tone, complete sentences
- ✅ Minimum 3 acceptance scenarios
- ✅ Use the same language as the input text

### GitHub Style

**Characteristics**: Casual, developer-friendly, concise

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
breakdown:
  template: .issuer/templates/breakdown.md
```

**Most projects don't need this.** Platform defaults work great out of the box.

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
- **story**: User story → Problem → Goal → Acceptance criteria (checkboxes)
- **bug/task/epic**: Problem → Goal → Acceptance criteria (checkboxes)
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
5. Print a numbered table of created files (in the user's interaction language), then present the approval prompt using this **exact template** (translate only the natural-language parts to match the user's interaction language):

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
  - [ ] <Task title> — [tasks/<id>.md](tasks/<id>.md)  <!-- status: draft -->
  - [x] <Task title> — [tasks/<id>.md](tasks/<id>.md)  <!-- status: synced, <platform_url> -->
```

After writing the task files, update the index:

1. Ensure `.issuer/index.md` exists. If missing, create it with the header `# Issuer Index` and the auto-maintained comment.
2. Locate the brief entry that these tasks belong to by matching `<slug>` or title against existing entries under any `## <Topic>` heading:
   - **Match found**: append the new task bullets under the existing brief entry. Do not duplicate the brief line.
   - **No match**: append a new brief entry under a suitable topic heading (same topic-selection logic as `issuer-refine`), linked to `briefs/<slug>.md`. Since breakdown always runs after a brief file exists (see Preconditions), the link target is always valid.
3. Under that brief entry, append each newly created task as an indented sub-bullet (two spaces):
   `  - [ ] <Task title> — [tasks/<id>.md](tasks/<id>.md)  <!-- status: draft -->`
4. Do not re-add a task line that already exists for the same `<id>`.
5. Preserve every existing topic, brief, and task line untouched. Never reorder or remove entries.

## Guardrails

- **Match the user's interaction language in every output: the chat response, the file `title` and body, and the generated file name (`<slug>`).** Only translate when the user explicitly asks.
- **Support both raw text and refined briefs.** No need to refine first unless user explicitly requests it.
- **Index upkeep is append-only.** Never remove or rewrite existing topics, briefs, or task lines in `.issuer/index.md`.
- **Never overwrite an existing file.** If a slug collides with an existing file, use `-2`, `-3`, … or stop and ask.
- **Never set `status: ready` automatically.** The draft → ready promotion is a manual user act.
- **Never set `platform_id` or `platform_url`.** Sync owns those.
- Do not invent labels beyond what `default_labels` provides; new labels should come from explicit user instruction.
