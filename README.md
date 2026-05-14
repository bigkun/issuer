# @issuer/cli

> Skill-driven PM gateway. Breakdown requirements → sync to any platform via MCP. Built-in: GitHub, GitLab, Yunxiao.

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

Built-in platforms use platform-specific templates from `skills/issuer-breakdown/templates/`. For unsupported platforms or custom workflows:

```bash
# Create custom template
cp .issuer/templates/breakdown.md .issuer/templates/my-custom-template.md

# Add to config.yml
breakdown_template: .issuer/templates/my-custom-template.md
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

### Unsupported platforms (MCP-first)

**Any platform with an MCP server can be supported** — no code changes needed!

```bash
issuer init -y --platform "Other (MCP)" --owner my-workspace --repo my-project
```

During initialization:
- Select "Other (MCP)" from the platform list
- Provide your workspace/project identifiers
- Set token via `ISSUER_<PLATFORM>_TOKEN` environment variable
- Issuer auto-creates a generic breakdown template at `.issuer/templates/breakdown.md`

The CLI uses MCP for sync operations, falling back to the generic template for task generation.

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

**MCP**: 云效 MCP (`alibabacloud-devops-mcp-server`) currently covers create/search/read (3/5). If MCP is unavailable, the CLI adapter uses the 云效 OpenAPI at `openapi-rdc.aliyuncs.com` with `Bearer <PAT>` auth — providing full 5/5 capability coverage.

### GitLab

```bash
issuer init -y --platform gitlab --owner my-group --repo my-project
```

- `--owner` → GitLab group or namespace
- `--repo` → GitLab project name or ID

**MCP**: GitLab's built-in MCP server (GitLab 18.6+, `https://<gitlab.example.com>/api/v4/mcp`) covers create/search/read/comment (4/5). If MCP is unavailable, the CLI adapter handles all operations.

### PingCode

```bash
issuer init -y --platform pingcode --repo SCR
```

- `--repo` → PingCode project identifier (项目标识), case-insensitive, will be converted to uppercase

**Get your token**:

PingCode supports two types of access tokens. Both require creating an application first:

1. **Create an application** (required for both token types):
   - Go to: `https://<your-org>.pingcode.com/admin/application/custom`
   - Create a new application
   - Select Auth method: **Authorization Code**
   - Set permissions:
     - Project Management: **Read-only**
     - Work Items: **Read & Write**
   - Note your `client_id` and `client_secret`

2. **Obtain access token**:
   
   **Enterprise Token** (recommended for automation):
   ```
   GET https://open.pingcode.com/v1/auth/token
     ?grant_type=client_credentials
     &client_id=YOUR_CLIENT_ID
     &client_secret=YOUR_CLIENT_SECRET
   ```
   
   **User Token** (for user-specific operations):
   - Use OAuth 2.0 Authorization Code flow
   - See: https://open.pingcode.com/#api-鉴权

3. **Use the token**:
   ```bash
   issuer auth
   # → Enter PingCode token: <paste your access_token>
   ```

**Credentials** (resolved in order):

1. `ISSUER_PINGCODE_TOKEN`
2. `PINGCODE_TOKEN`
3. `~/.issuer/credentials.yml` → `pingcode_token: your_access_token`
4. `.issuer/credentials.yml` → `pingcode_token: your_access_token`

**Project ID resolution**:
- You only need to provide the project identifier (e.g., `SCR`, `PROJ`)
- The adapter automatically resolves it to a project ID on first use
- The resolved ID is saved to `.issuer/config.yml` for faster subsequent operations

**MCP**: PingCode MCP Server support is available. If MCP is not configured or lacks `create` + `read` capabilities, issuer automatically falls back to CLI adapter with REST API.

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

`issuer-sync` uses **one channel per platform** (never mixed):

| Platform | MCP availability | CLI adapter | Default |
|---|---|---|---|
| GitHub | 5/5 (create, update, search, read, comment) | ✓ Full 5/5 | MCP when available, CLI otherwise |
| GitLab | 4/5 (create, search, read, comment) | ✓ Full 5/5 | MCP when available, CLI otherwise |
| 云效 | 3/5 (create, search, read) | ✓ Full 5/5 (via OpenAPI) | MCP when available, CLI otherwise |

**Channel selection logic**:
1. **MCP-first** — if MCP server is configured and meets minimum requirements (create + read), use MCP channel
2. **CLI adapter** — if MCP unavailable but platform has built-in CLI adapter, use CLI channel
3. **Prompt user** — if neither available, instruct user to install MCP server or wait for adapter support

**CLI channel** uses platform SDK / OpenAPI with token resolved from:
1. `ISSUER_<PLATFORM>_TOKEN`
2. `<PLATFORM>_TOKEN`
3. `~/.issuer/credentials.yml`

### Tested platforms

| Platform | MCP channel | CLI (API) channel | Notes |
|---|---|---|---|
| GitHub | ✓ All tests pass | ✓ All tests pass | Full 5/5 via either channel |
| GitLab | ✓ Tests pass | ✓ Tests pass | Either channel provides full capability |
| 云效 (Yunxiao) | ✓ Tests pass | ✓ All tests pass | Either channel provides full capability |

Both channels are production-ready for all supported platforms.

### Adding new platforms (MCP-first, zero-code integration)

**Any platform with an MCP server can be supported** — no REST API adapter development required.

#### Option 1: Interactive init (Recommended)

```bash
issuer init
# Select "Other (MCP)" from the platform list
# Provide workspace/project IDs
```

Issuer automatically:
- Probes MCP server capabilities
- Creates generic breakdown template
- Configures token resolution (`ISSUER_<PLATFORM>_TOKEN`)

#### Option 2: Manual setup

1. **Configure MCP server** in your agent (Claude Code, Cursor, Qoder, etc.)
2. **Run `issuer init`** — issuer probes MCP tools and writes capabilities to `.issuer/config.yml`
3. **Use `issuer-sync`** — skill calls MCP tools directly

If MCP tools don't meet minimum requirements, issuer prompts you with options:
- Fix MCP server configuration
- Use custom breakdown template for task generation
- Develop custom REST adapter (see [Adapter Development](#adapter-development))

#### How MCP detection works

Issuer uses heuristic capability detection by keyword matching:
- `create` + `issue/workitem/task` → create capability
- `get/read` + `issue/workitem/task` → read capability
- Same logic for update, search, comment

**Minimum requirements**: MCP server must expose at least **create** and **read** tools.

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
