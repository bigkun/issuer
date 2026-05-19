/**
 * Adapter Registry — CLI adapter availability only.
 *
 * This registry ships with `@issuer/cli` and declares:
 * Which platforms have built-in CLI adapters (REST API implementations)
 *
 * For MCP capability detection, use mcp-detect.ts for heuristic detection.
 */

// ---------------------------------------------------------------------------
// CLI adapter platforms
// ---------------------------------------------------------------------------

/** Platforms with built-in CLI adapters (REST API implementations) */
export const CLI_ADAPTER_PLATFORMS: ReadonlyArray<string> = ['github', 'gitlab', 'yunxiao', 'pingcode'];

/**
 * Check if a platform has a built-in CLI adapter.
 * Used for channel selection when MCP is unavailable.
 */
export function hasApiAdapter(platform: string): boolean {
  return CLI_ADAPTER_PLATFORMS.includes(platform);
}

// ---------------------------------------------------------------------------
// Breakdown template platforms
// ---------------------------------------------------------------------------

/**
 * Platforms that have a dedicated built-in breakdown template
 * under skills/issuer-breakdown/templates/<platform>.md.
 *
 * A platform can be in this list WITHOUT having a CLI adapter (e.g. jira).
 * When a platform is in this list, `issuer init` will NOT generate a generic
 * .issuer/templates/breakdown.md fallback — the skill resolves the built-in
 * template automatically at runtime.
 */
export const TEMPLATE_PLATFORMS: ReadonlyArray<string> = [
  // Platforms with CLI adapters — all have dedicated templates
  'github',
  'gitlab',
  'yunxiao',
  'pingcode',
  // MCP-only platforms with dedicated templates
  'jira',
];

/**
 * Check if a platform has a built-in breakdown template.
 * When true, issuer init skips writing the generic fallback template.
 */
export function hasBreakdownTemplate(platform: string): boolean {
  return TEMPLATE_PLATFORMS.includes(platform);
}

// ---------------------------------------------------------------------------
// Re-export from mcp-detect for convenience
// ---------------------------------------------------------------------------

export type {
  McpCapability,
  McpCapabilities,
  SyncChannel,
} from './mcp-detect.js';

export {
  detectCapabilitiesHeuristic,
  meetsMinimumRequirements,
  MINIMUM_CAPABILITIES,
  getMissingCapabilities,
  capabilitiesFromProbe,
  formatCapabilitySummary,
  formatUnsupportedPlatformMessage,
  determineChannel,
} from './mcp-detect.js';