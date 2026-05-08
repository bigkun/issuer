---
name: issuer-breakdown
description: Split a refined brief into one or more `.issuer/tasks/<date>-<slug>.md` work-item files.
---

# issuer-breakdown

Atomic skill. Read a refined PM brief (typically the output of `issuer-refine`) and emit one Markdown file per work item under `.issuer/tasks/`. **Always operate on a brief file under `.issuer/briefs/`**; if no such file exists for the input, delegate to `issuer-refine` first. **No network, no syncing.** This skill only writes local files.

## Inputs

Two input modes:

### Quick mode (preferred when an argument is provided)

If the user invokes `/issuer-breakdown <text-or-path>` with a direct argument:

- **If the argument resolves to an existing file path** (e.g. `.issuer/briefs/foo.md`), read it as the brief.
- **If the argument is raw text** (not a path, or a path that does not exist yet), do NOT treat it as the brief directly. Invoke the `issuer-refine` skill with the text first to produce `.issuer/briefs/<slug>.md`, then use that generated file as the brief for breakdown.
- No further confirmation needed between refine and breakdown in Quick mode; proceed through both stages and report both outputs.

### Interactive mode (when no argument is given)

Ask the user to supply one of:

1. A path to an existing brief file under `.issuer/briefs/`.
2. Raw requirement text — in which case invoke `issuer-refine` first to write a brief file, then continue with breakdown on that file.

Also confirm the current working directory contains `.issuer/config.yml` (from `issuer init`).

## Preconditions

- Read `.issuer/config.yml`. Use its `platform` and `default_labels` for new files.
- If the file does not exist, stop and tell the user to run `issuer init`.
- **Ensure a brief file exists** at `.issuer/briefs/<slug>.md` for the current input. If not, invoke `issuer-refine` (in its own Quick mode) with the raw text and proceed only after the brief file has been written.

### Brief quality evaluation

Before breakdown, evaluate the brief's completeness using the **five-dimension score** (same as `issuer-refine`).

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
3. For each item: pick `type` (`bug` for defects, `story` for user-facing features, `task` for tech work, `epic` only when explicitly requested by the user) and `priority` (default `medium` unless the brief signals urgency).
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

- **Evaluate brief quality before breakdown.** If score < 50, recommend refinement first. Never silently breakdown an incomplete brief.
- **Match the user's interaction language in every output: the chat response, the file `title` and body, and the generated file name (`<slug>`).** Only translate when the user explicitly asks.
- **Always work from a brief file.** Never fabricate tasks from raw text directly — invoke `issuer-refine` first when no brief file exists.
- **Index upkeep is append-only.** Never remove or rewrite existing topics, briefs, or task lines in `.issuer/index.md`.
- **Never overwrite an existing file.** If a slug collides with an existing file, use `-2`, `-3`, … or stop and ask.
- **Never set `status: ready` automatically.** The draft → ready promotion is a manual user act.
- **Never set `platform_id` or `platform_url`.** Sync owns those.
- Do not invent labels beyond what `default_labels` provides; new labels should come from explicit user instruction.
