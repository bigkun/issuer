/**
 * PingCode Token Helper
 * 
 * Utility to fetch access_token using client_id and client_secret.
 * Used during initial setup (issuer init or issuer auth).
 */

export interface PingCodeTokenOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof globalThis.fetch | ((...args: any[]) => Promise<any>);
}

export interface PingCodeTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Fetch access_token from PingCode OAuth endpoint
 */
export async function fetchPingCodeToken(
  opts: PingCodeTokenOptions,
): Promise<PingCodeTokenResponse> {
  const httpFetch = opts.fetch ?? globalThis.fetch;

  const url = new URL('https://open.pingcode.com/v1/auth/token');
  url.searchParams.set('grant_type', 'client_credentials');
  url.searchParams.set('client_id', opts.clientId);
  url.searchParams.set('client_secret', opts.clientSecret);

  const res = await httpFetch(url.toString(), {
    method: 'GET',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch token: ${res.status} ${res.statusText}\n${body}`,
    );
  }

  return res.json() as Promise<PingCodeTokenResponse>;
}
