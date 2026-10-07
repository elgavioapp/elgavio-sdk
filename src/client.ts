import { memoryCache, type CacheAdapter } from './cache.js';
import { errorFromResponse, isElgavioError } from './errors.js';
import type {
  AnyEntry,
  CollectionKey,
  ContentModel,
  EntryFilter,
  FieldKey,
  ListKey,
  PickedEntry,
  SingleKey,
  SortKey,
  TreeKey,
  UntypedContent,
} from './model.js';
import { queryString, type QueryParams } from './query.js';
import type {
  Changes,
  DeliveredPath,
  DeliverySchema,
  Page,
  Project,
  Redirect,
  RichTextFormat,
  TreeNode,
} from './types.js';
import { SDK_VERSION } from './version.js';

export const DEFAULT_BASE_URL = 'https://api.elgavio.com';

/** The most a delivery list serves per page. */
export const MAX_PAGE_LIMIT = 100;

/** The most `paths()` and `redirects()` serve per page. */
export const MAX_LONG_PAGE_LIMIT = 1000;

export interface ClientOptions {
  /** A delivery token, `elg_…`. `undefined` is accepted so `process.env` passes straight in. */
  token: string | undefined;
  baseUrl?: string;
  /** The language every read asks for unless it names its own; the project's default otherwise. */
  locale?: string;
  /** Kept responses revalidated with their ETag; `false` turns it off. A memory map by default. */
  cache?: CacheAdapter | false;
  fetch?: typeof globalThis.fetch;
}

interface ReadOptions<Format extends RichTextFormat> {
  locale?: string;
  richText?: Format;
}

export interface EntriesQuery<
  Content extends ContentModel,
  Key extends CollectionKey<Content>,
  Format extends RichTextFormat,
  Field extends FieldKey<Content, Key>,
> extends ReadOptions<Format> {
  filter?: EntryFilter<Content, Key>;
  sort?: readonly SortKey<Content, Key>[];
  /** The top-level keys to serve, `blocks` among them; the system keys always come. */
  fields?: readonly Field[];
  page?: number;
  /** At most 100. */
  limit?: number;
}

export interface LongListQuery {
  locale?: string;
  page?: number;
  /** At most 1000. */
  limit?: number;
}

export type Resolution<Content extends ContentModel, Format extends RichTextFormat> =
  | { type: 'entry'; collection: string; entry: AnyEntry<Content, Format> }
  | { type: 'redirect'; to: string; permanent: boolean };

const trimSlash = (url: string) => url.replace(/\/+$/, '');

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

/**
 * A client for one project's published content, read with a delivery token. Pass the generated
 * `ElgavioContent` type for collections, fields, filters and sort keys checked against the schema.
 */
export const createClient = <Content extends ContentModel = UntypedContent>(
  options: ClientOptions,
) => {
  const { token } = options;
  if (token === undefined || token === '') {
    throw new Error('createClient: no token. Pass a delivery token, `elg_…`.');
  }
  const baseUrl = `${trimSlash(options.baseUrl ?? DEFAULT_BASE_URL)}/delivery/v1`;
  const cache = options.cache === false ? null : (options.cache ?? memoryCache());
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);

  const request = async <Result>(path: string, params: QueryParams = {}): Promise<Result> => {
    const url = `${baseUrl}${path}${queryString(params)}`;
    const cached = cache === null ? undefined : await cache.get(url);
    const response = await fetchFn(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Elgavio-Client': `elgavio-sdk/${SDK_VERSION}`,
        ...(cached === undefined ? {} : { 'If-None-Match': cached.etag }),
      },
    });
    if (response.status === 304 && cached !== undefined) {
      return cached.body as Result;
    }
    const body = await readJson(response);
    if (!response.ok) {
      throw errorFromResponse(response.status, body);
    }
    const etag = response.headers.get('ETag');
    const noStore = /no-store/i.test(response.headers.get('Cache-Control') ?? '');
    if (cache !== null && etag !== null && !noStore) {
      await cache.set(url, { etag, body });
    }
    return body as Result;
  };

  const encodeKey = (key: string) => encodeURIComponent(key);

  // Only reads that take a language get the client's.
  const localized = <Query extends { locale?: string }>(query: Query): Query => ({
    ...query,
    locale: query.locale ?? options.locale,
  });

  const entries = <
    Key extends ListKey<Content>,
    Format extends RichTextFormat = 'html',
    Field extends FieldKey<Content, Key> = never,
  >(
    key: Key,
    query: EntriesQuery<Content, Key, Format, Field> = {},
  ) =>
    request<Page<PickedEntry<Content, Key, Format, Field>>>(
      `/collections/${encodeKey(key)}/entries`,
      localized(query) as QueryParams,
    );

  return {
    /** The project's languages and collections. */
    project: () => request<Project>('/project'),

    /** The project's collections and blocks, field by field: what `elgavio types` reads. */
    schema: () => request<DeliverySchema>('/schema'),

    /** One page of a collection's entries: newest published first, or in tree order. */
    entries,

    /** Every entry `query` matches, page after page. */
    all: async <
      Key extends ListKey<Content>,
      Format extends RichTextFormat = 'html',
      Field extends FieldKey<Content, Key> = never,
    >(
      key: Key,
      query: Omit<EntriesQuery<Content, Key, Format, Field>, 'page' | 'limit'> = {},
    ) => {
      const items: PickedEntry<Content, Key, Format, Field>[] = [];
      for (let page = 1; ; page += 1) {
        const result = await entries<Key, Format, Field>(key, {
          ...query,
          page,
          limit: MAX_PAGE_LIMIT,
        });
        items.push(...result.data);
        if (page >= result.meta.totalPages) {
          return items;
        }
      }
    },

    /** One entry by id, in whichever collection it is. */
    entry: <Format extends RichTextFormat = 'html'>(id: string, query: ReadOptions<Format> = {}) =>
      request<AnyEntry<Content, Format>>(`/entries/${encodeKey(id)}`, localized(query)),

    /** A single-entry collection's one entry. */
    single: <Key extends SingleKey<Content>, Format extends RichTextFormat = 'html'>(
      key: Key,
      query: ReadOptions<Format> = {},
    ) =>
      request<PickedEntry<Content, Key, Format, never>>(
        `/collections/${encodeKey(key)}/entry`,
        localized(query),
      ),

    /** A hierarchical collection's entries, nested, without their content: for menus. */
    tree: (key: TreeKey<Content>, query: { locale?: string } = {}) =>
      request<{ data: TreeNode[] }>(`/collections/${encodeKey(key)}/tree`, localized(query)),

    /** What a public path serves: an entry, a redirect, or `null` for nothing. */
    resolve: async <Format extends RichTextFormat = 'html'>(
      path: string,
      query: ReadOptions<Format> = {},
    ): Promise<Resolution<Content, Format> | null> => {
      try {
        return await request<Resolution<Content, Format>>('/resolve', {
          ...localized(query),
          path,
        });
      } catch (error) {
        if (isElgavioError(error) && error.status === 404 && error.reason === null) {
          return null;
        }
        throw error;
      }
    },

    /** One page of every published entry's path, by collection then path. */
    paths: (query: LongListQuery = {}) => request<Page<DeliveredPath>>('/paths', localized(query)),

    /** One page of the language's redirects. */
    redirects: (query: LongListQuery = {}) =>
      request<Page<Redirect>>('/redirects', localized(query)),

    /**
     * What changed since `since`, the last answer's `next`. Without it, only `next` and `resync`:
     * take that before fetching everything, so nothing changed in between is missed.
     */
    changes: (since?: number) => request<Changes>('/changes', { since }),
  };
};

export type ElgavioClient<Content extends ContentModel = UntypedContent> = ReturnType<
  typeof createClient<Content>
>;
