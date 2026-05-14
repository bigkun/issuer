# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
