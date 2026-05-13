/**
 * MCP Capability Detection — platform-agnostic heuristic detection.
 *
 * This module provides MCP-first capability detection that works for ANY MCP server,
 * regardless of platform. No prior knowledge of the platform is required.
 *
 * Design principle:
 * - Heuristic keyword matching (action + object) → capability detection
 * - Minimum requirements check (create + read) → MCP channel decision
 * - CLI adapter availability check → CLI channel decision
 * - Works for unknown platforms without registry entry
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The five capability groups that issuer-sync depends on. */
export type McpCapability = 'create' | 'update' | 'search' | 'read' | 'comment';

/** Sync channel type: MCP, CLI, or unsupported */
export type SyncChannel = 'mcp' | 'cli' | 'unsupported';

/** Shape of the `mcp_capabilities` section in `.issuer/config.yml`. */
export interface McpCapabilities {
  /** Which channel to use: `mcp`, `cli`, or `unsupported`. */
  channel: SyncChannel;
  /** ISO 8601 timestamp of when the probe was run. */
  probed_at: string;
  /** Actual tool names returned by the MCP server. */
  tools: string[];
  /** Derived capability flags — true if the tool is available. */
  capabilities: Record<McpCapability, boolean>;
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
// Channel determination
// ---------------------------------------------------------------------------

/**
 * Determine sync channel based on MCP capabilities and CLI adapter availability.
 *
 * Priority: MCP-first → CLI adapter → unsupported
 *
 * @param mcpCaps - MCP capability flags from heuristic detection.
 * @param cliAdapterAvailable - Whether CLI adapter exists for the platform (from hasApiAdapter).
 * @returns Sync channel: 'mcp', 'cli', or 'unsupported'.
 */
export function determineChannel(
  mcpCaps: Record<McpCapability, boolean>,
  cliAdapterAvailable: boolean,
): SyncChannel {
  // 1. MCP available (create + read) → use MCP
  if (meetsMinimumRequirements(mcpCaps)) {
    return 'mcp';
  }

  // 2. MCP unavailable → check CLI adapter
  if (cliAdapterAvailable) {
    return 'cli';
  }

  // 3. Neither MCP nor CLI → unsupported
  return 'unsupported';
}

// ---------------------------------------------------------------------------
// Capability derivation
// ---------------------------------------------------------------------------

/**
 * Derive `McpCapabilities` from a live probe result (list of tool names).
 * Pure heuristic detection — works for any platform.
 *
 * @param probedTools - Tool names returned by the MCP server.
 * @param cliAdapterAvailable - Whether CLI adapter exists for the platform.
 * @returns Final `McpCapabilities` with the probe results.
 */
export function capabilitiesFromProbe(
  probedTools: string[],
  cliAdapterAvailable: boolean,
): McpCapabilities {
  const heuristicCaps = detectCapabilitiesHeuristic(probedTools);
  const channel = determineChannel(heuristicCaps, cliAdapterAvailable);

  return {
    channel,
    probed_at: new Date().toISOString(),
    tools: probedTools,
    capabilities: heuristicCaps,
  };
}

// ---------------------------------------------------------------------------
// User-facing output
// ---------------------------------------------------------------------------

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
    return `${label} ${available ? '✓' : '✗'}`;
  });
  return `MCP capabilities: ${parts.join(' | ')}`;
}

/**
 * Generate a user-friendly message for unsupported platform (no MCP, no CLI adapter).
 */
export function formatUnsupportedPlatformMessage(platform: string): string {
  return `⚠ Platform '${platform}' sync unavailable:

- No MCP server detected or capabilities insufficient
- No CLI adapter registered for this platform

Options:
1. Install MCP server for '${platform}' (recommended)
   - MCP server must expose 'create' + 'read' capabilities
   - Tool naming convention: action + object (e.g., create_issue)
2. Request CLI adapter support — open an issue at:
   https://github.com/bigkun/issuer/issues
3. Develop custom adapter and contribute:
   - Reference: src/adapter/github/index.ts
   - Implement Adapter interface: createIssue, updateIssue, listRemote`;
}