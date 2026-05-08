---
name: issuer-refine
description: Enrich and structure raw requirement / bug report / task text into a detailed, professional PRD-style brief following industry best practices.
---

# issuer-refine

**User-initiated only.** This skill must be explicitly invoked by the user (e.g. `/issuer-refine` or `/issuer-refine <text>`). Never auto-trigger during requirement discussions or casual conversation. When the user is describing a feature or discussing needs, respond normally — do not invoke this skill unless the user explicitly asks for it.

Atomic skill. Take rough requirement text from the user and **enrich it** into a comprehensive, well-structured PM brief. The goal is to add **meaningful, valuable information** — clearer problem context, sharper motivation, verifiable acceptance criteria, and actionable edge cases. **Every expansion must serve clarity and actionability, not word count.** Padding with filler words or redundant descriptions is forbidden. **No network, no other skills.** This skill only produces text and optionally writes a file.

## Inputs

Two input modes:

### Quick mode (preferred when arguments are provided)

If the user invokes `/issuer-refine <text>` with a direct text argument (e.g. `User login function supports login via mobile phone number and verification code.`):

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

## Assumptions
List explicit assumptions made when interpreting ambiguous requirements.
Format: numbered list with "→ Correct me if wrong." at the end.
Omit if the source is fully explicit and no interpretation needed.

## Non-goals
Bullet list of things explicitly out of scope. Omit the section if none.

## Boundaries
Three-tier constraint system (borrowed from Spec-Driven Development):
- **Always**: Requirements that must always be met (e.g. "Run tests before commit")
- **Ask first**: Decisions requiring user approval before implementation
- **Never**: Things explicitly forbidden (e.g. "Commit secrets")
Omit the section if none apply.

## Acceptance criteria
- [ ] Each criterion as a checkbox, starting with a verb.
- [ ] Each criterion must be independently checkable.
- [ ] Prefer **quantifiable metrics** over vague descriptors (e.g. "Page load ≤ 2s" vs "faster").
- [ ] Reframe vague requirements into concrete, testable conditions.
- [ ] Checkboxes render as interactive task lists on GitHub/GitLab.

## Open questions
- Bullet list of unresolved decisions, or "None" if all clear.
```

## Steps

0. **Evaluate input completeness.** Before processing, assess the source using the **five-dimension completeness score**:

   | Dimension | Weight | What to check |
   |-----------|--------|----------------|
   | Structure | 30% | Are core sections present (Problem/Goal/Acceptance criteria)? |
   | Professional phrasing | 20% | Professional terminology vs casual language (e.g. "≤2s" vs "faster") |
   | Verifiability | 25% | Acceptance criteria are independently testable with checkboxes? |
   | Boundaries | 15% | Non-goals or constraint boundaries defined? |
   | Assumptions explicit | 10% | Ambiguous points listed or clearly unnecessary? |

   Compute score (0-100) and determine action:
   - **Score < 30** → `FULL_ENRICHMENT`: Complete expansion, list assumptions, fill all sections.
   - **Score 30-60** → `PARTIAL_ENRICHMENT`: Fill missing sections, improve vague criteria.
   - **Score 60-80** → `LIGHT_TOUCH`: Format validation, minor tweaks only.
   - **Score ≥ 80** → `SKIP`: Document is professional. Tell user "Input quality sufficient (X/100). No refinement needed."

   **Inform the user** before proceeding:
   ```
   Input Completeness Score: 45/100
   Missing: Assumptions, Boundaries, 2 vague acceptance criteria
   Recommendation: PARTIAL_ENRICHMENT
   → Proceed with enrichment? (y/n)
   ```

   If user declines or input is `SKIP`, stop here.

1. Read the source text.
2. **Surface assumptions immediately.** If the source contains ambiguous or incomplete requirements, list what you're assuming before writing any brief content. Format:
   ```
   ASSUMPTIONS I'M MAKING:
   1. [Assumption 1]
   2. [Assumption 2]
   → Correct me now or I'll proceed with these.
   ```
   This prevents silent misinterpretation — assumptions are the most dangerous form of misunderstanding.
3. Extract the latent intent. Ignore filler words and meta-commentary.
4. **Reframe vague requirements as success criteria.** Translate fuzzy statements into concrete, testable conditions:
   - "Make it faster" → "Response time ≤ 500ms"
   - "Better UX" → "Click-to-action ≤ 3 steps, error feedback ≤ 2s"
5. Fill each section above. Do not invent acceptance criteria the source does not support — leave them in `Open questions` instead.
6. Render the brief in the user's interaction language.
7. Apply the chosen output mode.
8. If `new-file` mode: create `.issuer/briefs/` directory if missing, derive `<slug>` in the user's interaction language (see Slug rules), write `<slug>.md`, and report the file path to the user.
9. If `new-file` mode: update `.issuer/index.md` per the **Index upkeep** section below.

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

- **Enrich for value, not length.** Every added sentence must make the problem clearer, the goal sharper, or the acceptance criteria more verifiable. Padding with filler words or redundant descriptions is forbidden.
- **Surface assumptions, never silently fill.** Ambiguous requirements are the most dangerous source of misunderstanding. Always list assumptions explicitly before proceeding.
- **Reframe vague requirements into testable criteria.** "Faster", "better", "improve" are not acceptance criteria — translate them into quantifiable targets.
- **Match the user's interaction language in every output: the chat response, the rendered brief, and the generated file name (`<slug>`).** Only switch languages when the user explicitly asks.
- **Index upkeep is append-only.** Never remove or rewrite existing topics, briefs, or task lines in `.issuer/index.md`.
- **No code, no implementation suggestions.** This is a PM brief, not a design.
- **Never split into multiple work items.** That is `issuer-breakdown`'s job.
- **Never call any platform API or write `.issuer/tasks/*` files.** That is `issuer-sync` / `issuer-breakdown`'s job.
- If the source is already well-structured, say so and return it largely unchanged rather than rewriting for cosmetics.
