# @issuer/cli

> Skill-driven PM gateway. Structure requirements with agent skills, push to GitHub Issues via CLI.

`issuer` is two thin layers stitched together:

- **Skills** — Markdown contracts that constrain what your coding agent's AI does when it converts raw requirement text into structured PM work items. No AI lives inside `issuer` itself; the agent you already use provides it.
- **CLI** — A small Node.js binary that owns the network edge: it pushes ready task files to GitHub Issues. The CLI never calls an LLM.

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
4. Push the ready ones to GitHub (`issuer-sync`).

## Sync channels

`issuer-sync` picks one of:

- **MCP-first** — if a GitHub MCP server is wired into your agent, the skill calls those tools directly. Zero extra credentials.
- **CLI fallback** — otherwise the skill shells out to `issuer push`, which uses Octokit and a token resolved from (in order):
  1. `ISSUER_GITHUB_TOKEN`
  2. `GITHUB_TOKEN`
  3. `~/.issuer/credentials.yml` (`github_token: ...`)

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
  config.yml           # platform + owner + repo + default labels
  tasks/
    2026-05-06-add-login.md   # one work item per file
```

Each task file is YAML frontmatter + Markdown body. See [docs/plans/2026-05-06-issuer-v2-design.md](docs/plans/2026-05-06-issuer-v2-design.md) for the full schema and architecture.

## Status

MVP. GitHub only. English-only output.

## License

MIT.
