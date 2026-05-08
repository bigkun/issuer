import { describe, it, expect } from 'vitest';
import {
  detectCapabilitiesHeuristic,
  meetsMinimumRequirements,
  getMissingCapabilities,
  capabilitiesFromProbe,
  hasApiAdapter,
  MINIMUM_CAPABILITIES,
} from '../../src/adapter/registry.js';

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
    expect(caps.update).toBe(false); // no update tool
    expect(caps.comment).toBe(false); // no comment tool
  });

  it('detects capabilities from custom MCP with non-standard names', () => {
    const tools = ['myPM_create_ticket', 'myPM_find_tickets', 'myPM_show_ticket', 'myPM_reply_ticket'];
    const caps = detectCapabilitiesHeuristic(tools);

    expect(caps.create).toBe(true); // 'create' + 'ticket'
    expect(caps.search).toBe(true); // 'find' + 'tickets'
    expect(caps.read).toBe(true); // 'show' + 'ticket'
    expect(caps.comment).toBe(true); // 'reply' + 'ticket'
  });

  it('detects capabilities from partial tool names', () => {
    const tools = ['add_new_task', 'list_all_items', 'fetch_item'];
    const caps = detectCapabilitiesHeuristic(tools);

    expect(caps.create).toBe(true); // 'add' + 'new' + 'task' → 'add' action, 'task' object
    expect(caps.search).toBe(true); // 'list' + 'items' → 'list' action, 'items' object
    expect(caps.read).toBe(true); // 'fetch' + 'item' → 'fetch' action, 'item' object
  });

  it('returns all false for unrelated tools', () => {
    const tools = ['create_repository', 'list_branches', 'get_commit'];
    const caps = detectCapabilitiesHeuristic(tools);

    expect(caps.create).toBe(false); // 'repository' is not issue/work/task
    expect(caps.search).toBe(false); // 'branches' is not issue/work/task
    expect(caps.read).toBe(false); // 'commit' is not issue/work/task
  });

  it('handles empty tool list', () => {
    const caps = detectCapabilitiesHeuristic([]);
    expect(caps.create).toBe(false);
    expect(caps.update).toBe(false);
    expect(caps.search).toBe(false);
    expect(caps.read).toBe(false);
    expect(caps.comment).toBe(false);
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

  it('returns false when both create and read are missing', () => {
    const caps = { create: false, update: true, search: true, read: false, comment: true };
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

  it('returns both create and read when both missing', () => {
    const caps = { create: false, update: true, search: true, read: false, comment: true };
    expect(getMissingCapabilities(caps)).toEqual(['create', 'read']);
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
  it('derives capabilities for known platform with MCP tools', () => {
    const tools = ['create_issue', 'update_issue', 'search_issues', 'get_issue', 'add_issue_comment'];
    const caps = capabilitiesFromProbe('github', tools);

    expect(caps.channel).toBe('mcp');
    expect(caps.capabilities.create).toBe(true);
    expect(caps.capabilities.read).toBe(true);
  });

  it('derives capabilities for unknown platform using heuristic', () => {
    const tools = ['custom_create_issue', 'custom_get_item'];
    const caps = capabilitiesFromProbe('my-custom-pm', tools);

    expect(caps.capabilities.create).toBe(true); // heuristic: 'create' + 'issue'
    expect(caps.capabilities.read).toBe(true); // heuristic: 'get' + 'item'
    expect(caps.channel).toBe('mcp'); // meets minimum
  });

  it('sets channel to cli when minimum requirements not met', () => {
    const tools = ['search_issues', 'list_items']; // only search, no create/read
    const caps = capabilitiesFromProbe('unknown-platform', tools);

    expect(caps.capabilities.create).toBe(false);
    expect(caps.capabilities.read).toBe(false);
    expect(caps.channel).toBe('cli'); // doesn't meet minimum
  });
});

describe('hasApiAdapter', () => {
  it('returns true for registered platforms', () => {
    expect(hasApiAdapter('github')).toBe(true);
    expect(hasApiAdapter('gitlab')).toBe(true);
    expect(hasApiAdapter('yunxiao')).toBe(true);
  });

  it('returns false for unknown platforms', () => {
    expect(hasApiAdapter('my-custom-pm')).toBe(false);
    expect(hasApiAdapter('jira')).toBe(false);
  });
});