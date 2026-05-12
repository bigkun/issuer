# @issuer/cli

> Skill-driven PM gateway. Structure requirements with agent skills, push to GitHub Issues / GitLab Issues / 云效 (Yunxiao) via CLI.

**English** | [中文](README.zh-CN.md)

`issuer` is two thin layers stitched together:

- **Skills** — Markdown contracts that constrain what your coding agent's AI does when it converts raw requirement text into structured PM work items. No AI lives inside `issuer` itself; the agent you already use provides it.
- **CLI** — A small Node.js binary that owns the network edge: it pushes ready task files to GitHub / GitLab / 云效. The CLI never calls an LLM.

## Install

```bash
npm i -g @issuer/cli
```

Requires Node.js 20+.

## Quick start

```bash
# 1. Initialise the project (interactive, or pass flags)
issuer init -y --platform github --owner my-org --repo my-repo

# 2. Install the bundled skills into your agent
issuer skill install

# 3. In your agent (Claude / Qoder / Cursor / OpenCode / …) invoke:
#       /issuer
#    Paste raw requirement text. The skill chains: breakdown → sync.
```

The agent will:

1. Split raw text into one `.issuer/tasks/YYYY-MM-DD-<slug>.md` file per work item, all `status: draft` (`issuer-breakdown`).
2. Ask you which to flip to `status: ready`.
3. Push the ready ones to the configured platform (`issuer-sync`).

> **Optional**: Add `--refine` flag or ask the agent to refine first if you want a PRD-style brief before breakdown.

## How it works

Two core skills chained with explicit user checkpoints (refine is optional):

```
raw text
  ├─▶ [Optional: issuer-refine]  →  enriched PRD-style brief (.issuer/briefs/<slug>.md)
  │         [CHECKPOINT — user approves]
  └─▶ Stage 1: issuer-breakdown  →  task files (.issuer/tasks/*.md, status: draft)
          [CHECKPOINT — user selects which to promote]
  └─▶ Stage 2: issuer-sync       →  remote issues (status: synced)
```

### `/issuer` — Orchestrator

Primary pipeline. Chains breakdown → sync with checkpoints between stages.

| Stage | Skill | Output | Checkpoint |
|-------|-------|--------|------------|
| 0 (optional) | `issuer-refine` | `.issuer/briefs/<slug>.md` | User approves brief text |
| 1 | `issuer-breakdown` | `.issuer/tasks/*.md` (draft) | User selects which files → ready |
| 2 | `issuer-sync` | Remote issues (synced) | None — auto-pushes ready files |

**Two invocation modes:**
- **Quick mode**: `/issuer <text>` — proceeds directly to breakdown, still requires Stage 1 checkpoint
- **Interactive mode**: `/issuer` — asks if you want to refine first, then source scope and working directory
- **With refine**: `/issuer --refine <text>` or explicitly ask to refine → runs refine → breakdown → sync

### `/issuer-refine` — Enrich raw requirements (Optional)

> **Note**: This skill is optional. Only run when explicitly requested by the user.

Takes rough requirement text and **enriches** it into a professional PRD-style brief.

**When to use:**
- Complex requirements that need structure and clarification
- When you want acceptance criteria and assumptions documented
- When the input is vague or incomplete

**Key steps:**
1. **Evaluate input quality** — five-dimension score (Structure, Professional phrasing, Verifiability, Boundaries, Assumptions)
2. **Surface assumptions** — list ambiguous interpretations before proceeding
3. **Reframe vague requirements** — "faster" → "≤2s", "better UX" → "≤3 steps"
4. **Write brief** — Problem / Goal / Assumptions / Boundaries / Acceptance criteria (checkboxes)

**Output**: `.issuer/briefs/<slug>.md` with localized headings matching user's language.

### `/issuer-breakdown` — Split brief into tasks

Reads raw text (or a refined brief) and emits one Markdown file per work item.

**Platform-aware styles**: Automatically adapts to your platform's best practices — **zero configuration needed**!

| Platform | Style | Acceptance Criteria | Effort Estimation |
|----------|-------|---------------------|-------------------|
| 云效 (Yunxiao) | Formal, structured | Given-When-Then format | ✅ Required |
| GitHub | Casual, developer-friendly | Markdown checklist | ❌ Optional |
| GitLab | Technical, precise | Checklist + technical notes | ❌ Optional |

**Key steps:**
1. **Parse input** — identify work items (bug/story/task/epic)
2. **Apply platform style** — automatically format based on `platform` in config
3. **Write task files** — `.issuer/tasks/YYYY-MM-DD-<slug>.md` with YAML frontmatter
4. **Present approval prompt** — user selects which files to set `status: ready`

**Custom templates** (optional):
```bash
# Create custom template
cp docs/examples/breakdown-template.md .issuer/templates/breakdown.md

# Add to config.yml
breakdown:
  template: .issuer/templates/breakdown.md
```

**Output format:**
```yaml
---
id: 2026-05-07-fix-login
type: bug
title: Fix login validation error
status: draft  # → ready after user selection
platform: github
labels: []
---
```

### `/issuer-sync` — Push tasks to platform

Reads all `status: ready` task files and creates/updates remote work items.

**Features:**
- **MCP-first**: Uses MCP tools if available
- **CLI fallback**: Falls back to platform API if MCP lacks capabilities
- **Dedup detection**: Compares titles against cached remote issues
- **Status update**: Marks successfully synced tasks as `status: synced`

## Platform setup

### GitHub

```bash
issuer init -y --platform github --owner my-org --repo my-repo
```

**Credentials** (resolved in order):

1. `ISSUER_GITHUB_TOKEN`
2. `GITHUB_TOKEN`
3. `~/.issuer/credentials.yml` → `github_token: ghp_xxxx`

Create a token at [github.com/settings/tokens](https://github.com/settings/tokens) with `repo` scope.

**MCP**: If a GitHub MCP server is wired into your agent, `issuer-sync` calls those tools directly — zero extra credentials needed.

### 云效 (Yunxiao)

```bash
issuer init -y --platform yunxiao --owner <organizationId> --repo <spaceIdentifierId>
```

- `--owner` → 云效 organization ID（企业标识，从 `https://devops.aliyun.com/organization/<organizationId>` 中获取）
- `--repo` → 云效 project ID（spaceIdentifierId / projectId）

**Credentials** (resolved in order):

1. `ISSUER_YUNXIAO_TOKEN`
2. `YUNXIAO_TOKEN`
3. `~/.issuer/credentials.yml` → `yunxiao_token: xxxx`

Create a Personal Access Token at 云效 → 个人设置 → 个人访问令牌，勾选以下权限:
- **项目协作** (工作项读写) — create/update/search work items
- **组织管理 - 用户** (只读) — fetch your user ID on first push (GetUserByToken API)

> **Note**: On first `issuer push`, the CLI automatically fetches your user ID via GetUserByToken API and saves it to `.issuer/config.yml`. This requires the 「组织管理 - 用户」(只读) permission.

**MCP**: 云效 MCP (`alibabacloud-devops-mcp-server`) currently covers create/search/read (3/5). Update and comment fall back to the CLI adapter, which calls the 云效 OpenAPI at `openapi-rdc.aliyuncs.com` with `Bearer <PAT>` auth — closing the full 5/5 capability gap.

### GitLab

```bash
issuer init -y --platform gitlab --owner my-group --repo my-project
```

- `--owner` → GitLab group or namespace
- `--repo` → GitLab project name or ID

**MCP**: GitLab's built-in MCP server (GitLab 18.6+, `https://<gitlab.example.com>/api/v4/mcp`) covers create/search/read/comment (4/5). `update` falls back to CLI.

## Supported Agents

| Agent | Skills Path | Notes |
|-------|-------------|-------|
| **Claude Code** | `~/.claude/skills/` | Primary target, [agentskills.io](https://agentskills.io) originator |
| **Cursor** | `~/.claude/skills/` | Uses Claude standard (Nightly channel) |
| **VS Code Copilot** | `~/.github/skills/` or `~/.copilot/skills/` | Multi-path support |
| **Qoder / OpenCode** | `~/.qoder/skills/` | Custom path |

### Quick start with specific agent

```bash
# Claude Code
issuer init -y --platform github --owner my-org --repo my-repo --agent claude
issuer skill install --target ~/.claude/skills

# Cursor
issuer init -y --platform github --owner my-org --repo my-repo --agent cursor
issuer skill install --target ~/.claude/skills

# VS Code Copilot
issuer init -y --platform github --owner my-org --repo my-repo --agent copilot
issuer skill install --target ~/.github/skills

# Qoder / OpenCode
issuer init -y --platform github --owner my-org --repo my-repo --agent qoder
issuer skill install --target ~/.qoder/skills
```

### Auto-detect (default)

If `--agent` is not specified, `issuer skill install` auto-detects existing skills directories:

```bash
issuer init -y --platform github --owner my-org --repo my-repo
issuer skill install  # Detects ~/.claude/skills, ~/.copilot/skills, etc.
```

## Sync channels

`issuer-sync` picks one of:

| Platform | MCP coverage | CLI fallback for gaps |
|---|---|---|
| GitHub | 5/5 (create, update, search, read, comment) | None needed |
| GitLab | 4/5 (missing `update`) | `issuer push` |
| 云效 | 3/5 (missing `update`, `comment`) | `issuer push` → OpenAPI (full 5/5) |

**MCP-first** — if a matching MCP server is wired into your agent, the skill calls those tools directly.

**CLI fallback** — otherwise the skill shells out to `issuer push`, which uses the platform SDK / OpenAPI and a token resolved from (in order):
1. `ISSUER_<PLATFORM>_TOKEN`
2. `<PLATFORM>_TOKEN`
3. `~/.issuer/credentials.yml`

### Tested platforms

| Platform | MCP channel | CLI (API) channel | Notes |
|---|---|---|---|
| GitHub | ✓ All tests pass | ✓ All tests pass | Full 5/5 via both channels |
| GitLab | ✓ Tests pass | ✓ Tests pass | MCP lacks `update`, CLI covers gap |
| 云效 (Yunxiao) | ✓ Tests pass | ✓ All tests pass | MCP 3/5, CLI via OpenAPI → full 5/5 |

Both channels are production-ready for all supported platforms.

### Adding new platforms (MCP-first, zero-code integration)

**Any platform with an MCP server can be supported** — no REST API adapter development required.

#### How it works

1. **Heuristic capability detection** — issuer automatically detects MCP tools by keyword matching:
   - `create` + `issue/workitem/task` → create capability
   - `get/read` + `issue/workitem/task` → read capability
   - Same logic for update, search, comment

2. **Minimum requirements** — MCP server must expose at least:
   - **create** — create new issue/work item
   - **read** — read/verify an issue/work item

3. **Tool naming convention** — use `action + object` pattern:
   ```
   create_issue, get_issue, update_issue, search_issues, add_comment
   create_work_item, get_work_item, search_workitems
   myPM_create_ticket, myPM_get_ticket
   ```

#### Setup steps

1. **Configure MCP server** in your agent (Claude Code, Cursor, Qoder, etc.)
2. **Run `issuer init`** — issuer probes MCP tools and writes capabilities to `.issuer/config.yml`
3. **Use `issuer-sync`** — skill calls MCP tools directly

If MCP tools don't meet minimum requirements, issuer prompts you with options:
- Fix MCP server configuration
- Wait for API adapter support
- Develop custom REST adapter

## Commands

| Command | Description |
|---|---|
| `issuer init` | Create `.issuer/config.yml` and `.issuer/tasks/` |
| `issuer status` | Count local tasks by `draft` / `ready` / `synced` |
| `issuer push` | Push every `status: ready` task; mark them `synced` |
| `issuer list-remote` | List issues on the configured remote |
| `issuer skill install` | Copy bundled skills to your agent skills directory |

## Project layout

```
.issuer/
  config.yml           # platform + owner + repo + default labels + mcp_capabilities + dedup
  credentials.yml      # platform tokens (optional, env vars preferred)
  tasks/                # one work item per file
    2026-05-06-add-login.md
  cache.json            # cached remote issues (for dedup detection)
```

> **Optional**: `.issuer/briefs/` directory stores refined PRD-style briefs when using `issuer-refine`.

Each task file is YAML frontmatter + Markdown body. See [docs/plans/2026-05-06-issuer-v2-design.md](docs/plans/2026-05-06-issuer-v2-design.md) for the full schema and architecture.

## Status

MVP. GitHub, GitLab, 云效 (Yunxiao).

## License

MIT.
