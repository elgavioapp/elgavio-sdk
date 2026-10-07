// The delivery API's shapes, from its OpenAPI document (`src/openapi.ts`, `npm run generate:api`).
// Only the generic wrappers the generated content types need are added here.
import type { components, paths } from './openapi.js';

type Schemas = components['schemas'];

type Answer<Path extends keyof paths> = paths[Path] extends {
  get: { responses: { 200: { content: { 'application/json': infer Body } } } };
}
  ? Body
  : never;

export type RichTextFormat = NonNullable<
  NonNullable<
    paths['/delivery/v1/collections/{key}/entries']['get']['parameters']['query']
  >['richText']
>;

/** `?richText=json`: the document, each image's record filled in. */
export type RichTextDocument = Schemas['DeliveredRichTextDocument'];

export type RichTextNode = Schemas['DeliveredRichTextNode'];

export type RichText<Format extends RichTextFormat> = Format extends 'json'
  ? RichTextDocument
  : string;

export type Media = Schemas['DeliveredMedia'];

export type Link = Schemas['DeliveredLink'];

export type ListOption<Value extends string = string> = Omit<
  Schemas['DeliveredListOption'],
  'value'
> & { value: Value };

/** A reference's target, with the preview fields its field names. */
export type Reference<Collection extends string = string, Preview extends object = object> = Pick<
  Schemas['DeliveredReference'],
  'id' | 'path' | 'title'
> & {
  collection: Collection;
} & Preview;

/** The keys every entry carries, whatever `fields` trims. */
export type EntrySystemFields<Collection extends string = string> = Pick<
  Schemas['DeliveredEntry'],
  'id' | 'locale' | 'title' | 'slug' | 'path' | 'publishedAt' | 'alternates'
> & { collection: Collection };

export type EntrySystemKey = keyof EntrySystemFields;

export type Alternate = Schemas['DeliveredEntry']['alternates'][number];

export type BlockInstance<Block extends string = string> = Pick<
  Schemas['DeliveredBlockInstance'],
  '_id'
> & { _block: Block };

type EntryPage = Answer<'/delivery/v1/collections/{key}/entries'>;

export type Page<Item> = Omit<EntryPage, 'data'> & { data: Item[] };

export type TreeNode = Schemas['DeliveredTreeNode'];

export type DeliveredPath = Answer<'/delivery/v1/paths'>['data'][number];

export type Redirect = Answer<'/delivery/v1/redirects'>['data'][number];

export type Changes = Answer<'/delivery/v1/changes'>;

export type Change = Changes['data'][number];

export type ChangeKind = Change['kind'];

export type Project = Answer<'/delivery/v1/project'>;

export type Locale = Project['locales'][number];

/** `/schema`: what `elgavio types` generates from. */
export type DeliverySchema = Answer<'/delivery/v1/schema'>;

export type SchemaField = Schemas['DeliverySchemaField'];

export type SchemaCollection = DeliverySchema['collections'][number];

export type SchemaBlock = DeliverySchema['blocks'][number];

export type FilterOperator = SchemaCollection['filters'][number]['operators'][number];
