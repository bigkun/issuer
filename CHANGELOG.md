# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-05-20

### Added
- **Linear Platform Support**: Added full support for the Linear platform via the official Linear MCP Server.
- **Linear Breakdown Templates**: Added Linear-specific, professional agile breakdown templates (`linear.md`) for Story, Bug, Task, and Epic issue styles.
- **MCP Tool Heuristics for Linear**: Integrated tool patterns for Linear (`create_issue`, `update_issue`, `list_issues`, `get_issue`) in the MCP capability detector.
- **Interactive Initialisation**: Added Linear choice in `issuer init` prompt with Workspace and Team Identifier (Team Key) auto-resolution and custom OAuth instruction hints.
- **Dynamic Tested Platform Registry**: Integrated `linear` to avoid generating generic breakdown fallbacks.

---

## [0.3.1] - 2026-05-19

### Added
- **Dependencies Field**: Added `dependencies` frontmatter field support to the breakdown schema and all platform templates (GitHub, GitLab, Yunxiao, PingCode, Jira).

### Changed
- **Proactive Clarification**: Enhanced `issuer-refine` skill to automatically ask 3-5 multiple-choice clarifying questions when user input completeness score is < 80.
- **Granularity Control**: Updated `issuer-breakdown` skill with strict split/merge rules based on AC count to ensure single-session task sizing.
- **Testability Enforcement**: Enhanced `issuer-breakdown` skill to require observable/testable Acceptance Criteria and added mandatory visual verification for UI tasks.
- **Interactive Review**: Improved `issuer-breakdown` fallback text prompt to explicitly support natural language refinement commands (e.g. "merge 1 and 2", "split 2").

---

## [0.3.0] - 2026-05-19

### Added

#### Jira Platform Support (MCP-only via Atlassian Rovo)

- **First-class Jira platform**: `issuer init --platform jira` now prompts for Jira Cloud domain (`--owner`) and Project Key (`--repo`) with dedicated interactive flow
- **Zero-token init**: Jira skips the entire CLI credential flow; OAuth 2.1 is handled by the Atlassian Rovo MCP Server — no API token required
- **OAuth guidance**: `issuer init` and `issuer auth` print clear setup instructions for `mcp-remote` and Rovo OAuth consent
- **Jira MCP tool detection**: Added Rovo MCP Server tool name patterns to heuristic capability detection (`createJiraIssue`, `updateJiraIssue`, `searchJiraIssuesWithJql`, `getJiraIssue`, plus snake_case community-server variants)
- **CLI guards**: `issuer push`, `issuer list-remote`, and `issuer cache refresh` detect MCP-only platforms and print actionable `/issuer-sync` redirect messages instead of crashing
- **Jira breakdown template**: Added `skills/issuer-breakdown/templates/jira.md` with best-practice Agile templates for Story (GWT acceptance criteria, DoD), Bug (Environment block, Steps to Reproduce, Impact Scope), Task (phased Implementation Steps, Technical Constraints), and Epic (Strategic Objective, Scope Boundaries, Milestones, quantified Success Metrics)
- **Jira field mapping**: Added Jira-specific field mapping table to `skills/issuer-sync/SKILL.md` (`title→summary`, `body→description`, `type→issueType`, `repo→projectKey`, priority mapping)
- **Jira docs**: Added Jira setup section and updated sync channel tables in both `README.md` and `README.zh-CN.md`

#### Platform Registry Improvements

- **`TEMPLATE_PLATFORMS`**: New registry constant listing platforms with dedicated built-in breakdown templates (superset of `CLI_ADAPTER_PLATFORMS`)
- **`hasBreakdownTemplate(platform)`**: New helper — returns `true` for platforms with a built-in template file in `skills/issuer-breakdown/templates/`
- **Cleaner `issuer init`**: Known platforms with templates (including Jira) no longer generate a generic `.issuer/templates/breakdown.md` fallback; `breakdown_template` is omitted from `config.yml`

### Fixed

- **`issuer auth` for MCP-only platforms**: Now exits gracefully with OAuth guidance instead of crashing on `createAdapter`
- **Credential flow guard**: `init` now correctly skips token lookup, prompt, and write for any platform without a CLI adapter

### Changed

- `BUILT_IN_PLATFORMS` in `init.ts` now references `CLI_ADAPTER_PLATFORMS` directly (single source of truth)
- Platform description in `package.json` updated to include Jira

---

## [0.2.2] - 2026-05-14

### 🎉 Major Features

#### PingCode Platform Support

- **PingCode Adapter**: Added full PingCode public cloud REST API adapter with token-based authentication
- **Init Integration**: Added PingCode as 4th built-in platform in `issuer init` (alongside GitHub, GitLab, Yunxiao)
- **HTML Format Conversion**: Automatic Markdown to HTML conversion for PingCode descriptions
- **Project Type Detection**: Auto-detect and cache PingCode project type (Req/Bug/Task/Epic) on first push
- **Platform-Specific MCP Detection**: Added PingCode tool name patterns for MCP capability detection

#### Language Preservation

- **Task Content Language**: Task files now preserve user's input language for all content
- **Dynamic Section Headers**: Section headers automatically match user's language (Chinese: 用户故事/验收标准, English: User Story/Acceptance Criteria)
- **Multi-Language Support**: Added support for Chinese, English, Japanese, Korean, French and other languages
- **No Auto-Translation**: Prevented AI from auto-translating task content

### 🔧 Improvements

#### Yunxiao MCP Coverage

- **Update Support**: Yunxiao MCP now supports `update_work_item` tool
- **Full 4/4 Coverage**: Upgraded from 3/4 to 4/4 capabilities (create, update, search, read)

#### Code Cleanup

- **Comment Removal**: Removed `comment` capability from MCP/CLI capability model (5→4 capabilities)
- **Adapter Cleanup**: Removed `addComment()` method from all platform adapters (PingCode, GitLab, Yunxiao)
- **Token Helper**: Removed unused `token-helper.ts` from PingCode adapter
- **Auth Simplification**: Removed `client_id`/`client_secret` prompts from auth command
- **Debug Logs**: Cleaned up all debug logs from PingCode adapter and dedup logic

#### Bug Fixes

- **PingCode API Endpoints**: Corrected to `/v1/project/work_items` (was incorrect path)
- **Platform ID/URL**: Fixed to use `short_id` and `html_url` for PingCode
- **Dedup Cache**: Fixed `listRemote` to read `values` field for proper duplicate detection
- **HTML Conversion**:
  - Preserved `\n` line breaks in PingCode HTML
  - Removed extra `<br>` tags between HTML elements
  - Wrapped plain text in `<p>` tags
  - Fixed ordered list conversion
- **Config Loading**: Fixed waterfall project type support and config loading
- **Built-in Platforms**: Added pingcode to `BUILT_IN_PLATFORMS` to prevent owner prompt

#### Agent UI Enhancement

- **Breakdown Approval**: Added Agent UI approval protocol to breakdown skill

### 📚 Documentation

- **README Updates**:
  - Added PingCode to all platform tables and setup guides
  - Synced English README with Chinese version (PingCode OAuth details)
  - Corrected PingCode MCP availability status (coming soon)
  - Updated Yunxiao MCP coverage to 4/4
- **SKILL.md Updates**:
  - Removed comment capability from issuer-sync SKILL.md
  - Added language preservation rules to issuer-breakdown SKILL.md
  - Updated capability counts (5/5 → 4/4) across all documentation
- **Platform Analysis**: Added comprehensive PingCode platform analysis and adapter design reference

### 📦 Technical Details

#### Breaking Changes

- **Capability Model**: Reduced from 5 to 4 capabilities (removed `comment`)
  - Old: `create | update | search | read | comment`
  - New: `create | update | search | read`
- **Adapter Interface**: Removed `addComment()` method from all adapters
- **Config Structure**: `mcp_capabilities.capabilities` no longer includes `comment` field

#### Migration Guide

- Re-initialize config if you have existing `comment: false` in capabilities (not required but recommended)
- Update any custom code that calls `adapter.addComment()` (method removed)
- Update capability checks from 5-field to 4-field model

## [0.2.1] - 2026-05-13

### 🎉 Major Features

#### Single-Channel Sync Architecture

- **MCP-First Single Channel**: Enforced single channel per platform - never mix MCP and CLI
- **Channel Selection Logic**: Implemented `determineChannel()` function with MCP-first → CLI fallback → unsupported flow
- **SyncChannel Type**: Added new type with three values: `'mcp' | 'cli' | 'unsupported'`
- **Registry Simplification**: Simplified adapter registry to CLI adapter whitelist only, removed MCP tool mappings

#### Agent Mode Approval

- **Non-Interactive Mode**: Added `--agent-mode` flag for Agent chat environment support
- **Structured Approval Output**: Output structured JSON approval request for Agent UI consumption
- **Dual-Mode Interaction**: TTY environment uses readline TUI, Agent mode uses approval JSON
- **SKILL.md Integration**: Updated issuer-sync SKILL.md to parse and handle approval requests

### 🔧 Improvements

#### Code Refactoring

- **Registry Module**: Removed MCP tool name mappings, kept only `hasApiAdapter()` and `CLI_ADAPTER_PLATFORMS`
- **MCP Detection**: Added `determineChannel()` and updated `capabilitiesFromProbe()` signature
- **Init Command**: Updated to use new channel selection logic
- **Test Suite**: Refactored all tests to match new architecture (189 tests passing)

#### Bug Fixes

- **Test Parameter Fix**: Fixed missing `cliAdapterAvailable` parameter in `mcp-detect.test.ts`
- **Duplicate Test Block**: Removed duplicate `determineChannel` describe block in tests

### 📦 Technical Details

#### Breaking Changes

- **API Changes**:
  - `capabilitiesFromProbe()` now requires `cliAdapterAvailable: boolean` parameter
  - `SyncChannel` type changed from `'mcp' | 'cli'` to `'mcp' | 'cli' | 'unsupported'`
- **Registry Changes**:
  - Removed `ADAPTER_REGISTRY`, `getRegistryEntry()`, `capabilitiesFromRegistry()`
  - Removed `capabilitiesFromProbeWithRegistry()` function
  - Removed MCP tool name mappings for GitHub, GitLab, Yunxiao

#### Migration Guide

- Update calls to `capabilitiesFromProbe(tools)` → `capabilitiesFromProbe(tools, hasApiAdapter(platform))`
- Handle new `'unsupported'` channel value in channel selection logic
- Use `CLI_ADAPTER_PLATFORMS.includes(platform)` instead of `getRegistryEntry(platform)`

### 📊 Statistics

- **Total Commits**: 4 commits since 0.2.0
- **Files Changed**: 11 files
- **Lines Changed**: +452 / -570
- **Test Coverage**: 189 tests passing

---

## [0.2.0] - 2026-05-13

### 🎉 Major Features

#### MCP-First Architecture & Multi-Platform Support

- **Generic Platform Support**: Added support for any MCP-compatible platform beyond built-in GitHub, GitLab, Yunxiao, PingCode
- **MCP-First Architecture**: Updated all CLI descriptions to emphasize infinite extensibility via MCP
- **Adapter Factory Functions**: Added factory functions for cleaner adapter instantiation
- **Platform Style Integration**: Platform-specific breakdown styles now embedded in SKILL.md for zero-configuration breakdown

#### Two-Stage Pipeline Architecture

- **Breakdown + Sync Model**: Restructured core architecture to breakdown → sync pipeline, refine made optional
- **Custom Save Paths**: Added support for custom refine/breakdown save path configuration
- **Two-Level Configuration**: Implemented global config (`~/.issuer/config.yml`) + project config (`.issuer/config.yml`)

#### Multi-Agent Skill Installation

- **20+ Agent Support**: Added support for Claude, Cursor, Copilot, Qoder, Codex, Windsurf, and more
- **Interactive Installation**: Enhanced skill install with interactive agent selection when `--target` not specified
- **Config-Driven**: Skill installation now driven by agent registry configuration
- **Global Path Priority**: Skills install to user home directory by default (e.g., `~/.qoder/skills`)

#### Enhanced Yunxiao Integration

- **Priority & Severity Separation**: Bug type now supports independent `priority` and `severity` fields
- **Auto Field Mapping**: Automatic retrieval and caching of Yunxiao field configurations
- **Required Field Auto-Fill**: Automatically fills required fields (assignedTo, spaceId, etc.)
- **Custom Field Values**: Fixed API to use `customFieldValues` instead of `customFields`
- **Work Item Type Matching**: Automatic work item type matching with priority mapping

#### Advanced Deduplication

- **Type-Aware Dedup**: Cache structure enhanced with type field for type-aware deduplication
- **Interactive Dedup UI**: Added dedup statistics and user interaction during push
- **Refined Dedup Config**: Refactored dedup configuration into two independent parameters (`enabled`, `threshold`)
- **Auto-Generated Config**: `init` command now generates default dedup configuration

### 🔧 Improvements

#### CLI Enhancements

- **Comprehensive Prompt Optimization**: Updated all CLI prompts for clarity and professionalism
  - Display specific agent names instead of generic terms
  - Use full paths instead of `~` on Windows
  - Structure help text with numbered lists
  - Show specific environment variable names in token configuration hints
- **Help Description Updates**:
  - `init --help`: Updated platform and agent descriptions
  - `skill install --help`: Added interactive agent selection note
  - Emphasized MCP-first architecture and multi-platform support
- **Push Command Redesign**: Redesigned push command parameters for clearer semantics
- **Programming Agent Approval Mode**: Added native approval mode support (buttons/quick actions)

#### Documentation

- **English SKILL.md**: Converted all SKILL.md files to English for international accessibility
- **Bug Title Convention**: Added title convention rules to prevent action verbs in bug titles
  - Problem: AI was adding "Fix", "Resolve", "Repair" to bug titles
  - Solution: Title MUST describe the problem, not the solution
  - Added to all platform templates (Yunxiao, GitHub, GitLab, Generic)
- **README Enhancements**:
  - Added Chinese version README with language switching
  - Updated with generic platform support and custom template instructions
- **Work Item Type Labels**: Added story/bug/task/epic labels to index.md
- **Documentation Updates**: Updated all docs to match two-stage architecture

#### Code Quality

- **Constants Extraction**: Extracted hardcoded constants to `src/core/constants.ts`
- **Test Updates**: Updated test cases to match generic platform and constants refactoring

### 🐛 Bug Fixes

#### Critical Fixes

- **Push Validation Error**: Fixed `platform_id` and `platform_url` validation error
  - Problem: Draft tasks without platform_id/platform_url failed validation
  - Solution: Allow these fields to be null/undefined for unsynced tasks
- **Skill Installation Path**: Fixed skill installation to user home directory instead of project directory
  - Problem: Skills were installed to project directory (e.g., `C:\project\.codex\skills`)
  - Solution: Use global path priority (`preferGlobal=true`) for skill installation
- **Skill Detection Consistency**: Fixed init command to correctly detect global skill installation status
  - Problem: Detection checked project directory while installation used global directory
  - Solution: Consistent path strategy with `preferGlobal=true`
- **Tilde Path Expansion**: Fixed `~` path not expanding to user home directory on Windows
  - Problem: `issuer skill install --target ~/.qoder/skills` created `~/` directory
  - Solution: Added `expandHome()` function to manually handle tilde expansion

#### Yunxiao Fixes

- **Severity Field Matching**: Added null safety to Yunxiao severity field matching
- **API Field Mapping**: Fixed to use `customFieldValues` instead of `customFields`
- **Priority Mapping**: Fixed priority to defect level mapping for Bug type

#### Cache Fixes

- **Cache Validation**: Fixed cache validation logic to auto-refresh when configuration changes

### 📦 Technical Details

#### Breaking Changes

- **Architecture Change**: Core architecture changed from `refine → breakdown → sync` to `breakdown → sync` (refine optional)
- **Dedup Config**: Dedup configuration structure changed from single object to `enabled` + `threshold` parameters
- **Push Command**: Push command parameters redesigned for clearer semantics

#### Migration Guide

- Existing `.issuer/config.yml` files will work without changes
- Custom dedup configurations may need to be updated to new format
- Run `issuer init --force` to regenerate configuration with latest defaults

### 📊 Statistics

- **Total Commits**: 42 commits since last release
- **Files Changed**: 50+ files
- **Test Coverage**: 183 tests passing
- **Build Size**: 90.76 KB (minified)

---

## Previous Releases

For earlier releases, see the [GitHub Releases](https://github.com/your-org/issuer/releases) page.
