import { describe, it, expect } from 'vitest';
import {
  CLI_ADAPTER_PLATFORMS,
  TEMPLATE_PLATFORMS,
  hasApiAdapter,
  hasBreakdownTemplate,
  formatCapabilitySummary,
  determineChannel,
  type McpCapabilities,
} from '../../src/adapter/registry.js';

describe('CLI_ADAPTER_PLATFORMS', () => {
  it('contains github, gitlab, yunxiao and pingcode', () => {
    expect(CLI_ADAPTER_PLATFORMS).toContain('github');
    expect(CLI_ADAPTER_PLATFORMS).toContain('gitlab');
    expect(CLI_ADAPTER_PLATFORMS).toContain('yunxiao');
    expect(CLI_ADAPTER_PLATFORMS).toContain('pingcode');
  });

  it('does NOT contain jira (MCP-only, no CLI adapter)', () => {
    expect(CLI_ADAPTER_PLATFORMS).not.toContain('jira');
  });
});

describe('hasApiAdapter', () => {
  it('returns true for github', () => {
    expect(hasApiAdapter('github')).toBe(true);
  });

  it('returns true for gitlab', () => {
    expect(hasApiAdapter('gitlab')).toBe(true);
  });

  it('returns true for yunxiao', () => {
    expect(hasApiAdapter('yunxiao')).toBe(true);
  });

  it('returns false for jira (MCP-only) and unknown platforms', () => {
    expect(hasApiAdapter('bitbucket')).toBe(false);
    expect(hasApiAdapter('jira')).toBe(false);
    expect(hasApiAdapter('custom')).toBe(false);
  });
});

describe('TEMPLATE_PLATFORMS + hasBreakdownTemplate', () => {
  it('TEMPLATE_PLATFORMS is a superset of CLI_ADAPTER_PLATFORMS', () => {
    for (const p of CLI_ADAPTER_PLATFORMS) {
      expect(TEMPLATE_PLATFORMS).toContain(p);
    }
  });

  it('jira has a built-in template but no CLI adapter', () => {
    expect(hasBreakdownTemplate('jira')).toBe(true);
    expect(hasApiAdapter('jira')).toBe(false);
  });

  it('github, gitlab, yunxiao, pingcode have both adapter and template', () => {
    for (const p of ['github', 'gitlab', 'yunxiao', 'pingcode']) {
      expect(hasApiAdapter(p)).toBe(true);
      expect(hasBreakdownTemplate(p)).toBe(true);
    }
  });

  it('unknown platforms have neither adapter nor template', () => {
    expect(hasApiAdapter('custom-pm')).toBe(false);
    expect(hasBreakdownTemplate('custom-pm')).toBe(false);
  });
});

describe('determineChannel', () => {
  it('returns mcp when minimum requirements met', () => {
    const caps = { create: true, update: false, search: false, read: true, comment: false };
    expect(determineChannel(caps, true)).toBe('mcp');
    expect(determineChannel(caps, false)).toBe('mcp');
  });

  it('returns cli when MCP insufficient but CLI adapter available', () => {
    const caps = { create: false, update: false, search: true, read: true, comment: false };
    expect(determineChannel(caps, true)).toBe('cli');
  });

  it('returns unsupported when both MCP and CLI unavailable', () => {
    const caps = { create: false, update: false, search: false, read: false, comment: false };
    expect(determineChannel(caps, false)).toBe('unsupported');
  });
});

describe('formatCapabilitySummary', () => {
  it('formats full capabilities', () => {
    const caps: McpCapabilities = {
      channel: 'mcp',
      probed_at: '2026-05-07T00:00:00Z',
      tools: ['create_issue'],
      capabilities: { create: true, update: true, search: true, read: true },
    };
    const summary = formatCapabilitySummary(caps);
    expect(summary).toContain('create ✓');
    expect(summary).toContain('update ✓');
    expect(summary).toContain('search ✓');
    expect(summary).toContain('read ✓');
  });

  it('formats partial capabilities', () => {
    const caps: McpCapabilities = {
      channel: 'cli',
      probed_at: '2026-05-07T00:00:00Z',
      tools: ['create_work_item'],
      capabilities: { create: true, update: false, search: true, read: true },
    };
    const summary = formatCapabilitySummary(caps);
    expect(summary).toContain('create ✓');
    expect(summary).toContain('update ✗');
    expect(summary).toContain('search ✓');
    expect(summary).toContain('read ✓');
  });
});
