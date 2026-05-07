---
name: issuer-breakdown
description: Split a refined brief into one or more `.issuer/tasks/<date>-<slug>.md` work-item files.
---

# issuer-breakdown

Atomic skill. Read a refined PM brief (typically the output of `issuer-refine`) and emit one Markdown file per work item under `.issuer/tasks/`. **No network, no syncing.** This skill only writes local files.

## Inputs

Two input modes:

### Quick mode (preferred when an argument is provided)

If the user invokes `/issuer-breakdown <text-or-path>` with a direct argument:

- If the argument resolves to an existing file path (e.g. `.issuer/briefs/foo.md`), read it as the brief.
- Otherwise, treat the argument text itself as the brief.
- No further confirmation needed; proceed directly to breakdown.

### Interactive mode (when no argument is given)

1. The refined brief text (or path to it).
2. The current working directory of the project (must contain `.issuer/config.yml` from `issuer init`).

## Preconditions

- Read `.issuer/config.yml`. Use its `platform` and `default_labels` for new files.
- If the file does not exist, stop and tell the user to run `issuer init`.

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
created_at: <now ISO 8601>
updated_at: <now ISO 8601>
---
<Markdown body: copy of the relevant section of the brief, including Problem / Goal / Acceptance criteria>
```

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
5. Print a table of created files in the user's interaction language, and remind the user that all are `status: draft` — they must edit `status: ready` on the ones they want pushed.

## Guardrails

- **Match the user's interaction language in every output: the chat response, the file `title` and body, and the generated file name (`<slug>`).** Only translate when the user explicitly asks.
- **Never overwrite an existing file.** If a slug collides with an existing file, use `-2`, `-3`, … or stop and ask.
- **Never set `status: ready` automatically.** The draft → ready promotion is a manual user act.
- **Never set `platform_id` or `platform_url`.** Sync owns those.
- Do not invent labels beyond what `default_labels` provides; new labels should come from explicit user instruction.
