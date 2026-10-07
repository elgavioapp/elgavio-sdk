import { MAX_LONG_PAGE_LIMIT, type ElgavioClient } from './client.js';
import type { ContentModel } from './model.js';
import { isElgavioError } from './errors.js';
import type { Change, DeliveredPath, PreviewEntry, WebhookPayload } from './types.js';
import { ElgavioWebhookError, verifyWebhook, type VerifyWebhookOptions } from './webhook.js';

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

export interface RevalidateFromWebhookOptions extends VerifyWebhookOptions {
  /** `revalidatePath` from `next/cache`, passed in so the SDK needs no Next.js of its own. */
  revalidatePath: (path: string, type?: 'layout' | 'page') => void;
  /**
   * The app's routes a change shows on: its path and, for a move, the one it had. Return more for
   * a locale prefix (`/${change.locale}${change.path}`) or a listing page that shows it.
   */
  pathsOf?: (change: Change) => readonly string[];
}

const changedPaths = (change: Change) =>
  [change.path, change.previousPath].filter((path): path is string => path !== null);

// A schema or media change can show anywhere, and a truncated call doesn't name everything.
const changesEverything = (payload: WebhookPayload) =>
  payload.truncated || payload.changes.some(({ kind }) => kind === 'schema' || kind === 'media');

/**
 * A route handler for a webhook: verifies the call, then revalidates the paths it names, or the
 * whole app when it can't name them all. Answers 401 to a call that isn't signed by the secret.
 *
 * ```ts
 * // app/api/elgavio/route.ts
 * import { revalidatePath } from 'next/cache';
 * export const POST = revalidateFromWebhook({ secret: process.env.ELGAVIO_WEBHOOK_SECRET!, revalidatePath });
 * ```
 */
export const revalidateFromWebhook =
  ({ revalidatePath, pathsOf = changedPaths, ...verify }: RevalidateFromWebhookOptions) =>
  async (request: Request): Promise<Response> => {
    let payload: WebhookPayload;
    try {
      payload = await verifyWebhook(
        await request.text(),
        request.headers.get('elgavio-signature'),
        verify,
      );
    } catch (error) {
      if (error instanceof ElgavioWebhookError) {
        return Response.json({ error: error.reason }, { status: 401 });
      }
      throw error;
    }

    if (changesEverything(payload)) {
      revalidatePath('/', 'layout');
      return Response.json({ revalidated: ['/'] });
    }

    const paths = [...new Set(payload.changes.flatMap((change) => pathsOf(change)))];
    for (const path of paths) {
      revalidatePath(path);
    }
    return Response.json({ revalidated: paths });
  };

export interface DraftModeRouteOptions {
  /** A client of a secret token with the `preview` scope. */
  client: Pick<ElgavioClient, 'verifyPreview'>;
  /** `draftMode` from `next/headers`, passed in so the SDK needs no Next.js of its own. */
  draftMode: () => Promise<{ enable: () => void }>;
  /** The app's route for the entry: its path by default. Return a locale prefix if routes have one. */
  pathOf?: (entry: PreviewEntry) => string;
}

/**
 * The route a collection's preview URL opens: checks the `elgavioPreview` code, turns on draft
 * mode, and redirects to the entry. Read with `createClient({ token, draft: true })` while
 * `(await draftMode()).isEnabled`. Answers 400 to a missing, expired or foreign code.
 *
 * ```ts
 * // app/api/preview/route.ts: preview URL https://your.app/api/preview
 * import { draftMode } from 'next/headers';
 * export const GET = draftModeRoute({ client, draftMode });
 * ```
 */
export const draftModeRoute =
  ({ client, draftMode, pathOf = (entry) => entry.path }: DraftModeRouteOptions) =>
  async (request: Request): Promise<Response> => {
    const code = new URL(request.url).searchParams.get('elgavioPreview');
    if (code === null || code === '') {
      return Response.json({ error: 'DELIVERY_PREVIEW_CODE_INVALID' }, { status: 400 });
    }
    let entry: PreviewEntry;
    try {
      ({ entry } = await client.verifyPreview(code));
    } catch (error) {
      if (isElgavioError(error) && error.status < 500) {
        return Response.json({ error: error.reason ?? error.code }, { status: error.status });
      }
      throw error;
    }
    (await draftMode()).enable();
    return new Response(null, {
      status: 307,
      headers: { Location: new URL(pathOf(entry), request.url).toString() },
    });
  };
