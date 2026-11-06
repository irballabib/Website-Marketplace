import { describe, expect, it, vi } from 'vitest';

import { PosApiClient } from './pos-api';

const session = {
  accessToken: 'test-token-123',
  expiresIn: 900,
  user: {
    id: 'u1',
    tenantId: 't1',
    email: 'kasir@example.com',
    fullName: 'Kasir',
    roles: ['kasir'],
    permissions: ['pos.sale.create'],
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createFetcher(...responses: Response[]) {
  const fetcher = vi.fn<typeof fetch>();
  responses.forEach((response) => fetcher.mockResolvedValueOnce(response));
  return fetcher;
}

function requestUrl(input: RequestInfo | URL | undefined): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input?.url ?? '';
}

describe('PosApiClient', () => {
  it('logs in and sends authenticated requests with the access token', async () => {
    const fetcher = createFetcher(
      jsonResponse(session),
      jsonResponse([{ id: 'loc-1', code: 'ST-01', name: 'Toko', type: 'STORE' }])
    );
    const client = new PosApiClient(fetcher);

    const result = await client.login('kasir@example.com', 'password123');
    const locations = await client.getLocations();

    expect(result.accessToken).toBe(session.accessToken);
    expect(locations).toHaveLength(1);
    const loginCall = fetcher.mock.calls[0];
    expect(requestUrl(loginCall?.[0])).toContain('/api/v1/auth/login');
    expect(loginCall?.[1]?.credentials).toBe('include');
    expect(new Headers(loginCall?.[1]?.headers).get('Content-Type')).toBe('application/json');

    const locationsCall = fetcher.mock.calls[1];
    expect(requestUrl(locationsCall?.[0])).toContain('/api/v1/pos/locations');
    expect(new Headers(locationsCall?.[1]?.headers).get('Authorization')).toBe(
      `Bearer ${session.accessToken}`
    );
  });

  it('restores a session through the httpOnly refresh cookie', async () => {
    const fetcher = createFetcher(jsonResponse(session));
    const client = new PosApiClient(fetcher);

    const restored = await client.restore();

    expect(restored).toEqual(session);
    expect(requestUrl(fetcher.mock.calls[0]?.[0])).toContain('/api/v1/auth/refresh');
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('include');
  });

  it('returns null when the refresh cookie is missing', async () => {
    const fetcher = createFetcher(
      jsonResponse({ code: 'AUTH_REFRESH_MISSING', message: 'No refresh token' }, 401)
    );
    const client = new PosApiClient(fetcher);

    await expect(client.restore()).resolves.toBeNull();
  });

  it('refreshes once and retries an expired access token', async () => {
    const fetcher = createFetcher(
      jsonResponse(session),
      jsonResponse({ code: 'AUTH_INVALID_TOKEN', message: 'Expired' }, 401),
      jsonResponse({ ...session, accessToken: 'refreshed-token' }),
      jsonResponse([{ id: 'loc-1', code: 'ST-01', name: 'Toko', type: 'STORE' }])
    );
    const client = new PosApiClient(fetcher);

    await client.login('kasir@example.com', 'password123');
    const locations = await client.getLocations();

    expect(locations).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer refreshed-token'
    );
  });

  it('sends location ids as query parameters for the catalog and shift routes', async () => {
    const fetcher = createFetcher(jsonResponse(session), jsonResponse([]), jsonResponse(null));
    const client = new PosApiClient(fetcher);

    await client.login('kasir@example.com', 'password123');
    await client.getCatalog('loc with spaces');
    await client.getCurrentShift('loc-1');

    expect(requestUrl(fetcher.mock.calls[1]?.[0])).toContain(
      '/api/v1/pos/catalog?locationId=loc+with+spaces'
    );
    expect(requestUrl(fetcher.mock.calls[2]?.[0])).toContain(
      '/api/v1/pos/shifts/current?locationId=loc-1'
    );
  });
});
