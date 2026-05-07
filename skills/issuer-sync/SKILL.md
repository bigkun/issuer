---
name: issuer-sync
description: Push `status: ready` task files to GitHub Issues. Prefers GitHub MCP tools when available; otherwise falls back to the `issuer push` CLI.
---

# issuer-sync

Atomic skill. Sync local task files to the configured platform. Two channels:

1. **MCP-first** — use the GitHub MCP server tools the agent already has access to (typically `mcp_github_create_issue`, `mcp_github_update_issue`, etc.). Zero extra credentials.
2. **CLI fallback** — shell out to `issuer push`, which uses Octokit and the resolved token (`ISSUER_GITHUB_TOKEN` / `GITHUB_TOKEN` / `~/.issuer/credentials.yml`).

Pick one channel per invocation; never mix per-task.

## Inputs

- The current project working directory.

## Preconditions

- `.issuer/config.yml` exists.
- At least one file in `.issuer/tasks/` has `status: ready`.

## Channel selection

1. Inspect the agent's available tools. If a GitHub MCP server tool that can create / update issues is available **and** the user has not opted out, use **MCP**.
2. Otherwise use **CLI**: run `issuer push` and parse its summary.

If unsure, ask the user once.

## MCP channel — steps

For each task file with `status: ready`:

1. Load frontmatter and body.
2. Build labels: original `labels` ∪ `[type:<type>, priority:<priority>]`, deduped.
3. If `platform_id` is null → call the MCP "create issue" tool with `{ owner, repo, title, body, labels }`. Capture the new issue number and HTML URL.
4. Else → call the MCP "update issue" tool with the existing `platform_id`.
5. Patch the local file's frontmatter:
   - `platform_id: "<number>"`
   - `platform_url: <html_url>`
   - `status: synced`
   - `updated_at: <now ISO 8601>`
6. Continue on per-task failure but record the error.

## CLI channel — steps

1. Run `issuer push` in the project directory.
2. Read its stdout / non-zero exit and report.
3. Do not also patch files yourself — `issuer push` already did.

## Output

A table per task: `id | action (created/updated/skipped/failed) | platform_id | url | error?`

## Guardrails

- **Never touch tasks with `status: draft` or `status: synced`.** Only `ready`.
- **Never push tasks whose `platform` field does not match the configured platform.** Skip with reason `platform-mismatch`.
- **Never invent labels** beyond the `type:*` / `priority:*` auto-pair; user-supplied labels are passed through verbatim.
- If MCP tools are unavailable and `issuer` CLI is also missing, stop and tell the user to install `@issuer/cli`.
- **English only.**
