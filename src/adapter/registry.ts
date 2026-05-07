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
  /** Maps each capability to the tool name that provides it (null = not available). */
  capabilities: CapabilityToolMap;
  /** Additional tool names not mapped to core capabilities but useful for Issuer. */
  extraTools: string[];
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
    platform: 'yunxiao',
    mcpPackage: 'alibabacloud-devops-mcp-server',
    capabilities: {
      create: 'create_work_item',
      update: null, // Yunxiao MCP currently lacks update_work_item
      search: 'search_workitems',
      read: 'get_work_item',
      comment: null, // Yunxiao MCP currently lacks comment support
    },
    extraTools: [
      'get_work_item_types',
      'search_projects',
      'get_project',
      'get_current_organization_Info',
    ],
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
 * Merges with the registry baseline to fill in capability mappings.
 *
 * @param platform - Platform identifier.
 * @param probedTools - Tool names returned by the MCP server's `list_tools`.
 * @returns Final `McpCapabilities` with the live probe results.
 */
export function capabilitiesFromProbe(
  platform: string,
  probedTools: string[],
): McpCapabilities {
  const baseline = getRegistryEntry(platform);
  const toolSet = new Set(probedTools);

  const capFlags: Record<McpCapability, boolean> = {
    create: false,
    update: false,
    search: false,
    read: false,
    comment: false,
  };

  // If we have a registry baseline, use it to map tool names → capabilities
  if (baseline) {
    for (const [cap, toolName] of Object.entries(baseline.capabilities) as [McpCapability, string | null][]) {
      if (toolName && toolSet.has(toolName)) {
        capFlags[cap] = true;
      }
    }
  }

  // For platforms not in the registry, do a best-effort keyword match
  if (!baseline) {
    for (const tool of probedTools) {
      const lower = tool.toLowerCase();
      if (lower.includes('create') && (lower.includes('issue') || lower.includes('work_item') || lower.includes('workitem'))) {
        capFlags.create = true;
      }
      if (lower.includes('update') && (lower.includes('issue') || lower.includes('work_item') || lower.includes('workitem'))) {
        capFlags.update = true;
      }
      if (lower.includes('search') || lower.includes('list') && (lower.includes('issue') || lower.includes('work_item') || lower.includes('workitem'))) {
        capFlags.search = true;
      }
      if (lower.includes('get') && (lower.includes('issue') || lower.includes('work_item') || lower.includes('workitem'))) {
        capFlags.read = true;
      }
      if (lower.includes('comment') && (lower.includes('issue') || lower.includes('work_item') || lower.includes('workitem'))) {
        capFlags.comment = true;
      }
    }
  }

  // Determine channel: if at least create or update is available, use MCP; otherwise CLI
  const channel: 'mcp' | 'cli' = capFlags.create || capFlags.update ? 'mcp' : 'cli';

  return {
    channel,
    probed_at: new Date().toISOString(),
    tools: probedTools,
    capabilities: capFlags,
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
