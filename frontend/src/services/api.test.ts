import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ApiError,
  GOOGLE_TOKEN_EXPIRED_EVENT,
  conversionsApi,
  healthApi,
  monitoringApi,
  sourcesApi,
} from './api';

interface FakeResponseInit {
  status?: number;
  ok?: boolean;
  body: unknown;
}

function fakeResponse({ status = 200, ok, body }: FakeResponseInit) {
  return {
    ok: ok ?? status < 400,
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Silence the verbose console.log in api.ts
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function lastCall(): { url: string; init: RequestInit } {
  expect(fetchMock).toHaveBeenCalled();
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
    string,
    RequestInit,
  ];
  return { url, init };
}

describe('sourcesApi', () => {
  it('GETs /sources and returns the unwrapped data', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { data: [{ id: 's1' }] } }));
    const result = await sourcesApi.getAll();
    expect(result).toEqual([{ id: 's1' }]);
    expect(lastCall().url).toContain('/sources');
  });

  it('POSTs JSON for create()', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { data: { id: 'new' } } }));
    await sourcesApi.create({
      name: 'X',
      platform: 'googledrive',
      config: {
        credentials: { clientId: 'a', clientSecret: 'b', refreshToken: 'r' },
        sourcePath: '/',
        destination: 'out',
      },
    });
    const call = lastCall();
    expect(call.init.method).toBe('POST');
    expect((call.init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(call.init.body as string)).toMatchObject({
      name: 'X',
      platform: 'googledrive',
    });
  });

  it('builds DELETE for delete()', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { data: null } }));
    await sourcesApi.delete('abc');
    const call = lastCall();
    expect(call.url).toContain('/sources/abc');
    expect(call.init.method).toBe('DELETE');
  });

  it('encodes parent_id when fetching Google Drive folders', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { data: [{ id: 'f' }] } }));
    await sourcesApi.getGoogleDriveFolders('My Folder/Sub', {
      clientId: 'a',
      clientSecret: 'b',
      refreshToken: 'r',
    });
    expect(lastCall().url).toContain(encodeURIComponent('My Folder/Sub'));
  });
});

describe('conversionsApi.getAll', () => {
  it('passes pagination and status as query params', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ body: { data: [], pagination: { page: 2, limit: 5, total: 0, pages: 0 } } }),
    );
    await conversionsApi.getAll(2, 5, 'completed');
    const call = lastCall();
    expect(call.url).toContain('page=2');
    expect(call.url).toContain('limit=5');
    expect(call.url).toContain('status=completed');
  });

  it('omits status when not provided', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ body: { data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } }),
    );
    await conversionsApi.getAll();
    expect(lastCall().url).not.toContain('status=');
  });
});

describe('monitoringApi', () => {
  it('POSTs to /monitoring/start', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { data: null } }));
    await monitoringApi.start();
    const call = lastCall();
    expect(call.url).toContain('/monitoring/start');
    expect(call.init.method).toBe('POST');
  });

  it('appends sourceId when fetching logs', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { data: [] } }));
    await monitoringApi.getLogs('src-1', 25);
    const call = lastCall();
    expect(call.url).toContain('limit=25');
    expect(call.url).toContain('sourceId=src-1');
  });
});

describe('healthApi.check', () => {
  it('returns the raw response (no unwrapping)', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ body: { name: 'x', status: 'ok', timestamp: 'now' } }),
    );
    const result = await healthApi.check();
    expect(result.status).toBe('ok');
  });
});

describe('error handling', () => {
  it('throws ApiError with status and payload on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ status: 404, body: { message: 'not found', code: 'NOT_FOUND' } }),
    );

    await expect(sourcesApi.getById('missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'not found',
    });
  });

  it('dispatches a custom event when receiving a TOKEN_EXPIRED 401', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ status: 401, body: { message: 'expired', code: 'TOKEN_EXPIRED' } }),
    );
    const handler = vi.fn();
    window.addEventListener(GOOGLE_TOKEN_EXPIRED_EVENT, handler);

    await expect(sourcesApi.getById('x')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalled();

    window.removeEventListener(GOOGLE_TOKEN_EXPIRED_EVENT, handler);
  });

  it('wraps network failures into an ApiError with status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));

    try {
      await sourcesApi.getAll();
      throw new Error('should not reach');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(0);
    }
  });
});
