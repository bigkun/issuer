# @issuer/cli

> Skill-driven PM gateway. Structure requirements with agent skills, push to GitHub Issues / GitLab Issues / 云效 (Yunxiao) via CLI.

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
#    Paste raw requirement text. The skill chains: refine → breakdown → sync.
```

The agent will:

1. Refine your text into a PM-ready brief (`issuer-refine`).
2. Split it into one `.issuer/tasks/YYYY-MM-DD-<slug>.md` file per work item, all `status: draft` (`issuer-breakdown`).
3. Ask you which to flip to `status: ready`.
4. Push the ready ones to the configured platform (`issuer-sync`).

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

Create a Personal Access Token at 云效 → 个人设置 → 个人访问令牌，勾选「项目协作」权限。

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
  config.yml           # platform + owner + repo + default labels + mcp_capabilities
  briefs/               # refined PM-ready briefs
    <slug>.md
  tasks/                # one work item per file
    2026-05-06-add-login.md
  index.md              # outline index (topic → brief → tasks)
```

Each task file is YAML frontmatter + Markdown body. See [docs/plans/2026-05-06-issuer-v2-design.md](docs/plans/2026-05-06-issuer-v2-design.md) for the full schema and architecture.

## Status

MVP. GitHub, GitLab, 云效 (Yunxiao).

## License

MIT.
