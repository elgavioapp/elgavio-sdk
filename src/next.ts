import { MAX_LONG_PAGE_LIMIT, type ElgavioClient } from './client.js';
import type { ContentModel } from './model.js';
import type { DeliveredPath } from './types.js';

export interface StaticParamsOptions {
  /** Only this collection's entries. */
  collection?: string;
  /**
   * The route's own segments, left off each path: `/blog` for `app/blog/[...slug]`. Entries outside
   * it are skipped.
   */
  basePath?: string;
  /** One language; the project's default when left out. */
  locale?: string;
}

export interface StaticParam {
  slug: string[];
}

export interface LocalizedStaticParam extends StaticParam {
  locale: string;
}

const segmentsOf = (path: string) => path.split('/').filter((segment) => segment !== '');

const pathsIn = async <Content extends ContentModel>(
  client: ElgavioClient<Content>,
  locale: string | undefined,
): Promise<DeliveredPath[]> => {
  const paths: DeliveredPath[] = [];
  for (let page = 1; ; page += 1) {
    const result = await client.paths({ locale, page, limit: MAX_LONG_PAGE_LIMIT });
    paths.push(...result.data);
    if (page >= result.meta.totalPages) {
      return paths;
    }
  }
};

const paramsOf = (paths: readonly DeliveredPath[], options: StaticParamsOptions) => {
  const base = segmentsOf(options.basePath ?? '');
  return paths.flatMap((item) => {
    if (options.collection !== undefined && item.collection !== options.collection) {
      return [];
    }
    const segments = segmentsOf(item.path);
    if (base.some((segment, index) => segments[index] !== segment)) {
      return [];
    }
    return [{ locale: item.locale, slug: segments.slice(base.length) }];
  });
};

/**
 * `generateStaticParams` for a catch-all route, `[...slug]`, from every published path. An entry
 * at the route's own path has an empty `slug`, which only an optional catch-all, `[[...slug]]`,
 * takes.
 */
export const staticParams = async <Content extends ContentModel>(
  client: ElgavioClient<Content>,
  options: StaticParamsOptions = {},
): Promise<StaticParam[]> =>
  paramsOf(await pathsIn(client, options.locale), options).map(({ slug }) => ({ slug }));

/** `staticParams` in every language of the project's, for a route under `[locale]`. */
export const localizedStaticParams = async <Content extends ContentModel>(
  client: ElgavioClient<Content>,
  options: Omit<StaticParamsOptions, 'locale'> = {},
): Promise<LocalizedStaticParam[]> => {
  const { locales } = await client.project();
  const perLocale = await Promise.all(
    locales.map(async ({ code }) => paramsOf(await pathsIn(client, code), options)),
  );
  return perLocale.flat();
};
