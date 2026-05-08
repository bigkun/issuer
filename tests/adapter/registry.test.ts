import { describe, it, expect } from 'vitest';
import {
  ADAPTER_REGISTRY,
  getRegistryEntry,
  capabilitiesFromRegistry,
  capabilitiesFromProbeWithRegistry,
  formatCapabilitySummary,
  type McpCapabilities,
  type AdapterRegistryEntry,
} from '../../src/adapter/registry.js';

describe('ADAPTER_REGISTRY', () => {
  it('contains github, gitlab and yunxiao entries', () => {
    const platforms = ADAPTER_REGISTRY.map((e: AdapterRegistryEntry) => e.platform);
    expect(platforms).toContain('github');
    expect(platforms).toContain('gitlab');
    expect(platforms).toContain('yunxiao');
  });

  it('each entry has all 5 capability keys', () => {
    for (const entry of ADAPTER_REGISTRY) {
      const caps = Object.keys(entry.capabilities);
      expect(caps).toContain('create');
      expect(caps).toContain('update');
      expect(caps).toContain('search');
      expect(caps).toContain('read');
      expect(caps).toContain('comment');
    }
  });
});

describe('getRegistryEntry', () => {
  it('returns github entry', () => {
    const entry = getRegistryEntry('github');
    expect(entry).toBeDefined();
    expect(entry!.mcpPackage).toBe('github/github-mcp-server');
    expect(entry!.capabilities.create).toBe('create_issue');
    expect(entry!.capabilities.update).toBe('update_issue');
  });

  it('returns gitlab entry', () => {
    const entry = getRegistryEntry('gitlab');
    expect(entry).toBeDefined();
    expect(entry!.mcpPackage).toContain('gitlab');
    expect(entry!.capabilities.create).toBe('create_issue');
    expect(entry!.capabilities.update).toBeNull();
    expect(entry!.capabilities.comment).toBe('create_workitem_note');
  });

  it('returns yunxiao entry', () => {
    const entry = getRegistryEntry('yunxiao');
    expect(entry).toBeDefined();
    expect(entry!.mcpPackage).toBe('alibabacloud-devops-mcp-server');
    expect(entry!.capabilities.create).toBe('create_work_item');
    expect(entry!.capabilities.update).toBeNull();
    expect(entry!.capabilities.comment).toBeNull();
  });

  it('returns undefined for unknown platform', () => {
    expect(getRegistryEntry('bitbucket')).toBeUndefined();
  });
});

describe('capabilitiesFromRegistry', () => {
  it('derives full capabilities for github', () => {
    const entry = getRegistryEntry('github')!;
    const caps = capabilitiesFromRegistry(entry);
    expect(caps.channel).toBe('mcp');
    expect(caps.capabilities.create).toBe(true);
    expect(caps.capabilities.update).toBe(true);
    expect(caps.capabilities.search).toBe(true);
    expect(caps.capabilities.read).toBe(true);
    expect(caps.capabilities.comment).toBe(true);
    expect(caps.tools).toContain('create_issue');
    expect(caps.tools).toContain('update_issue');
    expect(caps.probed_at).toBeTruthy();
  });

  it('derives partial capabilities for gitlab', () => {
    const entry = getRegistryEntry('gitlab')!;
    const caps = capabilitiesFromRegistry(entry);
    expect(caps.channel).toBe('mcp');
    expect(caps.capabilities.create).toBe(true);
    expect(caps.capabilities.update).toBe(false);
    expect(caps.capabilities.search).toBe(true);
    expect(caps.capabilities.read).toBe(true);
    expect(caps.capabilities.comment).toBe(true);
    expect(caps.tools).toContain('create_issue');
    expect(caps.tools).toContain('get_issue');
  });

  it('derives partial capabilities for yunxiao', () => {
    const entry = getRegistryEntry('yunxiao')!;
    const caps = capabilitiesFromRegistry(entry);
    expect(caps.channel).toBe('mcp');
    expect(caps.capabilities.create).toBe(true);
    expect(caps.capabilities.update).toBe(false);
    expect(caps.capabilities.search).toBe(true);
    expect(caps.capabilities.read).toBe(true);
    expect(caps.capabilities.comment).toBe(false);
    expect(caps.tools).toContain('create_work_item');
    expect(caps.tools).not.toContain('update_work_item');
  });
});

describe('capabilitiesFromProbeWithRegistry', () => {
  it('matches probed tools to registry baseline for github', () => {
    const caps = capabilitiesFromProbeWithRegistry('github', [
      'create_issue',
      'update_issue',
      'search_issues',
      'get_issue',
      'add_issue_comment',
      'list_issues',
    ]);
    expect(caps.channel).toBe('mcp');
    expect(caps.capabilities).toEqual({
      create: true,
      update: true,
      search: true,
      read: true,
      comment: true,
    });
    expect(caps.tools).toHaveLength(6);
  });

  it('detects missing update for gitlab', () => {
    const caps = capabilitiesFromProbeWithRegistry('gitlab', [
      'create_issue',
      'get_issue',
      'search',
      'create_workitem_note',
      'create_merge_request',
    ]);
    expect(caps.channel).toBe('mcp');
    expect(caps.capabilities.create).toBe(true);
    expect(caps.capabilities.update).toBe(false);
    expect(caps.capabilities.comment).toBe(true);
  });

  it('detects missing update for yunxiao', () => {
    const caps = capabilitiesFromProbeWithRegistry('yunxiao', [
      'create_work_item',
      'search_workitems',
      'get_work_item',
      'get_work_item_types',
    ]);
    expect(caps.channel).toBe('mcp');
    expect(caps.capabilities.create).toBe(true);
    expect(caps.capabilities.update).toBe(false);
    expect(caps.capabilities.comment).toBe(false);
  });

  it('falls back to cli when no create or read', () => {
    const caps = capabilitiesFromProbeWithRegistry('yunxiao', [
      'search_workitems',
      'get_work_item',
    ]);
    expect(caps.channel).toBe('cli');
    expect(caps.capabilities.create).toBe(false);
    expect(caps.capabilities.update).toBe(false);
  });

  it('does heuristic match for unknown platforms', () => {
    const caps = capabilitiesFromProbeWithRegistry('jira', [
      'create_issue',
      'update_issue',
      'search_issues',
      'get_issue',
      'add_comment',
    ]);
    expect(caps.capabilities.create).toBe(true);
    expect(caps.capabilities.update).toBe(true);
    expect(caps.capabilities.search).toBe(true);
    expect(caps.capabilities.read).toBe(true);
    // 'add_comment' doesn't contain both 'comment' and 'issue/workitem'
    // so this may be false depending on heuristic
  });

  it('sets cli channel for unknown platform with no matching tools', () => {
    const caps = capabilitiesFromProbeWithRegistry('custom', ['some_unrelated_tool']);
    expect(caps.channel).toBe('cli');
  });
});

describe('formatCapabilitySummary', () => {
  it('formats full capabilities', () => {
    const caps: McpCapabilities = {
      channel: 'mcp',
      probed_at: '2026-05-07T00:00:00Z',
      tools: ['create_issue'],
      capabilities: { create: true, update: true, search: true, read: true, comment: true },
    };
    const summary = formatCapabilitySummary(caps);
    expect(summary).toContain('create ✓');
    expect(summary).toContain('update ✓');
    expect(summary).toContain('comment ✓');
  });

  it('formats partial capabilities with CLI fallback markers', () => {
    const caps: McpCapabilities = {
      channel: 'mcp',
      probed_at: '2026-05-07T00:00:00Z',
      tools: ['create_work_item'],
      capabilities: { create: true, update: false, search: true, read: true, comment: false },
    };
    const summary = formatCapabilitySummary(caps);
    expect(summary).toContain('create ✓');
    expect(summary).toContain('update ✗ (CLI fallback)');
    expect(summary).toContain('comment ✗ (CLI fallback)');
  });
});
