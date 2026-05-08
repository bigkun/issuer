---
name: issuer-sync
description: Push `status: ready` task files to the configured platform. Prefers a matching MCP server (GitHub, GitLab, Jira, etc.) when available; otherwise falls back to the `issuer push` CLI.
---

# issuer-sync

Atomic skill. Sync local task files to the configured platform. Two channels:

1. **MCP-first** — use whatever MCP server tools the agent already has access to. Works for **any platform** via heuristic capability detection. Zero extra credentials needed in `issuer`.
2. **CLI fallback** — shell out to `issuer push`, which uses the platform's own SDK (currently Octokit for GitHub, OpenAPI for Yunxiao) and the resolved token.

Pick one channel per invocation; never mix per-task.

## Platform support strategy

| Scenario | MCP available? | API adapter? | Result |
|---|---|---|---|
| MCP with sufficient capabilities | ✓ (create + read) | — | MCP-first sync |
| MCP with insufficient capabilities | ✓ (missing create/read) | — | Prompt user to fix MCP |
| No MCP, has API adapter | ✗ | ✓ registered | CLI fallback |
| No MCP, no API adapter | ✗ | ✗ | Prompt user: install MCP or wait for adapter |

**Key insight**: MCP channel is platform-agnostic via heuristic detection. Any MCP server exposing matching tools will work, regardless of platform name.

## Minimum capability requirements

issuer-sync requires at least:

- **`create`** — ability to create new issue/work item
- **`read`** — ability to read/verify an issue/work item

If these are missing, sync cannot proceed. Prompt the user:

```
⚠ Platform 'myPM' MCP capabilities insufficient:
Missing required capabilities: create, read

Suggestions:
1. Check MCP server configuration, ensure tools expose:
   - create + issue/workitem/task (e.g., create_issue, create_work_item)
   - get/read + issue/workitem/task (e.g., get_issue, read_work_item)
2. Or wait for API adapter support (issuer push CLI fallback)
```

## Heuristic capability detection

Tool names vary by MCP server. Issuer uses **keyword matching** to detect capabilities:

| Capability | Action keywords | Object keywords |
|---|---|---|
| `create` | create, add, new, post, make, insert | issue, workitem, work_item, item, ticket, task |
| `update` | update, edit, modify, patch, change, set | issue, workitem, work_item, item, ticket, task |
| `search` | search, list, find, query, filter | issue, workitem, work_item, item, ticket, task, issues |
| `read` | read, get, fetch, retrieve, show, view | issue, workitem, work_item, item, ticket, task |
| `comment` | comment, reply, respond, note | issue, workitem, work_item, item, ticket, task |

**Example**: Tool `myPM_create_ticket` → matches 'create' action + 'ticket' object → `create: true`

This works for **any MCP server**, even platforms not in the adapter registry.

## Inputs

- The current project working directory.

## Preconditions

- `.issuer/config.yml` exists.
- At least one file in `.issuer/tasks/` has `status: ready`.
- `.issuer/config.yml` contains an `mcp_capabilities` section (populated by `issuer init` or heuristic probe).

## MCP capability model

`issuer init` probes MCP tools and writes results to `.issuer/config.yml`:

```yaml
mcp_capabilities:
  channel: mcp          # or cli
  probed_at: 2026-05-07T14:32:05Z
  tools:
    - create_work_item
    - search_workitems
    - get_work_item
  capabilities:
    create: true
    update: false        # heuristic: no matching tool
    search: true
    read: true
    comment: false
```

For platforms **not in the adapter registry**, heuristic detection still works — issuer doesn't need prior knowledge of the platform.

## Channel selection

1. Read `.issuer/config.yml` → get `platform` and `mcp_capabilities`.
2. **Check minimum requirements**: if `create` + `read` are both true → MCP available.
3. **Detect MCP tools in Agent context**: if matching tools exist → use MCP channel.
4. If MCP minimum not met → check API adapter registry.
   - Has adapter → CLI fallback (`issuer push`)
   - No adapter → prompt user with options
5. **Never block silently** — always inform user of capability gaps.

**Graceful degradation order**: MCP-first → CLI fallback → user prompt

## MCP channel — steps

For each task file with `status: ready`:

1. Load frontmatter and body.
2. Build labels: original `labels` ∪ `[type:<type>, priority:<priority>]`, deduped.
3. If `platform_id` is null → call the MCP create tool (detected by heuristic).
4. Else → if `update` capability exists, call update tool; else skip with warning.
5. Patch local file: `platform_id`, `platform_url`, `status: synced`, `updated_at`.
6. Continue on per-task failure but record the error.

## CLI channel — steps

1. Run `issuer push` in the project directory.
2. Read stdout / exit code and report.
3. CLI patches files itself — don't duplicate.

## Output

Table per task: `id | action | channel | platform_id | url | error?`

Capability summary at end:

```
MCP capabilities: create ✓ | update ✗ (fell back to CLI) | search ✓ | read ✓ | comment ✗
```

## Guardrails

- **Only sync `status: ready` tasks** — never draft or synced.
- **Check platform match** — skip if task.platform ≠ config.platform.
- **Never silently downgrade** — always report channel changes.
- **Prompt when blocked** — if MCP insufficient and no adapter, give user options:
  1. Configure MCP server with proper tools
  2. Wait for API adapter support
  3. Develop custom adapter
