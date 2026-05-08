import { describe, it, expect } from 'vitest';
import {
  detectCapabilitiesHeuristic,
  meetsMinimumRequirements,
  getMissingCapabilities,
  capabilitiesFromProbe,
  MINIMUM_CAPABILITIES,
  formatCapabilitySummary,
  formatInsufficientCapabilitiesMessage,
  formatUnsupportedPlatformMessage,
} from '../../src/adapter/mcp-detect.js';

describe('detectCapabilitiesHeuristic', () => {
  it('detects all capabilities from standard GitHub MCP tools', () => {
    const tools = ['create_issue', 'update_issue', 'search_issues', 'get_issue', 'add_issue_comment'];
    const caps = detectCapabilitiesHeuristic(tools);

    expect(caps.create).toBe(true);
    expect(caps.update).toBe(true);
    expect(caps.search).toBe(true);
    expect(caps.read).toBe(true);
    expect(caps.comment).toBe(true);
  });

  it('detects capabilities from Yunxiao MCP tools', () => {
    const tools = ['create_work_item', 'search_workitems', 'get_work_item'];
    const caps = detectCapabilitiesHeuristic(tools);

    expect(caps.create).toBe(true);
    expect(caps.search).toBe(true);
    expect(caps.read).toBe(true);
    expect(caps.update).toBe(false);
    expect(caps.comment).toBe(false);
  });

  it('detects capabilities from custom MCP with non-standard names', () => {
    const tools = ['myPM_create_ticket', 'myPM_find_tickets', 'myPM_show_ticket', 'myPM_reply_ticket'];
    const caps = detectCapabilitiesHeuristic(tools);

    expect(caps.create).toBe(true);
    expect(caps.search).toBe(true);
    expect(caps.read).toBe(true);
    expect(caps.comment).toBe(true);
  });

  it('returns all false for unrelated tools', () => {
    const tools = ['create_repository', 'list_branches', 'get_commit'];
    const caps = detectCapabilitiesHeuristic(tools);

    expect(caps.create).toBe(false);
    expect(caps.search).toBe(false);
    expect(caps.read).toBe(false);
  });

  it('handles empty tool list', () => {
    const caps = detectCapabilitiesHeuristic([]);
    expect(caps.create).toBe(false);
    expect(caps.read).toBe(false);
  });
});

describe('meetsMinimumRequirements', () => {
  it('returns true when create and read are available', () => {
    const caps = { create: true, update: false, search: true, read: true, comment: false };
    expect(meetsMinimumRequirements(caps)).toBe(true);
  });

  it('returns false when create is missing', () => {
    const caps = { create: false, update: true, search: true, read: true, comment: true };
    expect(meetsMinimumRequirements(caps)).toBe(false);
  });

  it('returns false when read is missing', () => {
    const caps = { create: true, update: true, search: true, read: false, comment: true };
    expect(meetsMinimumRequirements(caps)).toBe(false);
  });
});

describe('getMissingCapabilities', () => {
  it('returns empty array when all required capabilities present', () => {
    const caps = { create: true, update: false, search: false, read: true, comment: false };
    expect(getMissingCapabilities(caps)).toEqual([]);
  });

  it('returns create when create is missing', () => {
    const caps = { create: false, update: true, search: true, read: true, comment: true };
    expect(getMissingCapabilities(caps)).toEqual(['create']);
  });

  it('returns read when read is missing', () => {
    const caps = { create: true, update: true, search: true, read: false, comment: true };
    expect(getMissingCapabilities(caps)).toEqual(['read']);
  });
});

describe('MINIMUM_CAPABILITIES', () => {
  it('contains create and read', () => {
    expect(MINIMUM_CAPABILITIES).toContain('create');
    expect(MINIMUM_CAPABILITIES).toContain('read');
    expect(MINIMUM_CAPABILITIES.length).toBe(2);
  });
});

describe('capabilitiesFromProbe', () => {
  it('derives capabilities with mcp channel when minimum met', () => {
    const tools = ['create_issue', 'get_issue'];
    const caps = capabilitiesFromProbe(tools);

    expect(caps.channel).toBe('mcp');
    expect(caps.capabilities.create).toBe(true);
    expect(caps.capabilities.read).toBe(true);
  });

  it('derives capabilities with cli channel when minimum not met', () => {
    const tools = ['search_issues'];
    const caps = capabilitiesFromProbe(tools);

    expect(caps.channel).toBe('cli');
    expect(caps.capabilities.create).toBe(false);
    expect(caps.capabilities.read).toBe(false);
  });

  it('includes probed_at timestamp', () => {
    const tools = ['create_issue'];
    const caps = capabilitiesFromProbe(tools);

    expect(caps.probed_at).toBeDefined();
    expect(new Date(caps.probed_at).toISOString()).toBe(caps.probed_at);
  });

  it('includes all probed tools in tools array', () => {
    const tools = ['create_issue', 'get_issue', 'some_other_tool'];
    const caps = capabilitiesFromProbe(tools);

    expect(caps.tools).toEqual(tools);
  });
});

describe('formatCapabilitySummary', () => {
  it('formats capability summary with checkmarks', () => {
    const caps = {
      channel: 'mcp' as const,
      probed_at: '2026-05-07T00:00:00Z',
      tools: ['create_issue', 'get_issue'],
      capabilities: { create: true, update: false, search: false, read: true, comment: false },
    };

    const summary = formatCapabilitySummary(caps);

    expect(summary).toContain('create ✓');
    expect(summary).toContain('read ✓');
    expect(summary).toContain('update ✗ (CLI fallback)');
  });
});

describe('formatInsufficientCapabilitiesMessage', () => {
  it('generates message for insufficient capabilities', () => {
    const caps = {
      channel: 'mcp' as const,
      probed_at: '2026-05-07T00:00:00Z',
      tools: ['search_issues'],
      capabilities: { create: false, update: false, search: true, read: false, comment: false },
    };

    const msg = formatInsufficientCapabilitiesMessage('myPM', caps);

    expect(msg).toContain('⚠ Platform \'myPM\' MCP capabilities insufficient');
    expect(msg).toContain('Missing required capabilities: create, read');
    expect(msg).toContain('Suggestions:');
  });
});

describe('formatUnsupportedPlatformMessage', () => {
  it('generates message for unsupported platform', () => {
    const msg = formatUnsupportedPlatformMessage('custom-pm');

    expect(msg).toContain('⚠ Platform \'custom-pm\' not supported');
    expect(msg).toContain('No MCP server detected');
    expect(msg).toContain('No API adapter registered');
    expect(msg).toContain('Options:');
    expect(msg).toContain('Configure MCP server');
  });
});