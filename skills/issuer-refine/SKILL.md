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

## Problem
What hurts today, in concrete terms. 1-3 sentences.

## Goal
What "done" looks like from the user's perspective. 1-3 sentences.

## Non-goals
Bullet list of things explicitly out of scope. Omit the section if none.

## Acceptance criteria
- Bullet list of testable conditions, each starting with a verb.
- Each criterion must be independently checkable.

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

## Slug rules

- Slug MUST match the user's interaction language. For non-Latin languages (e.g. Chinese, Japanese), keep the original characters instead of transliterating.
- Replace whitespace with `-`.
- Strip characters that are illegal in file names on common filesystems: `/ \ : * ? " < > |` and control characters.
- For English / Latin-script content, lowercase it.
- Max 40 characters (count by code points, not bytes).
- If a collision exists, append `-2`, `-3`, … until unique.

## Guardrails

- **Match the user's interaction language in every output: the chat response, the rendered brief, and the generated file name (`<slug>`).** Only switch languages when the user explicitly asks.
- **No code, no implementation suggestions.** This is a PM brief, not a design.
- **Never split into multiple work items.** That is `issuer-breakdown`'s job.
- **Never call any platform API or write `.issuer/tasks/*` files.** That is `issuer-sync` / `issuer-breakdown`'s job.
- If the source is already well-structured, say so and return it largely unchanged rather than rewriting for cosmetics.
