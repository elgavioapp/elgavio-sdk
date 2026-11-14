// Compiled by `npm run typecheck`, never run: the generated types against the client's calls.
import { createClient, type RichTextDocument } from '@elgavio/sdk';
import type { ElgavioContent, PostsEntry } from './elgavio-types.js';

const elgavio = createClient<ElgavioContent>({ token: 'elg_test' });

export const checks = async () => {
  const { data } = await elgavio.entries('posts', {
    filter: {
      tags: { contains: 'news' },
      rating: { gte: 3 },
      publishedAt: { lt: new Date() },
      featured: true,
    },
    sort: ['-publishedAt', 'title'],
  });
  const post = data[0];
  if (post !== undefined) {
    post.collection satisfies 'posts';
    post.body satisfies string;
    post.tags satisfies { value: 'news' | "it's"; label: string }[];
    post.day satisfies string;
    post.links[0]?._id satisfies string | undefined;
    post.blocks[0]?._block satisfies 'hero' | 'quote' | undefined;
    // @ts-expect-error: optional fields are left out when empty.
    post.excerpt satisfies string;
  }

  const trimmed = await elgavio.entries('posts', { fields: ['excerpt'] });
  trimmed.data[0]?.title satisfies string | undefined;
  // @ts-expect-error: `fields` left `body` out.
  void trimmed.data[0]?.body;

  const asJson = await elgavio.all('posts', { richText: 'json' });
  asJson[0]?.body satisfies RichTextDocument | undefined;

  const settings = await elgavio.single('settings');
  settings.siteName satisfies string;
  // Settings has no pages, so no URL; posts have one in every language.
  settings.path satisfies null;
  settings.alternates[0]?.path satisfies null | undefined;
  post?.path satisfies string | undefined;
  post?.alternates[0]?.path satisfies string | undefined;
  trimmed.data[0]?.path satisfies string | undefined;
  // @ts-expect-error: an entry without pages has no path to route to.
  settings.path satisfies string;

  const pages = await elgavio.tree('pages');
  pages.data[0]?.children satisfies unknown[] | undefined;

  const page = await elgavio.entries('pages');
  page.data[0]?.featuredPost?.excerpt satisfies string | undefined;
  page.data[0]?.blocks[0]?._block satisfies 'hero' | 'divider' | undefined;

  const any = await elgavio.entry('id');
  if (any.collection === 'posts') {
    any satisfies PostsEntry;
  }

  // @ts-expect-error: settings holds one entry.
  await elgavio.entries('settings');
  // @ts-expect-error: posts is flat.
  await elgavio.tree('posts');
  // @ts-expect-error: pages holds a list.
  await elgavio.single('pages');
  // @ts-expect-error: `day` isn't sortable.
  await elgavio.entries('posts', { sort: ['day'] });
  // @ts-expect-error: `tags` takes `contains` and `exists` only.
  await elgavio.entries('posts', { filter: { tags: 'news' } });
  // @ts-expect-error: not a field of posts.
  await elgavio.entries('posts', { fields: ['nope'] });
};

export const stringChecks = async () => {
  const nested = await elgavio.strings();
  nested.Settings.Profile.Title satisfies string;
  nested.Empty satisfies Record<string, never>;
  // @ts-expect-error: not a key of the catalog.
  void nested.Settings.Profile.Missing;

  const flat = await elgavio.strings({ format: 'flat' });
  flat['Modal.Delete.Confirm'] satisfies string;
  flat["it's here"] satisfies string;
  // @ts-expect-error: a folder is not a string.
  void flat.Settings;

  const omitted = await elgavio.strings({ missing: 'omit' });
  omitted.Settings?.Profile?.Title satisfies string | undefined;

  const flatOmitted = await elgavio.strings({ format: 'flat', missing: 'omit' });
  flatOmitted['Settings.Language'] satisfies string | undefined;

  const under = await elgavio.strings({ format: 'flat', prefix: ['Settings', 'Modal.Delete'] });
  under['Settings.Profile.Save'] satisfies string;
  under['Modal.Delete.Confirm'] satisfies string;
  // @ts-expect-error: outside the prefixes.
  void under['404'];

  const one = await elgavio.strings({ prefix: 'Settings.Profile', locale: 'de' });
  one.Settings?.Profile?.Title satisfies string | undefined;

  // @ts-expect-error: only folders are a prefix.
  await elgavio.strings({ prefix: '404' });
  // @ts-expect-error: not a format.
  await elgavio.strings({ format: 'tree' });
  // @ts-expect-error: not a missing mode.
  await elgavio.strings({ missing: 'blank' });
};

const untyped = createClient({ token: 'elg_test' });

export const untypedChecks = async () => {
  const { data } = await untyped.entries('anything', {
    filter: { x: { in: [1, 2] } },
    sort: ['-y'],
  });
  data[0]?.whatever satisfies unknown;
  const one = await untyped.single('settings');
  one.title satisfies string;
  one.path satisfies string | null;
};

export const untypedStringChecks = async () => {
  const nested = await untyped.strings({ prefix: 'Anything' });
  nested.Anything satisfies unknown;
  const flat = await untyped.strings({ format: 'flat' });
  flat['Any.Key'] satisfies string | undefined;
};
