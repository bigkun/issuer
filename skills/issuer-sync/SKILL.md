---
name: issuer-sync
description: Push `status: ready` task files to the configured platform. MCP-first channel selection: use MCP when available, otherwise CLI adapter when supported.
---

# issuer-sync

**User-initiated only.** This skill must be explicitly invoked by the user (e.g. `/issuer-sync`). Never auto-trigger after task breakdown or during workflow discussions. The user must explicitly request sync before this skill runs.

Atomic skill. Sync local task files to the configured platform. **Single channel per platform** — never mix MCP and CLI:

1. **MCP channel** — use when MCP server is configured and meets minimum requirements
2. **CLI channel** — use when MCP unavailable but platform has built-in adapter
3. **Prompt user** — when neither available, instruct to install MCP

Pick one channel per invocation; never mix per-task.

## Platform support strategy

| Scenario | MCP available? | CLI adapter? | Channel |
|---|---|---|---|
| MCP meets minimum (create + read) | ✓ | — | MCP |
| MCP insufficient (missing create/read) | ✗ | ✓ registered | CLI |
| MCP unavailable, CLI adapter exists | ✗ | ✓ registered | CLI |
| Neither MCP nor CLI adapter | ✗ | ✗ | Prompt user |

**Key principle**: Single channel selection. Never mix MCP + CLI per-task.

**Key insight**: MCP channel is platform-agnostic via heuristic detection. Any MCP server exposing matching tools will work, regardless of platform name.

## Minimum capability requirements

issuer-sync requires at least:

- **`create`** — ability to create new issue/work item
- **`read`** — ability to read/verify an issue/work item

If MCP lacks these, check CLI adapter availability. If CLI adapter exists → use CLI. Otherwise prompt user:

```
⚠ Platform 'myPM' sync unavailable:

- MCP server not configured or capabilities insufficient (missing: create, read)
- No CLI adapter registered for this platform

Options:
1. Install MCP server for 'myPM' (recommended)
   - MCP server must expose 'create' + 'read' capabilities
   - Tool naming: action + object (e.g., create_issue)
2. Wait for official CLI adapter support
3. Develop custom adapter and contribute
```

## Heuristic capability detection

Tool names vary by MCP server. Issuer uses **keyword matching** to detect capabilities:

| Capability | Action keywords | Object keywords |
|---|---|---|
| `create` | create, add, new, post, make, insert | issue, workitem, work_item, item, ticket, task |
| `update` | update, edit, modify, patch, change, set | issue, workitem, work_item, item, ticket, task |
| `search` | search, list, find, query, filter | issue, workitem, work_item, item, ticket, task, issues |
| `read` | read, get, fetch, retrieve, show, view | issue, workitem, work_item, item, ticket, task |

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
```

For platforms **not in the adapter registry**, heuristic detection still works — issuer doesn't need prior knowledge of the platform.

## Channel selection

1. Read `.issuer/config.yml` → get `platform` and `mcp_capabilities`.
2. **Check MCP availability**: if `channel: mcp` and `create` + `read` are true → use MCP.
3. **Check CLI adapter**: if MCP unavailable, check adapter registry for platform.
   - Has adapter → use CLI channel (`issuer push`)
   - No adapter → prompt user with options
4. **Single channel per sync** — never mix MCP and CLI.

**Selection order**: MCP-first → CLI adapter → user prompt

## MCP channel — steps

For each task file with `status: ready`:

1. Load frontmatter and body.
2. Build labels: original `labels` ∪ `[type:<type>, priority:<priority>]`, deduped.
3. If `platform_id` is null → call the MCP create tool (detected by heuristic).
4. Else → if `update` capability exists, call update tool; else skip with warning.
5. Patch local file: `platform_id`, `platform_url`, `status: synced`, `updated_at`.
6. Continue on per-task failure but record the error.

### Jira-specific field mapping (Atlassian Rovo MCP)

When the detected MCP tool belongs to Jira (e.g. `createJiraIssue`, `create_jira_issue`), map local task fields as follows:

| Local field | Jira MCP parameter | Notes |
|---|---|---|
| `title` | `summary` | Required |
| `body` (Markdown) | `description` | Rovo MCP handles ADF conversion automatically |
| `type` (story/bug/task/epic) | `issueType` | Capitalise: Story, Bug, Task, Epic |
| `config.repo` (Project Key) | `projectKey` | From `.issuer/config.yml` → `repo` field |
| `labels` | `labels` | Array, pass as-is |
| `priority` | `priority` | Map: critical→Highest, high→High, medium→Medium, low→Low |

> **No Markdown-to-ADF conversion needed.** The Atlassian Rovo MCP Server accepts plain Markdown in `description` and converts it to ADF automatically.


## CLI channel — steps

1. Run `issuer push` in the project directory with agent mode flag:
   ```bash
   issuer push --agent-mode
   ```
   This ensures approval mode output (non-blocking JSON) instead of TUI readline prompts.

2. **Check for duplicate approval request** — parse stdout for structured JSON:
   ```
   ---APPROVAL-REQUEST-BEGIN---
   { "type": "duplicate_approval", ... }
   ---APPROVAL-REQUEST-END---
   ```
   
   If approval request found:
   - Display duplicate details to user with clear UI
   - Show action options as interactive buttons:
     - **Upload** → execute `issuer push --dedup-action upload`
     - **Skip** → execute `issuer push --dedup-action skip`
     - **Cancel** → stop without changes
   - Wait for user selection and execute chosen command

3. If no approval request, read stdout / exit code and report normally.

4. CLI patches files itself — don't duplicate.

## Output

Table per task: `id | action | channel | platform_id | url | error?`

Channel summary at end:

```
Sync channel: MCP | Platform capabilities: create ✓ | update ✓ | search ✓ | read ✓
```

OR

```
Sync channel: CLI (MCP unavailable) | Platform: yunxiao
```

## Guardrails

- **Only sync `status: ready` tasks** — never draft or synced.
- **Check platform match** — skip if task.platform ≠ config.platform.
- **Single channel per sync** — never mix MCP and CLI.
- **Prompt when blocked** — if MCP insufficient and no CLI adapter, give user options:
  1. Install MCP server for this platform
  2. Wait for official CLI adapter support
  3. Develop custom adapter
