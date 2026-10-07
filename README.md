# @elgavio/sdk

The client for Elgavio's delivery API: a project's published content, read with a delivery token.
It runs anywhere with `fetch` (Node 20+, browsers, Bun, Deno, edge runtimes, React Native,
Electron) and has no dependencies. It also ships the `elgavio` CLI, which generates your project's
content types and fails CI when they drift from the live schema.

```sh
npm install @elgavio/sdk
```

## Reading content

```ts
import { createClient } from '@elgavio/sdk';

const elgavio = createClient({ token: process.env.ELGAVIO_TOKEN });

const { data, meta } = await elgavio.entries('posts', {
  filter: { tags: { contains: 'news' }, publishedAt: { gte: '2026-01-01' } },
  sort: ['-publishedAt', 'title'],
  fields: ['excerpt', 'cover'],
  limit: 3,
});
```

A collection's **Try it** page in Elgavio builds these calls for you.

| method                  | reads                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| `entries(key, query)`   | one page of a collection: `{ data, meta }`, at most 100 a page              |
| `all(key, query)`       | every entry the query matches, page after page                              |
| `entry(id, query)`      | one entry by id, in whichever collection it is                              |
| `single(key, query)`    | a single-entry collection's entry                                           |
| `tree(key, query)`      | a hierarchical collection, nested, for menus                                |
| `resolve(path, query)`  | what a public path serves: an entry, a redirect, or `null`                  |
| `paths(query)`          | one page of every published path, for static generation and sitemaps        |
| `redirects(query)`      | one page of the redirects                                                   |
| `changes(since)`        | the change feed: what changed since your last `next`                        |
| `verifyPreview(code)`   | a preview code from Elgavio's Preview button: see [Preview](#preview)       |
| `project()`, `schema()` | the project's languages and collections; its fields, for the type generator |

- **`filter`**: `{ key: value }` is equality; `{ key: { op: value } }` takes `eq`, `ne`, `in` (an
  array), `lt`, `lte`, `gt`, `gte`, `contains` and `exists`, as the field allows. Several filters
  must all match.
- **`sort`**: keys, each descending with a leading `-`.
- **`fields`**: the top-level keys to serve, `blocks` among them. `id`, `collection`, `locale`,
  `title`, `slug`, `path`, `publishedAt` and `alternates` always come.
- **`locale`**: per call, or for every call with `createClient({ locale })`. The project's default
  language otherwise.
- **`richText`**: `'html'` (the default), `'json'` (the document, for native and component
  renderers) or `'text'`.

### Caching

The client revalidates every response with its `ETag`, so unchanged content costs a `304` and no
body. Responses are kept in memory by default; pass your own adapter to keep them across launches
(AsyncStorage, a file), or `cache: false` to turn it off.

```ts
const elgavio = createClient({
  token,
  cache: {
    get: async (key) => JSON.parse((await AsyncStorage.getItem(key)) ?? 'null') ?? undefined,
    set: (key, value) => AsyncStorage.setItem(key, JSON.stringify(value)),
  },
});
```

### Errors

A refused request throws an `ElgavioError` with the API's `status`, `code`, `reason` and
`fieldErrors`. A filter on a field that isn't filterable, for instance, is a `FIELD_ERRORS` reason
whose field error names `filter.<key>`.

```ts
import { isElgavioError } from '@elgavio/sdk';

try {
  await elgavio.single('settings');
} catch (error) {
  if (isElgavioError(error, 'DELIVERY_TOKEN_INVALID')) {
    // the token is unknown, revoked or expired
  }
  throw error;
}
```

## Typed content

```sh
npx elgavio types    # writes elgavio-types.ts from the live schema
npx elgavio check    # exits 1, with a diff, when the committed file no longer matches
```

```ts
import { createClient } from '@elgavio/sdk';
import type { ElgavioContent, PostsEntry } from './elgavio-types';

const elgavio = createClient<ElgavioContent>({ token: process.env.ELGAVIO_TOKEN });
```

Collection keys, fields, filters and sort keys are then checked against your schema: `single()`
takes only single-entry collections, `tree()` only hierarchical ones, `fields` narrows the result,
and `richText: 'json'` types every rich-text field as the document. Commit the file and run
`elgavio check` in CI, so a renamed field fails the build before it breaks your app.

The CLI reads `ELGAVIO_TOKEN` (and `ELGAVIO_API_URL`, if you aren't on `https://api.elgavio.com`)
from the environment, then `.env.local`, then `.env`. In CI, set it as a secret. A `--token` flag
exists, but it stays in your shell history. `elgavio.config.json` can set where the file goes:

```json
{ "output": "src/elgavio-types.ts" }
```

The check compares a hash of what the file says, so your formatter may reformat it.

## Next.js

`@elgavio/sdk/next` turns every published path into `generateStaticParams` for a catch-all route.

```ts
// app/blog/[...slug]/page.tsx
import { staticParams } from '@elgavio/sdk/next';

export const generateStaticParams = () =>
  staticParams(elgavio, { collection: 'posts', basePath: '/blog' });
```

`localizedStaticParams` does the same in every language, as `{ locale, slug }`, for a route under
`[locale]`. An entry at the route's own path has an empty `slug`, which only an optional catch-all,
`[[...slug]]`, takes.

## Webhooks

A project's webhooks `POST` what changed, signed in `Elgavio-Signature` with the webhook's signing
secret. `verifyWebhook` checks the signature against the raw body and returns the payload: the
changes as `/changes` lists them, at most 100, with `truncated` when there were more. It refuses
a signature older than five minutes (`tolerance`, in seconds).

```ts
import { verifyWebhook } from '@elgavio/sdk';

const payload = await verifyWebhook(rawBody, request.headers.get('elgavio-signature'), {
  secret: process.env.ELGAVIO_WEBHOOK_SECRET!,
});
for (const change of payload.changes) {
  // Refetch change.id, purge change.path, reindex…
}
```

A refused call throws `ElgavioWebhookError`, whose `reason` is `signatureMissing`,
`signatureInvalid` or `signatureExpired`. A build hook from Vercel, Netlify or Cloudflare Pages
needs none of this: it ignores the body.

In Next.js, `revalidateFromWebhook` is the whole route handler. It revalidates each changed path
(and a moved entry's old one), or the whole app for a change to the content types or media, or a
truncated call, and answers 401 to an unsigned one.

```ts
// app/api/elgavio/route.ts
import { revalidatePath } from 'next/cache';
import { revalidateFromWebhook } from '@elgavio/sdk/next';

export const POST = revalidateFromWebhook({
  secret: process.env.ELGAVIO_WEBHOOK_SECRET!,
  revalidatePath,
  // Optional: where a change shows in your routes.
  pathsOf: (change) => (change.path === null ? [] : [`/${change.locale}${change.path}`]),
});
```

## Preview

A collection's preview URL, set in its settings, is where Elgavio's **Preview** button opens a
draft: a route of your app (`https://your.app/api/preview`) or a link into it
(`yourapp://preview?id={id}`). `{id}`, `{collection}`, `{path}` and `{locale}` are filled in, and a
code valid five minutes is added as `elgavioPreview`.

Your app verifies the code, then reads in draft mode: each entry as its draft where that draft would
pass publishing, else as published. Draft responses are never cached.

- **With a server**: a secret token with the `preview` scope reads drafts.
  `createClient({ token, draft: true })`.
- **Without one**: a public token never reads drafts on its own. `verifyPreview(code)` returns a
  `previewSession`, valid an hour, that lets it:
  `createClient({ token, draft: true, previewSession: previewSession.value })`.

In Next.js, `draftModeRoute` is the whole preview route: it verifies the code, turns on draft mode
and redirects to the entry.

```ts
// app/api/preview/route.ts
import { draftMode } from 'next/headers';
import { createClient } from '@elgavio/sdk';
import { draftModeRoute } from '@elgavio/sdk/next';

const elgavio = createClient({ token: process.env.ELGAVIO_PREVIEW_TOKEN });

export const GET = draftModeRoute({ client: elgavio, draftMode });
```

Then read with `draft: (await draftMode()).isEnabled`, and turn it off with
`(await draftMode()).disable()` in a route of your own.

## Versions

Until its first stable release the SDK is `0.x`. From then on its major version follows the delivery
API's: `/delivery/v1` is `1.x`.

## License

MIT
