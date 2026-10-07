import { describe, expect, it, vi } from 'vitest';
import { createClient } from './client.js';
import { ElgavioError, isElgavioError } from './errors.js';
import { queryString } from './query.js';
import { SDK_VERSION } from './version.js';

interface Sent {
  url: string;
  headers: Record<string, string>;
}

const json = (
  body: unknown,
  { status = 200, headers = {} }: { status?: number; headers?: Record<string, string> } = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/** A fetch answering each call in turn, recording what was sent. */
const fakeFetch = (...answers: Response[]) => {
  const sent: Sent[] = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    sent.push({ url, headers: { ...(init?.headers as Record<string, string>) } });
    const answer = answers.shift();
    if (answer === undefined) {
      throw new Error('No answer left');
    }
    return Promise.resolve(answer);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, sent };
};

const page = (data: unknown[], pageNumber = 1, totalPages = 1) => ({
  data,
  meta: { page: pageNumber, limit: 100, total: data.length, totalPages },
});

describe('queryString', () => {
  it('writes filters, sort and fields as the delivery API reads them', () => {
    expect(
      queryString({
        locale: 'de',
        filter: {
          featured: true,
          rating: { gte: 3, lt: 5 },
          tags: { in: ['news', 'tips'] },
          publishedAt: { lt: new Date('2026-10-01T00:00:00.000Z') },
          skipped: undefined,
        },
        sort: ['-publishedAt', 'title'],
        fields: ['title', 'blocks'],
        page: 2,
        limit: 10,
      }),
    ).toBe(
      '?locale=de&filter[featured]=true&filter[rating][gte]=3&filter[rating][lt]=5' +
        '&filter[tags][in]=news,tips&filter[publishedAt][lt]=2026-10-01T00:00:00.000Z' +
        '&sort=-publishedAt,title&fields=title,blocks&page=2&limit=10',
    );
  });

  it('encodes what a URL would misread', () => {
    expect(queryString({ path: '/a b/c&d', filter: { title: 'x=y#z' } })).toBe(
      '?path=%2Fa%20b%2Fc%26d&filter[title]=x%3Dy%23z',
    );
  });

  it('is empty without parameters', () => {
    expect(queryString({})).toBe('');
  });
});

describe('createClient', () => {
  it('refuses to start without a token', () => {
    expect(() => createClient({ token: undefined })).toThrow('no token');
  });

  it('sends the token and names itself', async () => {
    const { fetch, sent } = fakeFetch(json({ locales: [], collections: [] }));
    await createClient({ token: 'elg_x', baseUrl: 'https://api.test/', fetch }).project();
    expect(sent[0]?.url).toBe('https://api.test/delivery/v1/project');
    expect(sent[0]?.headers).toMatchObject({
      Authorization: 'Bearer elg_x',
      'Elgavio-Client': `elgavio-sdk/${SDK_VERSION}`,
    });
  });

  it('defaults to the production API', async () => {
    const { fetch, sent } = fakeFetch(json({}));
    await createClient({ token: 'elg_x', fetch }).schema();
    expect(sent[0]?.url).toBe('https://api.elgavio.com/delivery/v1/schema');
  });

  it("asks for the client's language only on reads that take one", async () => {
    const { fetch, sent } = fakeFetch(
      json(page([])),
      json({ data: [], next: 1, hasMore: false, resync: true }),
      json({ data: [] }),
    );
    const client = createClient({
      token: 'elg_x',
      baseUrl: 'https://api.test',
      locale: 'de',
      fetch,
    });
    await client.entries('posts', { sort: ['title'] });
    await client.changes();
    await client.tree('pages', { locale: 'en' });
    expect(sent.map(({ url }) => url)).toEqual([
      'https://api.test/delivery/v1/collections/posts/entries?locale=de&sort=title',
      'https://api.test/delivery/v1/changes',
      'https://api.test/delivery/v1/collections/pages/tree?locale=en',
    ]);
  });

  it('revalidates with the ETag and serves the kept body on a 304', async () => {
    const body = { id: 'e1', title: 'Hello' };
    const { fetch, sent } = fakeFetch(
      json(body, { headers: { ETag: '"v1"' } }),
      new Response(null, { status: 304 }),
    );
    const client = createClient({ token: 'elg_x', fetch });
    await client.entry('e1');
    expect(await client.entry('e1')).toEqual(body);
    expect(sent[0]?.headers['If-None-Match']).toBeUndefined();
    expect(sent[1]?.headers['If-None-Match']).toBe('"v1"');
  });

  it('keeps nothing marked no-store, or without an ETag', async () => {
    const { fetch, sent } = fakeFetch(
      json({ id: 'a' }, { headers: { ETag: '"v1"', 'Cache-Control': 'no-store' } }),
      json({ id: 'a' }),
      json({ id: 'a' }),
    );
    const client = createClient({ token: 'elg_x', fetch });
    await client.entry('a');
    await client.entry('a');
    await client.entry('a');
    expect(sent.every(({ headers }) => headers['If-None-Match'] === undefined)).toBe(true);
  });

  it('throws the envelope as an ElgavioError', async () => {
    const { fetch } = fakeFetch(
      json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            reason: 'FIELD_ERRORS',
            message: 'Invalid',
            fieldErrors: [
              { field: 'sort', code: 'DELIVERY_SORT_NOT_SORTABLE', message: 'Not sortable' },
            ],
          },
        },
        { status: 400 },
      ),
    );
    const error = await createClient({ token: 'elg_x', fetch })
      .entries('posts', { sort: ['body'] })
      .catch((caught: unknown) => caught);
    expect(isElgavioError(error, 'FIELD_ERRORS')).toBe(true);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fieldErrors: [{ field: 'sort', code: 'DELIVERY_SORT_NOT_SORTABLE' }],
    });
  });

  it('names the status when the answer has no envelope', async () => {
    const { fetch } = fakeFetch(new Response('Bad gateway', { status: 502 }));
    const error = await createClient({ token: 'elg_x', fetch })
      .project()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ElgavioError);
    expect(error).toMatchObject({ status: 502, code: 'INTERNAL_SERVER_ERROR', reason: null });
  });

  it('reads every page for all()', async () => {
    const { fetch, sent } = fakeFetch(
      json(page([{ id: '1' }], 1, 2)),
      json(page([{ id: '2' }], 2, 2)),
    );
    const all = await createClient({ token: 'elg_x', fetch }).all('posts', { fields: ['title'] });
    expect(all.map(({ id }) => id)).toEqual(['1', '2']);
    expect(sent.map(({ url }) => new URL(url).search)).toEqual([
      '?fields=title&page=1&limit=100',
      '?fields=title&page=2&limit=100',
    ]);
  });

  it('resolves a path to null when nothing is there', async () => {
    const { fetch, sent } = fakeFetch(
      json({ error: { code: 'NOT_FOUND', reason: null, message: 'Not found' } }, { status: 404 }),
    );
    expect(await createClient({ token: 'elg_x', fetch }).resolve('/nope')).toBeNull();
    expect(sent[0]?.url).toBe('https://api.elgavio.com/delivery/v1/resolve?path=%2Fnope');
  });

  it("doesn't hide a refused token behind resolve's null", async () => {
    const { fetch } = fakeFetch(
      json(
        { error: { code: 'UNAUTHORIZED', reason: 'DELIVERY_TOKEN_INVALID', message: 'No' } },
        { status: 401 },
      ),
    );
    await expect(createClient({ token: 'elg_x', fetch }).resolve('/a')).rejects.toThrow('No');
  });
});

describe('draft mode and preview', () => {
  it('asks for drafts on content reads only, with the preview session, and keeps none', async () => {
    const { fetch, sent } = fakeFetch(
      json(page([]), { headers: { ETag: '"v1"', 'Cache-Control': 'no-store' } }),
      json(page([]), { headers: { 'Cache-Control': 'no-store' } }),
      json({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } }),
    );
    const client = createClient({ token: 'elg_x', fetch, draft: true, previewSession: 's.1' });

    await client.entries('posts');
    await client.entries('posts');
    await client.paths();

    expect(sent.map(({ url }) => url)).toEqual([
      'https://api.elgavio.com/delivery/v1/collections/posts/entries?draft=true',
      'https://api.elgavio.com/delivery/v1/collections/posts/entries?draft=true',
      'https://api.elgavio.com/delivery/v1/paths',
    ]);
    expect(sent[0]?.headers['Elgavio-Preview']).toBe('s.1');
    expect(sent[1]?.headers['If-None-Match']).toBeUndefined();
  });

  it('verifies a preview code', async () => {
    const answer = {
      entry: { id: 'e1', collection: 'pages', locale: 'en', path: '/about' },
      previewSession: { value: 's.1', expiresAt: '2026-10-08T00:00:00.000Z' },
    };
    const { fetch, sent } = fakeFetch(json(answer));
    const client = createClient({ token: 'elg_x', fetch });

    expect(await client.verifyPreview('a.b')).toEqual(answer);
    expect(sent[0]?.url).toBe('https://api.elgavio.com/delivery/v1/preview/verify?code=a.b');
  });
});
