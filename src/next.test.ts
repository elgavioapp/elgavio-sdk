import { describe, expect, it } from 'vitest';
import { createClient } from './client.js';
import { localizedStaticParams, staticParams } from './next.js';
import type { DeliveredPath } from './types.js';

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
