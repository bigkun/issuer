import type { Adapter, RemoteIssue } from '../adapter/interface.js';

export async function runListRemote(opts: { adapter: Adapter }): Promise<RemoteIssue[]> {
  return opts.adapter.listRemote();
}
