/**
 * MCP Adapter Registry — built-in baseline for each platform's MCP capability surface.
 *
 * This registry ships with `@issuer/cli` and declares the known tool names and
 * capability flags for each supported platform's MCP server. During `issuer init`,
 * a live probe can override these baselines with the actual tools returned by the
 * MCP server; the merged result is written to `.issuer/config.yml` under
 * `mcp_capabilities`.
 *
 * Design: two-source merge (registry baseline + live probe). The registry provides
 * a fast, offline-capable starting point; the live probe reflects the actual runtime
 * state. See `docs/plans/2026-05-06-issuer-v2-design.md` §4.3.1 for full rationale.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The five capability groups that issuer-sync depends on. */
export type McpCapability = 'create' | 'update' | 'search' | 'read' | 'comment';

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

/** Shape of the `mcp_capabilities` section in `.issuer/config.yml`. */
export interface McpCapabilities {
  /** Which channel to use: `mcp` or `cli`. */
  channel: 'mcp' | 'cli';
  /** ISO 8601 timestamp of when the probe was run. */
  probed_at: string;
  /** Actual tool names returned by the MCP server (from live probe or registry baseline). */
  tools: string[];
  /** Derived capability flags — true if the tool is available. */
  capabilities: Record<McpCapability, boolean>;
}

// ---------------------------------------------------------------------------
// Built-in registry baseline
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
      search: 'search',     // scope=issues
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
      create: 'Issues.create',       // @gitbeaker/rest — POST /projects/:id/issues
      update: 'Issues.edit',         // @gitbeaker/rest — PUT /projects/:id/issues/:iid
      search: 'Issues.all',         // @gitbeaker/rest — GET /projects/:id/issues
      read: 'Issues.show',          // @gitbeaker/rest — GET /projects/:id/issues/:iid
      comment: 'IssueNotes.create',  // @gitbeaker/rest — POST /projects/:id/issues/:iid/notes
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
      create: 'CreateWorkitem',       // POST /organization/{orgId}/workitems/create
      update: 'UpdateWorkItem',       // POST /organization/{orgId}/workitems/update
      search: 'ListWorkitems',        // GET  /organization/{orgId}/listWorkitems
      read: 'GetWorkitem',            // GET  /organization/{orgId}/workitems/{identifier}
      comment: 'CreateWorkitemComment', // POST /organization/{orgId}/workitems/comment
    },
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
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
// Heuristic capability detection (MCP-first, platform-agnostic)
// ---------------------------------------------------------------------------

/** Keywords for each capability type. */
const CAPABILITY_KEYWORDS: Record<McpCapability, { actions: string[]; objects: string[] }> = {
  create: {
    actions: ['create', 'add', 'new', 'post', 'make', 'insert'],
    objects: ['issue', 'workitem', 'work_item', 'item', 'ticket', 'task'],
  },
  update: {
    actions: ['update', 'edit', 'modify', 'patch', 'change', 'set'],
    objects: ['issue', 'workitem', 'work_item', 'item', 'ticket', 'task'],
  },
  search: {
    actions: ['search', 'list', 'find', 'query', 'filter', 'get_all'],
    objects: ['issue', 'workitem', 'work_item', 'item', 'ticket', 'task', 'issues', 'items'],
  },
  read: {
    actions: ['read', 'get', 'fetch', 'retrieve', 'show', 'view'],
    objects: ['issue', 'workitem', 'work_item', 'item', 'ticket', 'task'],
  },
  comment: {
    actions: ['comment', 'reply', 'respond', 'add_comment', 'create_comment', 'note'],
    objects: ['issue', 'workitem', 'work_item', 'item', 'ticket', 'task'],
  },
};

/**
 * Heuristic capability detection from tool names.
 * Works for any MCP server, regardless of platform.
 *
 * @param toolNames - List of tool names from MCP server.
 * @returns Detected capabilities (true if matching tool found).
 */
export function detectCapabilitiesHeuristic(toolNames: string[]): Record<McpCapability, boolean> {
  const capabilities: Record<McpCapability, boolean> = {
    create: false,
    update: false,
    search: false,
    read: false,
    comment: false,
  };

  for (const tool of toolNames) {
    const lower = tool.toLowerCase();

    for (const cap of Object.keys(CAPABILITY_KEYWORDS) as McpCapability[]) {
      const keywords = CAPABILITY_KEYWORDS[cap];
      // Check if tool name contains any action keyword
      const hasAction = keywords.actions.some((action: string) => lower.includes(action));
      // Check if tool name contains any object keyword
      const hasObject = keywords.objects.some((obj: string) => lower.includes(obj));

      if (hasAction && hasObject) {
        capabilities[cap] = true;
      }
    }
  }

  return capabilities;
}

// ---------------------------------------------------------------------------
// Minimum capability requirements
// ---------------------------------------------------------------------------

/** Minimum capabilities required for issuer-sync to work. */
export const MINIMUM_CAPABILITIES: McpCapability[] = ['create', 'read'];

/**
 * Check if capabilities meet the minimum requirements for issuer-sync.
 *
 * @param capabilities - Capability flags.
 * @returns true if create + read are both available.
 */
export function meetsMinimumRequirements(capabilities: Record<McpCapability, boolean>): boolean {
  return MINIMUM_CAPABILITIES.every((cap) => capabilities[cap]);
}

/**
 * Get list of missing required capabilities.
 */
export function getMissingCapabilities(capabilities: Record<McpCapability, boolean>): McpCapability[] {
  return MINIMUM_CAPABILITIES.filter((cap) => !capabilities[cap]);
}

// ---------------------------------------------------------------------------
// Capability derivation helpers
// ---------------------------------------------------------------------------

/**
 * Derive `McpCapabilities` from a registry entry (used as baseline when no live probe is available).
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

  return {
    channel: 'mcp',
    probed_at: new Date().toISOString(),
    tools,
    capabilities: capFlags,
  };
}

/**
 * Derive `McpCapabilities` from a live probe result (list of tool names).
 * Uses heuristic detection for any platform, with registry baseline as fallback.
 *
 * @param platform - Platform identifier (optional, for registry baseline).
 * @param probedTools - Tool names returned by the MCP server's `list_tools`.
 * @returns Final `McpCapabilities` with the live probe results.
 */
export function capabilitiesFromProbe(
  platform: string,
  probedTools: string[],
): McpCapabilities {
  // First, use heuristic detection (works for any MCP server)
  const heuristicCaps = detectCapabilitiesHeuristic(probedTools);

  // If platform is in registry, merge with baseline for known tool mappings
  const baseline = getRegistryEntry(platform);
  if (baseline) {
    const toolSet = new Set(probedTools);
    for (const [cap, toolName] of Object.entries(baseline.capabilities) as [McpCapability, string | null][]) {
      if (toolName && toolSet.has(toolName)) {
        heuristicCaps[cap] = true;
      }
    }
  }

  // Determine channel: MCP if minimum requirements met, else CLI fallback
  const channel: 'mcp' | 'cli' = meetsMinimumRequirements(heuristicCaps) ? 'mcp' : 'cli';

  return {
    channel,
    probed_at: new Date().toISOString(),
    tools: probedTools,
    capabilities: heuristicCaps,
  };
}

/**
 * Format a capability summary for user-facing output.
 */
export function formatCapabilitySummary(caps: McpCapabilities): string {
  const labels: Record<McpCapability, string> = {
    create: 'create',
    update: 'update',
    search: 'search',
    read: 'read',
    comment: 'comment',
  };
  const parts = (Object.entries(labels) as [McpCapability, string][]).map(([cap, label]) => {
    const available = caps.capabilities[cap];
    const suffix = !available ? ' (CLI fallback)' : '';
    return `${label} ${available ? '✓' : '✗'}${suffix}`;
  });
  return `MCP capabilities: ${parts.join(' | ')}`;
}

/**
 * Generate a user-friendly message for unsupported platforms.
 */
export function formatUnsupportedMessage(platform: string, caps: McpCapabilities): string {
  const missing = getMissingCapabilities(caps.capabilities);

  if (missing.length > 0 && caps.channel === 'mcp') {
    return `⚠ Platform '${platform}' MCP capabilities insufficient:

Detected capabilities: ${formatCapabilitySummary(caps)}
Missing required capabilities: ${missing.join(', ')}

issuer-sync requires at least 'create' + 'read' capabilities.

Suggestions:
1. Check your MCP server configuration, ensure it exposes tools matching:
   - create + issue/workitem/task (e.g., create_issue, create_work_item)
   - get/read + issue/workitem/task (e.g., get_issue, read_work_item)
2. Or wait for API adapter support (issuer push CLI fallback)
3. Or develop a REST adapter and contribute to issuer`;
  }

  if (!hasApiAdapter(platform) && caps.channel === 'cli') {
    return `⚠ Platform '${platform}' not supported:

- No MCP server detected or capabilities insufficient
- No API adapter registered

Options:
1. Configure MCP server (recommended, zero-code integration):
   - MCP server must expose 'create' + 'read' capabilities
   - Tool naming convention: action + object (e.g., create_issue)
   - See: https://agentskills.io for MCP server development guide
   
2. Wait for official API adapter support

3. Develop REST adapter and contribute:
   - Reference: src/adapter/github/index.ts
   - Implement Adapter interface: createIssue, updateIssue, listRemote`;
  }

  return '';
}
