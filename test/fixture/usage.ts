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

const untyped = createClient({ token: 'elg_test' });

export const untypedChecks = async () => {
  const { data } = await untyped.entries('anything', {
    filter: { x: { in: [1, 2] } },
    sort: ['-y'],
  });
  data[0]?.whatever satisfies unknown;
  const one = await untyped.single('settings');
  one.title satisfies string;
};
