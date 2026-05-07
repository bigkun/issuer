---
name: issuer-refine
description: Refine raw requirement / bug report / task text into a structured, PM-ready brief.
---

# issuer-refine

Atomic skill. Take rough requirement text from the user and rewrite it as a structured PM brief. **No network, no other skills.** This skill only produces text and optionally writes a file.

## Inputs

Two input modes:

### Quick mode (preferred when arguments are provided)

If the user invokes `/issuer-refine <text>` with a direct text argument (e.g. `我的app需要登录功能`):

1. **Source** — the argument text itself; no further confirmation needed.
2. **Output mode** — defaults to `new-file`; write the brief to `.issuer/briefs/<slug>.md`. The user may override with `--replace`.

### Interactive mode (when no arguments are given)

Ask the user to confirm:

1. **Source scope** — one of:
   - the user's current selection
   - a paragraph they paste
   - the full content of a file they point at
2. **Output mode** — one of:
   - `replace` — overwrite the original location with the refined text
   - `new-file` — write the refined text to a new file (caller must request the path)

If either is missing, ask once and stop. Do not guess.

## Output format

Plain Markdown with these sections, in this order. **Localize the section headings and the body into the user's interaction language** (e.g. render Chinese headings when the user speaks Chinese). The schema below is a structural reference, not a literal template:

```
# <One-line title>

## User story
As a [role], I want [feature], so that [benefit].
Only for `story`-type work items; omit for bugs, tasks, or epics.

## Problem
What hurts today, in concrete terms. 1-3 sentences.

## Goal
What "done" looks like from the user's perspective. 1-3 sentences.

## Non-goals
Bullet list of things explicitly out of scope. Omit the section if none.

## Acceptance criteria
- [ ] Each criterion as a checkbox, starting with a verb.
- [ ] Each criterion must be independently checkable.
- [ ] Checkboxes render as interactive task lists on GitHub/GitLab.

## Open questions
- Bullet list of unresolved decisions, or "None" if all clear.
```

## Steps

1. Read the source text.
2. Extract the latent intent. Ignore filler words and meta-commentary.
3. Fill each section above. Do not invent acceptance criteria the source does not support — leave them in `Open questions` instead.
4. Render the brief in the user's interaction language.
5. Apply the chosen output mode.
6. If `new-file` mode: create `.issuer/briefs/` directory if missing, derive `<slug>` in the user's interaction language (see Slug rules), write `<slug>.md`, and report the file path to the user.
7. If `new-file` mode: update `.issuer/index.md` per the **Index upkeep** section below.

## Slug rules

- Slug MUST match the user's interaction language. For non-Latin languages (e.g. Chinese, Japanese), keep the original characters instead of transliterating.
- Replace whitespace with `-`.
- Strip characters that are illegal in file names on common filesystems: `/ \ : * ? " < > |` and control characters.
- For English / Latin-script content, lowercase it.
- Max 40 characters (count by code points, not bytes).
- If a collision exists, append `-2`, `-3`, … until unique.

## Index upkeep (.issuer/index.md)

`.issuer/index.md` is a project-wide outline of every brief and its tasks. Structure:

```markdown
# Issuer Index

<!-- Auto-maintained by issuer-refine and issuer-breakdown. Structure: Topic → Brief → Tasks. Do not edit manually unless you know what you are doing. -->

## <Topic / module>

- **<Brief title>** — [briefs/<slug>.md](briefs/<slug>.md)
  - [ ] <Task title> — [tasks/<id>.md](tasks/<id>.md)  <!-- status: draft -->
  - [x] <Task title> — [tasks/<id>.md](tasks/<id>.md)  <!-- status: synced, <platform_url> -->
```

After writing a brief (only in `new-file` mode), update the index:

1. If `.issuer/index.md` does not exist, create it with the header `# Issuer Index` and the HTML comment shown above.
2. Search the index for an existing entry that matches this brief (same `<slug>` OR same title, case-insensitive). If found, do nothing further — do not duplicate, do not edit.
3. Otherwise, choose a topic heading:
   - If an existing `## <Topic>` heading fits (same domain/module), reuse it.
   - Otherwise, infer a concise topic (1-3 words, same language as the brief) and add a new `## <Topic>` heading at the end of the file.
   - When uncertain between two similar topics, ask the user once before creating a new one.
4. Append the new brief entry as a bullet under the chosen topic:
   `- **<Brief title>** — [briefs/<slug>.md](briefs/<slug>.md)`
5. Preserve every existing topic, brief, and task line untouched. Never reorder or remove entries.

In `replace` mode, skip index upkeep.

## Guardrails

- **Match the user's interaction language in every output: the chat response, the rendered brief, and the generated file name (`<slug>`).** Only switch languages when the user explicitly asks.
- **Index upkeep is append-only.** Never remove or rewrite existing topics, briefs, or task lines in `.issuer/index.md`.
- **No code, no implementation suggestions.** This is a PM brief, not a design.
- **Never split into multiple work items.** That is `issuer-breakdown`'s job.
- **Never call any platform API or write `.issuer/tasks/*` files.** That is `issuer-sync` / `issuer-breakdown`'s job.
- If the source is already well-structured, say so and return it largely unchanged rather than rewriting for cosmetics.
