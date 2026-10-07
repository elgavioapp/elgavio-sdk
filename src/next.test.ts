import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from './client.js';
import { localizedStaticParams, revalidateFromWebhook, staticParams } from './next.js';
import type { Change, DeliveredPath, WebhookPayload } from './types.js';

const path = (collection: string, locale: string, value: string): DeliveredPath => ({
  id: value,
  collection,
  locale,
  path: value,
  publishedAt: '2026-10-01T00:00:00.000Z',
  alternates: [],
});

const PATHS: Record<string, DeliveredPath[]> = {
  en: [
    path('pages', 'en', '/'),
    path('pages', 'en', '/about/team'),
    path('posts', 'en', '/blog/hello'),
    path('posts', 'en', '/blog/world'),
  ],
  de: [path('pages', 'de', '/ueber')],
};

// Two paths a page, so paging is exercised.
const client = createClient({
  token: 'elg_x',
  cache: false,
  fetch: (input) => {
    const url = new URL(input as string);
    if (url.pathname.endsWith('/project')) {
      return Promise.resolve(
        Response.json({
          locales: [
            { code: 'en', default: true },
            { code: 'de', default: false },
          ],
          collections: [],
        }),
      );
    }
    const all = PATHS[url.searchParams.get('locale') ?? 'en'] ?? [];
    const page = Number(url.searchParams.get('page') ?? '1');
    return Promise.resolve(
      Response.json({
        data: all.slice((page - 1) * 2, page * 2),
        meta: { page, limit: 2, total: all.length, totalPages: Math.ceil(all.length / 2) },
      }),
    );
  },
});

describe('staticParams', () => {
  it('turns every path into catch-all segments', async () => {
    expect(await staticParams(client)).toEqual([
      { slug: [] },
      { slug: ['about', 'team'] },
      { slug: ['blog', 'hello'] },
      { slug: ['blog', 'world'] },
    ]);
  });

  it("keeps one collection's paths below the route's own", async () => {
    expect(await staticParams(client, { collection: 'posts', basePath: '/blog/' })).toEqual([
      { slug: ['hello'] },
      { slug: ['world'] },
    ]);
  });
});

describe('localizedStaticParams', () => {
  it("covers every language of the project's", async () => {
    expect(await localizedStaticParams(client, { collection: 'pages' })).toEqual([
      { locale: 'en', slug: [] },
      { locale: 'en', slug: ['about', 'team'] },
      { locale: 'de', slug: ['ueber'] },
    ]);
  });
});

const SECRET = 'whsec_test';

const change = (kind: Change['kind'], path: string | null, previousPath: string | null = null) => ({
  seq: 1,
  at: '2027-01-15T08:00:00.000Z',
  kind,
  id: 'entry-1',
  collection: 'posts',
  locale: 'en',
  path,
  previousPath,
});

const webhookCall = (payload: Partial<WebhookPayload>, secret = SECRET) => {
  const body = JSON.stringify({
    event: 'content.changed',
    trigger: 'publish',
    project: { id: 'project-1' },
    since: 0,
    next: 1,
    changes: [],
    truncated: false,
    ...payload,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret)
    .update(`${String(timestamp)}.${body}`)
    .digest('hex');
  return new Request('https://app.example.com/api/elgavio', {
    method: 'POST',
    body,
    headers: { 'elgavio-signature': `t=${String(timestamp)},v1=${digest}` },
  });
};

describe('revalidateFromWebhook', () => {
  it("revalidates each path a call names, a move's old one too", async () => {
    const revalidatePath = vi.fn();
    const handle = revalidateFromWebhook({ secret: SECRET, revalidatePath });

    const response = await handle(
      webhookCall({
        changes: [
          change('published', '/blog/hello'),
          change('moved', '/blog/world', '/blog/old-world'),
          change('published', '/blog/hello'),
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidatePath.mock.calls).toEqual([
      ['/blog/hello'],
      ['/blog/world'],
      ['/blog/old-world'],
    ]);
  });

  it('revalidates everything for a schema change or a truncated call', async () => {
    const revalidatePath = vi.fn();
    const handle = revalidateFromWebhook({ secret: SECRET, revalidatePath });

    await handle(webhookCall({ changes: [change('schema', null)] }));
    await handle(webhookCall({ truncated: true, changes: [change('published', '/a')] }));

    expect(revalidatePath.mock.calls).toEqual([
      ['/', 'layout'],
      ['/', 'layout'],
    ]);
  });

  it("maps a change to the app's routes", async () => {
    const revalidatePath = vi.fn();
    const handle = revalidateFromWebhook({
      secret: SECRET,
      revalidatePath,
      pathsOf: (item) => [`/${item.locale ?? 'en'}${item.path ?? ''}`, '/blog'],
    });

    await handle(webhookCall({ changes: [change('published', '/blog/hello')] }));

    expect(revalidatePath.mock.calls).toEqual([['/en/blog/hello'], ['/blog']]);
  });

  it('answers 401 to a call another secret signed, and revalidates nothing', async () => {
    const revalidatePath = vi.fn();
    const handle = revalidateFromWebhook({ secret: SECRET, revalidatePath });

    const response = await handle(webhookCall({ changes: [change('published', '/a')] }, 'whsec_x'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'signatureInvalid' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
