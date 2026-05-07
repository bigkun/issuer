import { describe, it, expect } from 'vitest';
import { runListRemote } from '../../src/commands/list-remote.js';
import type { Adapter, RemoteIssue } from '../../src/adapter/interface.js';

describe('runListRemote', () => {
  it('returns adapter list', async () => {
    const items: RemoteIssue[] = [
      { id: '1', title: 'a', state: 'open', url: 'u1' },
      { id: '2', title: 'b', state: 'closed', url: 'u2' },
    ];
    const adapter: Adapter = {
      name: 'github',
      async createIssue() { throw new Error(); },
      async updateIssue() { throw new Error(); },
      async listRemote() { return items; },
    };
    expect(await runListRemote({ adapter })).toEqual(items);
  });
});
