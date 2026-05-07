---
name: issuer-sync
description: Push `status: ready` task files to the configured platform. Prefers a matching MCP server (GitHub, GitLab, Jira, etc.) when available; otherwise falls back to the `issuer push` CLI.
---

# issuer-sync

Atomic skill. Sync local task files to the configured platform. Two channels:

1. **MCP-first** — use whatever MCP server tools the agent already has access to that match the configured `platform` (e.g. a GitHub MCP, GitLab MCP, Jira MCP, Yunxiao MCP, …). Tool names vary by server; match by capability (create / update / list issues or work items), not by hard-coded name. Zero extra credentials needed in `issuer`.
2. **CLI fallback** — shell out to `issuer push`, which uses the platform's own SDK (currently Octokit for GitHub) and the resolved token (`ISSUER_GITHUB_TOKEN` / `GITHUB_TOKEN` / `~/.issuer/credentials.yml`).

Pick one channel per invocation; never mix per-task.

## Inputs

- The current project working directory.

## Preconditions

- `.issuer/config.yml` exists.
- At least one file in `.issuer/tasks/` has `status: ready`.

## Channel selection

1. Read `.issuer/config.yml` to learn the configured `platform`.
2. Inspect the agent's available tools. If an MCP server matching that platform is available **and** exposes create / update capabilities **and** the user has not opted out, use **MCP**.
3. Otherwise use **CLI**: run `issuer push` and parse its summary.

If unsure, ask the user once.

## MCP channel — steps

For each task file with `status: ready`:

1. Load frontmatter and body.
2. Build labels: original `labels` ∪ `[type:<type>, priority:<priority>]`, deduped. (If the target platform does not support labels, map them onto the closest concept — tags, components, … — or drop them with a warning.)
3. If `platform_id` is null → call the MCP "create issue / work item" tool with the platform's required arguments (e.g. `{ owner, repo, title, body, labels }` for GitHub). Capture the new id and URL from the response.
4. Else → call the MCP "update" tool with the existing `platform_id`.
5. Patch the local file's frontmatter:
   - `platform_id: "<id>"`
   - `platform_url: <url>`
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
- If neither a matching MCP server nor the `issuer` CLI is available, stop and tell the user to install `@issuer/cli` or wire up the relevant MCP server.
