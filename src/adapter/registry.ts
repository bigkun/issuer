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