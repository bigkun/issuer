/**
 * Adapter Registry — known platform precise mappings + CLI fallback judgment.
 *
 * This registry ships with `@issuer/cli` and declares:
 * 1. Precise tool name mappings for known platforms (overrides heuristic when available)
 * 2. CLI fallback availability (which platforms have REST API adapters)
 *
 * For unknown platforms, use mcp-detect.ts for heuristic capability detection.
 *
 * Design: MCP-first (heuristic) + Registry override (precise) + CLI fallback.
 */

import {
  McpCapability,
  McpCapabilities,
  detectCapabilitiesHeuristic,
  meetsMinimumRequirements,
} from './mcp-detect.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mapping from each capability to the MCP tool name that provides it. */
export type CapabilityToolMap = Record<McpCapability, string | null>;

/** A single entry in the adapter registry. */
export interface AdapterRegistryEntry {
  /** Platform identifier (must match `config.yml` platform field). */
  platform: string;
  /** Human-readable name of the MCP server package. */
  mcpPackage: string;
  /** Maps each capability to the MCP tool name that provides it (null = not available). */
  capabilities: CapabilityToolMap;
  /** Additional tool names not mapped to core capabilities but useful for Issuer. */
  extraTools: string[];
  /** OpenAPI capabilities available via CLI fallback. When set, these override MCP nulls. */
  apiCapabilities?: CapabilityToolMap;
}

// ---------------------------------------------------------------------------
// Built-in registry (known platforms with precise mappings)
// ---------------------------------------------------------------------------

export const ADAPTER_REGISTRY: ReadonlyArray<AdapterRegistryEntry> = [
  {
    platform: 'github',
    mcpPackage: 'github/github-mcp-server',
    capabilities: {
      create: 'create_issue',
      update: 'update_issue',
      search: 'search_issues',
      read: 'get_issue',
      comment: 'add_issue_comment',
    },
    extraTools: [
      'list_issues',
      'add_sub_issue',
      'remove_sub_issue',
      'list_sub_issues',
      'assign_copilot_to_issue',
      'list_issue_types',
      'get_label',
      'list_label',
    ],
  },
  {
    platform: 'gitlab',
    mcpPackage: 'gitlab-org/gitlab (remote MCP server)',
    capabilities: {
      create: 'create_issue',
      update: null, // GitLab MCP currently lacks update_issue tool
      search: 'search', // scope=issues
      read: 'get_issue',
      comment: 'create_workitem_note',
    },
    extraTools: [
      'get_mcp_server_version',
      'create_merge_request',
      'get_merge_request',
      'get_merge_request_commits',
      'get_merge_request_diffs',
      'get_merge_request_pipelines',
      'get_pipeline_jobs',
      'manage_pipeline',
      'get_workitem_notes',
    ],
    apiCapabilities: {
      create: 'Issues.create', // @gitbeaker/rest — POST /projects/:id/issues
      update: 'Issues.edit', // @gitbeaker/rest — PUT /projects/:id/issues/:iid
      search: 'Issues.all', // @gitbeaker/rest — GET /projects/:id/issues
      read: 'Issues.show', // @gitbeaker/rest — GET /projects/:id/issues/:iid
      comment: 'IssueNotes.create', // @gitbeaker/rest — POST /projects/:id/issues/:iid/notes
    },
  },
  {
    platform: 'yunxiao',
    mcpPackage: 'alibabacloud-devops-mcp-server',
    capabilities: {
      create: 'create_work_item',
      update: null, // MCP: no update_work_item; CLI fallback via OpenAPI UpdateWorkItem
      search: 'search_workitems',
      read: 'get_work_item',
      comment: null, // MCP: no comment tool; CLI fallback via OpenAPI CreateWorkitemComment
    },
    extraTools: [
      'get_work_item_types',
      'search_projects',
      'get_project',
      'get_current_organization_Info',
    ],
    apiCapabilities: {
      create: 'CreateWorkitem', // POST /organization/{orgId}/workitems/create
      update: 'UpdateWorkItem', // POST /organization/{orgId}/workitems/update
      search: 'ListWorkitems', // GET /organization/{orgId}/listWorkitems
      read: 'GetWorkitem', // GET /organization/{orgId}/workitems/{identifier}
      comment: 'CreateWorkitemComment', // POST /organization/{orgId}/workitems/comment
    },
  },
];

// ---------------------------------------------------------------------------
// Registry lookup helpers
// ---------------------------------------------------------------------------

/**
 * Find a registry entry by platform name.
 * Returns `undefined` if the platform is not in the built-in registry.
 */
export function getRegistryEntry(platform: string): AdapterRegistryEntry | undefined {
  return ADAPTER_REGISTRY.find((e) => e.platform === platform);
}

/**
 * Check if a platform has an API adapter (CLI fallback available).
 */
export function hasApiAdapter(platform: string): boolean {
  return getRegistryEntry(platform) !== undefined;
}

// ---------------------------------------------------------------------------
// Registry-based capability derivation
// ---------------------------------------------------------------------------

/**
 * Derive `McpCapabilities` from a registry entry (used as baseline when no live probe).
 */
export function capabilitiesFromRegistry(entry: AdapterRegistryEntry): McpCapabilities {
  const tools: string[] = [];
  const capFlags: Record<McpCapability, boolean> = {
    create: false,
    update: false,
    search: false,
    read: false,
    comment: false,
  };

  for (const [cap, toolName] of Object.entries(entry.capabilities) as [McpCapability, string | null][]) {
    if (toolName) {
      tools.push(toolName);
      capFlags[cap] = true;
    }
  }

  tools.push(...entry.extraTools);

  const channel: 'mcp' | 'cli' = meetsMinimumRequirements(capFlags) ? 'mcp' : 'cli';

  return {
    channel,
    probed_at: new Date().toISOString(),
    tools,
    capabilities: capFlags,
  };
}

/**
 * Derive `McpCapabilities` from a live probe result.
 * Combines heuristic detection with registry override for known platforms.
 *
 * @param platform - Platform identifier.
 * @param probedTools - Tool names returned by the MCP server.
 * @returns Final `McpCapabilities`.
 */
export function capabilitiesFromProbeWithRegistry(
  platform: string,
  probedTools: string[],
): McpCapabilities {
  // Start with heuristic detection (works for any platform)
  const heuristicCaps = detectCapabilitiesHeuristic(probedTools);

  // For known platforms, override with precise registry mappings
  const entry = getRegistryEntry(platform);
  if (entry) {
    const toolSet = new Set(probedTools);
    for (const [cap, toolName] of Object.entries(entry.capabilities) as [McpCapability, string | null][]) {
      if (toolName && toolSet.has(toolName)) {
        heuristicCaps[cap] = true;
      }
    }
  }

  const channel: 'mcp' | 'cli' = meetsMinimumRequirements(heuristicCaps) ? 'mcp' : 'cli';

  return {
    channel,
    probed_at: new Date().toISOString(),
    tools: probedTools,
    capabilities: heuristicCaps,
  };
}

// ---------------------------------------------------------------------------
// Re-export from mcp-detect for convenience
// ---------------------------------------------------------------------------

export type {
  McpCapability,
  McpCapabilities,
} from './mcp-detect.js';

export {
  detectCapabilitiesHeuristic,
  meetsMinimumRequirements,
  MINIMUM_CAPABILITIES,
  getMissingCapabilities,
  formatCapabilitySummary,
  formatInsufficientCapabilitiesMessage,
  formatUnsupportedPlatformMessage,
} from './mcp-detect.js';