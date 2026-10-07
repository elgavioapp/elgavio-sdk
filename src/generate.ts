import type { DeliverySchema, SchemaCollection, SchemaField } from './types.js';

// Keys are `^[a-z][a-zA-Z0-9_]*$`, so a key is always a valid property name and its PascalCase a
// valid type name. The suffixes (`Fields`, `Entry`, `Block`) keep every generated name distinct.
const pascal = (key: string) => `${key.charAt(0).toUpperCase()}${key.slice(1)}`;

const literal = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

const union = (members: readonly string[]) =>
  members.length === 0 ? 'never' : members.join(' | ');

const indent = (text: string, depth: number) =>
  text
    .split('\n')
    .map((line) => (line === '' ? line : `${'  '.repeat(depth)}${line}`))
    .join('\n');

const fieldsType = (name: string) => `${pascal(name)}Fields`;
const blockType = (key: string) => `${pascal(key)}Block`;

const FORMAT_PARAM = "<Format extends RichTextFormat = 'html'>";

/**
 * The generated types that depend on the rich-text form, and so take `Format`: the rest declare
 * none, since `noUnusedLocals` refuses a type parameter that goes unused.
 */
type Formatted = ReadonlySet<string>;

const typeRef = (name: string, formatted: Formatted) =>
  formatted.has(name) ? `${name}<Format>` : name;

const leafType = (field: Exclude<SchemaField, { type: 'group' }>, formatted: Formatted): string => {
  switch (field.type) {
    case 'text':
    case 'date':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'richText':
      return 'RichText<Format>';
    case 'list':
      return `ListOption<${union(field.config.options.map(({ value }) => literal(value)))}>`;
    case 'json':
      return 'unknown';
    case 'media':
      return 'Media';
    case 'link':
      return 'Link';
    case 'reference':
      return union(
        field.config.targets.map(({ collection, previewFields }) =>
          previewFields.length === 0
            ? `Reference<${literal(collection)}>`
            : `Reference<${literal(collection)}, Pick<${typeRef(fieldsType(collection), formatted)}, ${union(previewFields.map(literal))}>>`,
        ),
      );
  }
};

const usesFormat = (fields: readonly SchemaField[], formatted: Formatted): boolean =>
  fields.some((field) => {
    switch (field.type) {
      case 'richText':
        return true;
      case 'group':
        return usesFormat(field.children, formatted);
      case 'reference':
        return field.config.targets.some(
          ({ collection, previewFields }) =>
            previewFields.length > 0 && formatted.has(fieldsType(collection)),
        );
      default:
        return false;
    }
  });

const blocksIn = (schema: DeliverySchema, collection: string) =>
  schema.blocks.filter(
    ({ availableIn }) => availableIn === 'all' || availableIn.includes(collection),
  );

// A reference's preview reaches into another collection's fields, so this runs until nothing more
// turns out to depend on the form.
const formattedTypes = (schema: DeliverySchema): Formatted => {
  const formatted = new Set<string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const block of schema.blocks) {
      const name = blockType(block.key);
      if (!formatted.has(name) && usesFormat(block.fields, formatted)) {
        formatted.add(name);
        grew = true;
      }
    }
    for (const collection of schema.collections) {
      const name = fieldsType(collection.key);
      if (
        !formatted.has(name) &&
        (usesFormat(collection.fields, formatted) ||
          blocksIn(schema, collection.key).some(({ key }) => formatted.has(blockType(key))))
      ) {
        formatted.add(name);
        grew = true;
      }
    }
  }
  return formatted;
};

const objectType = (
  fields: readonly SchemaField[],
  formatted: Formatted,
  { before = [], after = [] }: { before?: readonly string[]; after?: readonly string[] } = {},
): string => {
  const members = [...before, ...fields.map((field) => member(field, formatted)), ...after];
  return members.length === 0 ? 'Record<string, never>' : `{\n${indent(members.join('\n'), 1)}\n}`;
};

const member = (field: SchemaField, formatted: Formatted): string => {
  const many = field.cardinality.kind === 'many';
  if (field.type === 'group') {
    const shape = objectType(field.children, formatted, { before: many ? ['_id: string;'] : [] });
    return `${field.key}: ${many ? `Array<${shape}>` : shape};`;
  }
  const type = leafType(field, formatted);
  if (many) {
    return `${field.key}: Array<${type}>;`;
  }
  return `${field.key}${field.required ? '' : '?'}: ${type};`;
};

const filterValueType = (collection: SchemaCollection, key: string): string => {
  if (key === 'publishedAt') {
    return 'string | Date';
  }
  const field = collection.fields.find((candidate) => candidate.key === key);
  switch (field?.type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'string | Date';
    case 'list':
      return union(field.config.options.map(({ value }) => literal(value)));
    default:
      return 'string';
  }
};

const filterType = (collection: SchemaCollection): string =>
  objectType([], new Set(), {
    after: collection.filters.map(
      ({ key, operators }) =>
        `${key}?: FilterCondition<${filterValueType(collection, key)}, ${union(operators.map(literal))}>;`,
    ),
  });

const SDK_TYPES = [
  'BlockInstance',
  'Entry',
  'FilterCondition',
  'Link',
  'ListOption',
  'Media',
  'Reference',
  'RichText',
  'RichTextFormat',
] as const;

// Only what the file uses, so `noUnusedLocals` passes over it. String literals are blanked first:
// a list option's value may read `Media`.
const importLine = (body: string) => {
  const code = body.replaceAll(/'(?:[^'\\]|\\.)*'/g, "''");
  const used = SDK_TYPES.filter((name) => new RegExp(`\\b${name}\\b`).test(code));
  return used.length === 0 ? '' : `import type { ${used.join(', ')} } from '@elgavio/sdk';\n\n`;
};

/** The types file `elgavio types` writes, without its header comment. */
export const generateTypes = (schema: DeliverySchema): string => {
  const formatted = formattedTypes(schema);
  const declare = (name: string) => (formatted.has(name) ? `${name}${FORMAT_PARAM}` : name);
  const sections: string[] = [];

  for (const block of schema.blocks) {
    const instance = `BlockInstance<${literal(block.key)}>`;
    sections.push(
      `export type ${declare(blockType(block.key))} = ${block.fields.length === 0 ? instance : `${instance} & ${objectType(block.fields, formatted)}`};`,
    );
  }

  for (const collection of schema.collections) {
    const blocks = blocksIn(schema, collection.key).map(({ key }) =>
      typeRef(blockType(key), formatted),
    );
    const fields = objectType(collection.fields, formatted, {
      after: [`blocks: Array<${union(blocks)}>;`],
    });
    sections.push(
      `export type ${declare(fieldsType(collection.key))} = ${fields};`,
      `export type ${pascal(collection.key)}Entry${FORMAT_PARAM} = Entry<ElgavioContent, ${literal(collection.key)}, Format>;`,
    );
  }

  const collections = schema.collections.map((collection) => {
    const name = fieldsType(collection.key);
    const entry = formatted.has(name)
      ? `{ html: ${name}<'html'>; json: ${name}<'json'>; text: ${name}<'text'> }`
      : `{ html: ${name}; json: ${name}; text: ${name} }`;
    return [
      `${collection.key}: {`,
      `  entry: ${entry};`,
      `  filter: ${indent(filterType(collection), 1).trimStart()};`,
      `  sort: ${union(collection.sort.map(literal))};`,
      `  single: ${String(collection.single)};`,
      `  hierarchical: ${String(collection.hierarchical)};`,
      '};',
    ].join('\n');
  });
  sections.push(
    `export interface ElgavioContent {\n  collections: ${objectType([], formatted, { after: collections }).replaceAll('\n', '\n  ')};\n}`,
  );

  const body = `${sections.join('\n\n')}\n`;
  return `${importLine(body)}${body}`;
};
