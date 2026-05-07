---
name: issuer
description: Three-stage orchestrator that takes raw requirement text all the way to the configured PM platform via refine → breakdown → sync. Each stage is a hard checkpoint.
---

# issuer

End-to-end orchestrator. Chains the three atomic skills with explicit user checkpoints between every stage. Never auto-advances.

## Pipeline

```
raw text
  └─▶ Stage 1  issuer-refine     →  refined brief
              [CHECKPOINT — user approves text]
  └─▶ Stage 2  issuer-breakdown  →  .issuer/tasks/*.md (status: draft)
              [CHECKPOINT — user flips selected files to status: ready]
  └─▶ Stage 3  issuer-sync       →  remote work items (status: synced)
```

## Inputs

Two invocation modes:

### Quick mode (when an argument is provided)

If the user invokes `/issuer <text>` with a direct text argument (e.g. `我的 app 需要登录功能`):

- Use the argument as the raw source text for Stage 1.
- Skip Stage 1's source-scope confirmation; proceed straight to refine.
- Stage 1 & 2 checkpoints still apply — the user must still approve the refined brief and select which tasks to promote to `ready`.

### Interactive mode (when no argument is given)

- Source of the raw text (selection / paragraph / file path).
- Project working directory (must already have `.issuer/config.yml`; if missing, instruct the user to run `issuer init` and stop).

## Stage 1 — Refine

1. Invoke the `issuer-refine` skill with the source. In Quick mode, pass the argument text directly so that `issuer-refine` runs in its own Quick mode.
2. Show the refined brief.
3. **Checkpoint:** ask the user to confirm. Allowed answers: `accept` / `edit <revised text>` / `abort`.
4. Only continue on `accept`.

## Stage 2 — Breakdown

1. Invoke the `issuer-breakdown` skill with the approved brief.
2. List the newly created `.issuer/tasks/*.md` files (all `status: draft`).
3. **Checkpoint:** ask the user which files to promote to `status: ready`. The orchestrator MUST patch the frontmatter `status:` field of each chosen file from `draft` to `ready`. Files not selected stay `draft`.
4. If the user selects none → stop here with a friendly note. Do not advance to sync.

## Stage 3 — Sync

1. Invoke the `issuer-sync` skill.
2. Show the per-task result table.
3. Done.

## Final report

Print:

- count of files created (Stage 2)
- count of files promoted to ready (Stage 2 checkpoint)
- count of issues created vs updated vs skipped vs failed (Stage 3)
- links to each created issue

## Guardrails

- **Never skip a checkpoint.** Each stage requires explicit user approval.
- **Never call platform APIs directly.** Always go through `issuer-sync`.
- **Never set `status: ready` without user instruction** during Stage 2.
- If any stage errors, stop the pipeline and report; do not silently retry the next stage.
