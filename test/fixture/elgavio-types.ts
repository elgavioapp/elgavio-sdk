import type { BlockInstance, Entry, FilterCondition, Link, ListOption, Media, Reference, RichText, RichTextFormat } from '@elgavio/sdk';

export type HeroBlock<Format extends RichTextFormat = 'html'> = BlockInstance<'hero'> & {
  heading: string;
  body?: RichText<Format>;
};

export type QuoteBlock = BlockInstance<'quote'> & {
  text: string;
};

export type DividerBlock = BlockInstance<'divider'>;

export type PagesFields<Format extends RichTextFormat = 'html'> = {
  seo: {
    description?: string;
  };
  featuredPost?: Reference<'posts', Pick<PostsFields<Format>, 'excerpt'>>;
  hero?: Media;
  blocks: Array<HeroBlock<Format> | DividerBlock>;
};

export type PagesEntry<Format extends RichTextFormat = 'html'> = Entry<ElgavioContent, 'pages', Format>;

export type PostsFields<Format extends RichTextFormat = 'html'> = {
  excerpt?: string;
  body: RichText<Format>;
  tags: Array<ListOption<'news' | 'it\'s'>>;
  rating?: number;
  featured?: boolean;
  day: string;
  links: Array<{
    _id: string;
    label: string;
    link: Link;
  }>;
  related: Array<Reference<'posts'> | Reference<'pages'>>;
  meta?: unknown;
  blocks: Array<HeroBlock<Format> | QuoteBlock>;
};

export type PostsEntry<Format extends RichTextFormat = 'html'> = Entry<ElgavioContent, 'posts', Format>;

export type SettingsFields<Format extends RichTextFormat = 'html'> = {
  siteName: string;
  blocks: Array<HeroBlock<Format>>;
};

export type SettingsEntry<Format extends RichTextFormat = 'html'> = Entry<ElgavioContent, 'settings', Format>;

export interface ElgavioContent {
  collections: {
    pages: {
      entry: { html: PagesFields<'html'>; json: PagesFields<'json'>; text: PagesFields<'text'> };
      filter: {
        publishedAt?: FilterCondition<string | Date, 'eq' | 'ne' | 'in' | 'lt' | 'lte' | 'gt' | 'gte'>;
        featuredPost?: FilterCondition<string, 'eq' | 'ne' | 'in' | 'exists'>;
      };
      sort: 'title' | 'publishedAt';
      single: false;
      hierarchical: true;
    };
    posts: {
      entry: { html: PostsFields<'html'>; json: PostsFields<'json'>; text: PostsFields<'text'> };
      filter: {
        publishedAt?: FilterCondition<string | Date, 'eq' | 'ne' | 'in' | 'lt' | 'lte' | 'gt' | 'gte'>;
        tags?: FilterCondition<'news' | 'it\'s', 'contains' | 'exists'>;
        rating?: FilterCondition<number, 'eq' | 'ne' | 'in' | 'lt' | 'lte' | 'gt' | 'gte' | 'exists'>;
        featured?: FilterCondition<boolean, 'eq' | 'ne' | 'exists'>;
      };
      sort: 'title' | 'publishedAt' | 'rating';
      single: false;
      hierarchical: false;
    };
    settings: {
      entry: { html: SettingsFields<'html'>; json: SettingsFields<'json'>; text: SettingsFields<'text'> };
      filter: {
        publishedAt?: FilterCondition<string | Date, 'eq' | 'ne' | 'in' | 'lt' | 'lte' | 'gt' | 'gte'>;
      };
      sort: 'title' | 'publishedAt';
      single: true;
      hierarchical: false;
    };
  };
}
