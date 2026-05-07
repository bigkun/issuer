---
name: issuer-refine
description: Refine raw requirement / bug report / task text into a structured, PM-ready brief.
---

# issuer-refine

Atomic skill. Take rough requirement text from the user and rewrite it as a structured PM brief. **No file writes, no network, no other skills.** This skill only produces text.

## Inputs

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

Plain Markdown with these sections, in this order, in English:

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
4. Render the brief.
5. Apply the chosen output mode.

## Guardrails

- Match the language of the source text by default; switch only when the user explicitly asks for another language.
- **No code, no implementation suggestions.** This is a PM brief, not a design.
- **Never split into multiple work items.** That is `issuer-breakdown`'s job.
- **Never call any platform API or write `.issuer/tasks/*` files.** That is `issuer-sync` / `issuer-breakdown`'s job.
- If the source is already well-structured, say so and return it largely unchanged rather than rewriting for cosmetics.
