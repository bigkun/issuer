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
- `.issuer/config.yml` contains an `mcp_capabilities` section (populated by `issuer init`). If the section is missing, assume the MCP channel can do create + update and proceed — but warn the user that `issuer init` should be re-run.

## MCP capability model

Each platform MCP exposes a different set of tools. Issuer classifies them into **capability groups** that the sync flow depends on:

| Capability | Used by | Description |
|---|---|---|
| `create` | Step 3 | Create a new issue / work item |
| `update` | Step 4 | Update an existing issue / work item (title, body, labels, status) |
| `search` | De-dup | Search / list issues or work items to avoid duplicates |
| `read` | Verify | Read a single issue / work item by ID |
| `comment` | Optional | Add a comment to an issue / work item |

`issuer init` probes the MCP server at setup time and writes the results into `.issuer/config.yml` under `mcp_capabilities`:

```yaml
mcp_capabilities:
  channel: mcp          # or cli
  probed_at: 2026-05-07T14:32:05Z
  tools:
    - create_work_item
    - search_workitems
    - get_work_item
    - get_work_item_types
  capabilities:
    create: true
    update: false        # e.g. Yunxiao MCP currently lacks update_work_item
    search: true
    read: true
    comment: false
```

A **built-in adapter registry** ships with `@issuer/cli` and declares the known baseline for each platform's MCP (tool names, expected capabilities). During `issuer init`, the live probe overrides the registry baseline; platforms not in the registry still work — only the probe results are used.

## Channel selection

1. Read `.issuer/config.yml` to learn the configured `platform` and `mcp_capabilities`.
2. If `mcp_capabilities.channel` is `mcp` **and** the required capability for the current operation exists → use **MCP**.
3. If a required capability is missing (e.g. `update: false`), fall back to **CLI** for that specific operation, and inform the user.
4. If `mcp_capabilities.channel` is `cli` or the section is absent → use **CLI**.

**Never silently skip a capability gap.** Always report which operations could not be performed via MCP and which channel was used instead.

If unsure, ask the user once.

## MCP channel — steps

For each task file with `status: ready`:

1. Load frontmatter and body.
2. Build labels: original `labels` ∪ `[type:<type>, priority:<priority>]`, deduped. (If the target platform does not support labels, map them onto the closest concept — tags, components, … — or drop them with a warning.)
3. If `platform_id` is null → call the MCP "create issue / work item" tool with the platform's required arguments (e.g. `{ owner, repo, title, body, labels }` for GitHub). Capture the new id and URL from the response.
4. Else → check `mcp_capabilities.capabilities.update`:
   - **`true`** → call the MCP "update" tool with the existing `platform_id`.
   - **`false`** → inform the user that this MCP lacks update support, then either (a) fall back to CLI for this task, or (b) skip with reason `mcp-update-unavailable`. Ask once if unsure.
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

A table per task: `id | action (created/updated/skipped/failed) | channel (mcp/cli) | platform_id | url | error?`

Also print a **capability summary** at the end:

```
MCP capabilities: create ✓ | update ✗ (fell back to CLI) | search ✓ | read ✓ | comment ✗
```

## Guardrails

- **Never touch tasks with `status: draft` or `status: synced`.** Only `ready`.
- **Never push tasks whose `platform` field does not match the configured platform.** Skip with reason `platform-mismatch`.
- **Never invent labels** beyond the `type:*` / `priority:*` auto-pair; user-supplied labels are passed through verbatim.
- **Never silently downgrade from MCP to CLI.** Always report the gap and the chosen fallback.
- If neither a matching MCP server nor the `issuer` CLI is available, stop and tell the user to install `@issuer/cli` or wire up the relevant MCP server.
