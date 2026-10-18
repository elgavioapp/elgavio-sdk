import type { FilterScalar, FilterValue } from './query.js';
import type {
  DeliveredStrings,
  EntrySystemFields,
  FilterOperator,
  RichTextFormat,
  StringsFormat,
  StringsMissing,
} from './types.js';

/**
 * One collection as the generated types describe it: its entry's own fields in each rich-text
 * form, what `filter` and `sort` take, and which reads it answers.
 */
export type CollectionModel = {
  entry: { html: object; json: object; text: object };
  filter: object;
  sort: string;
  single: boolean;
  hierarchical: boolean;
};

/** The catalog as the generated types describe it: every key, every folder, the nested shape. */
export type StringsModel = {
  key: string;
  folder: string;
  tree: object;
};

/** A project's content, as `elgavio types` writes it. */
export type ContentModel = {
  collections: Record<string, CollectionModel>;
  /** Missing from a types file written before `strings()`: keys and folders are then any string. */
  strings?: StringsModel;
};

/** Without generated types: any collection, any field. */
export type UntypedContent = {
  collections: Record<
    string,
    {
      entry: {
        html: Record<string, unknown>;
        json: Record<string, unknown>;
        text: Record<string, unknown>;
      };
      filter: Record<string, FilterValue>;
      sort: string;
      single: boolean;
      hierarchical: boolean;
    }
  >;
  strings: { key: string; folder: string; tree: DeliveredStrings };
};

/** One filterable key: a value for equality when `eq` is allowed, else operators to values. */
export type FilterCondition<Value extends FilterScalar, Operator extends FilterOperator> =
  | ('eq' extends Operator ? Value : never)
  | {
      [O in Operator]?: O extends 'in' ? readonly Value[] : O extends 'exists' ? boolean : Value;
    };

export type CollectionKey<Content extends ContentModel> = keyof Content['collections'] & string;

type CollectionOf<
  Content extends ContentModel,
  Key extends CollectionKey<Content>,
> = Content['collections'][Key];

/** Collections holding one entry, read with `single()`. */
export type SingleKey<Content extends ContentModel> = {
  [Key in CollectionKey<Content>]: true extends CollectionOf<Content, Key>['single'] ? Key : never;
}[CollectionKey<Content>];

/** Collections holding a list, read with `entries()` and `all()`. */
export type ListKey<Content extends ContentModel> = {
  [Key in CollectionKey<Content>]: false extends CollectionOf<Content, Key>['single'] ? Key : never;
}[CollectionKey<Content>];

/** Hierarchical collections, read with `tree()`. */
export type TreeKey<Content extends ContentModel> = {
  [Key in CollectionKey<Content>]: true extends CollectionOf<Content, Key>['hierarchical']
    ? Key
    : never;
}[CollectionKey<Content>];

/** A field key `fields` can keep. */
export type FieldKey<
  Content extends ContentModel,
  Key extends CollectionKey<Content>,
> = keyof CollectionOf<Content, Key>['entry']['html'] & string;

export type Entry<
  Content extends ContentModel,
  Key extends CollectionKey<Content>,
  Format extends RichTextFormat = 'html',
> = EntrySystemFields<Key> & CollectionOf<Content, Key>['entry'][Format];

/** Any collection's entry, told apart by `collection`. */
export type AnyEntry<Content extends ContentModel, Format extends RichTextFormat = 'html'> = {
  [Key in CollectionKey<Content>]: Entry<Content, Key, Format>;
}[CollectionKey<Content>];

/** An entry trimmed by `fields`; the system keys always come. */
export type PickedEntry<
  Content extends ContentModel,
  Key extends CollectionKey<Content>,
  Format extends RichTextFormat,
  Field extends string,
> = [Field] extends [never]
  ? Entry<Content, Key, Format>
  : EntrySystemFields<Key> &
      Pick<
        CollectionOf<Content, Key>['entry'][Format],
        Field & keyof CollectionOf<Content, Key>['entry'][Format]
      >;

export type SortKey<Content extends ContentModel, Key extends CollectionKey<Content>> =
  CollectionOf<Content, Key>['sort'] | `-${CollectionOf<Content, Key>['sort']}`;

export type EntryFilter<
  Content extends ContentModel,
  Key extends CollectionKey<Content>,
> = CollectionOf<Content, Key>['filter'];

type StringsOf<Content extends ContentModel> = Content extends {
  strings: infer Strings extends StringsModel;
}
  ? Strings
  : UntypedContent['strings'];

/** Every string's full key. */
export type StringKeyOf<Content extends ContentModel> = StringsOf<Content>['key'];

/** Every folder's key: what `strings()`'s `prefix` takes. */
export type StringFolderOf<Content extends ContentModel> = StringsOf<Content>['folder'];

type DeepPartial<Tree> = {
  [Key in keyof Tree]?: Tree[Key] extends string ? string : DeepPartial<Tree[Key]>;
};

type KeysUnder<Key extends string, Prefix extends string> = [Prefix] extends [never]
  ? Key
  : Extract<Key, `${Prefix}.${string}`>;

/**
 * What `strings()` serves. Every key is there unless `missing` is `'omit'` or a `prefix` keeps only
 * some folders, where a nested answer is partial; a flat one is narrowed to the keys under the
 * prefix.
 */
export type StringsResult<
  Content extends ContentModel,
  Format extends StringsFormat,
  Missing extends StringsMissing,
  Prefix extends string,
> =
  string extends StringKeyOf<Content>
    ? Format extends 'flat'
      ? Record<string, string>
      : DeliveredStrings
    : Format extends 'flat'
      ? Missing extends 'omit'
        ? Partial<Record<KeysUnder<StringKeyOf<Content>, Prefix>, string>>
        : Record<KeysUnder<StringKeyOf<Content>, Prefix>, string>
      : [Prefix] extends [never]
        ? Missing extends 'omit'
          ? DeepPartial<StringsOf<Content>['tree']>
          : StringsOf<Content>['tree']
        : DeepPartial<StringsOf<Content>['tree']>;
