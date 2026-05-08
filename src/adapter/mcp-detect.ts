/**
 * MCP Capability Detection — platform-agnostic heuristic detection.
 *
 * This module provides MCP-first capability detection that works for ANY MCP server,
 * regardless of platform. No prior knowledge of the platform is required.
 *
 * Design principle:
 * - Heuristic keyword matching (action + object) → capability detection
 * - Minimum requirements check (create + read) → channel decision
 * - Works for unknown platforms without registry entry
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The five capability groups that issuer-sync depends on. */
export type McpCapability = 'create' | 'update' | 'search' | 'read' | 'comment';

/** Shape of the `mcp_capabilities` section in `.issuer/config.yml`. */
export interface McpCapabilities {
  /** Which channel to use: `mcp` or `cli`. */
  channel: 'mcp' | 'cli';
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
// Capability derivation
// ---------------------------------------------------------------------------

/**
 * Derive `McpCapabilities` from a live probe result (list of tool names).
 * Pure heuristic detection — works for any platform.
 *
 * @param probedTools - Tool names returned by the MCP server.
 * @returns Final `McpCapabilities` with the probe results.
 */
export function capabilitiesFromProbe(probedTools: string[]): McpCapabilities {
  const heuristicCaps = detectCapabilitiesHeuristic(probedTools);
  const channel: 'mcp' | 'cli' = meetsMinimumRequirements(heuristicCaps) ? 'mcp' : 'cli';

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
    const suffix = !available ? ' (CLI fallback)' : '';
    return `${label} ${available ? '✓' : '✗'}${suffix}`;
  });
  return `MCP capabilities: ${parts.join(' | ')}`;
}

/**
 * Generate a user-friendly message for insufficient capabilities.
 */
export function formatInsufficientCapabilitiesMessage(platform: string, caps: McpCapabilities): string {
  const missing = getMissingCapabilities(caps.capabilities);

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

/**
 * Generate a user-friendly message for unsupported platforms (no MCP, no adapter).
 */
export function formatUnsupportedPlatformMessage(platform: string): string {
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