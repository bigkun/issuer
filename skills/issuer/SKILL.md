---
name: issuer
description: Two-stage pipeline (breakdown → sync) with optional refine. Takes raw requirement text to configured PM platform. Default: skip refine unless user explicitly requests.
---

# issuer

**User-initiated only.** This skill must be explicitly invoked by the user (e.g. `/issuer` or `/issuer <text>`). Never auto-trigger during requirement discussions or casual conversation. The agent should only run this skill when the user clearly requests it.

Primary orchestrator. Chains breakdown → sync with explicit user checkpoints. Refine is optional.

## Pipeline

```
raw text
  ├─▶ [Optional: issuer-refine]  →  enriched PRD-style brief (only if user requests)
  │         [CHECKPOINT — user approves]
  └─▶ Stage 1  issuer-breakdown  →  .issuer/tasks/*.md (status: draft)
              [CHECKPOINT — user selects tasks to promote to ready]
  └─▶ Stage 2  issuer-sync       →  remote work items (status: synced)
```

## Inputs

Two invocation modes:

### Quick mode (when an argument is provided)

If the user invokes `/issuer <text>` with a direct text argument (e.g. `我的 app 需要登录功能`):

- Use the argument as the raw source text for breakdown.
- **Default: Skip refine** and proceed directly to breakdown.
- If user adds `--refine` flag or explicitly requests refinement, run Stage 1 (refine) first.
- Breakdown & sync checkpoints still apply — the user must still approve tasks and select which to promote to `ready`.

### Interactive mode (when no argument is given)

- Source of the raw text (selection / paragraph / file path).
- Ask if user wants to refine first: "Would you like to refine the requirement before breakdown? (y/N)"
- If yes → run refine → checkpoint → breakdown
- If no (default) → proceed directly to breakdown
- Project working directory (must already have `.issuer/config.yml`; if missing, instruct the user to run `issuer init` and stop).

## Stage 1 — Breakdown (Default)

1. Invoke the `issuer-breakdown` skill with the raw text (or refined brief if user opted for refine).
2. List the newly created `.issuer/tasks/*.md` files (all `status: draft`).
3. **Checkpoint:** present the approval prompt using this template (translate only the natural-language parts to match the user's interaction language):

   ```
   Select tasks to set as ready and push to <platform>:

   #  File                        Title
   1  2026-05-07-login-error.md   Fix login validation error
   2  2026-05-07-add-oauth.md     Add OAuth2 support

   Enter task numbers or filenames (e.g. 1,2 or all)
   Enter none to skip — no tasks will be promoted.
   ```

   Replace `<platform>` with the value from `.issuer/config.yml`. The orchestrator MUST patch the frontmatter `status:` field of each chosen file from `draft` to `ready`. Files not selected stay `draft`.
4. If the user selects none → stop here with a friendly note. Do not advance to sync.

## Stage 2 — Sync

1. Invoke the `issuer-sync` skill.
2. Show the per-task result table.
3. Done.

## Optional: Refine (Only when user explicitly requests)

Run this stage ONLY if:
- User adds `--refine` flag in quick mode, OR
- User explicitly asks to refine the requirement first, OR
- User answers "yes" to the refine prompt in interactive mode

1. Invoke the `issuer-refine` skill with the source. In Quick mode, pass the argument text directly so that `issuer-refine` runs in its own Quick mode.
2. Show the enriched brief (expanded with context, motivation, acceptance criteria per PRD best practices).
3. **Checkpoint:** ask the user to confirm. Allowed answers: `accept` / `edit <revised text>` / `abort`.
4. Only continue on `accept` → proceed to Breakdown stage.

## Final report

Print:

- count of files created (Breakdown stage)
- count of files promoted to ready (Breakdown checkpoint)
- count of issues created vs updated vs skipped vs failed (Sync stage)
- links to each created issue

## Guardrails

- **Never skip a checkpoint.** Each stage requires explicit user approval.
- **Never call platform APIs directly.** Always go through `issuer-sync`.
- **Never set `status: ready` without user instruction** during Breakdown stage.
- **Never auto-run refine.** Only run when user explicitly requests it.
- If any stage errors, stop the pipeline and report; do not silently retry the next stage.
