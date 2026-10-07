import type { FilterOperator, RichTextFormat } from './types.js';

export type FilterScalar = string | number | boolean | Date;

/** One key's filter: a value for equality, or operators to values (`in` takes an array). */
export type FilterValue =
  FilterScalar | { [Operator in FilterOperator]?: FilterScalar | readonly FilterScalar[] };

export interface QueryParams {
  locale?: string;
  richText?: RichTextFormat;
  filter?: Record<string, FilterValue | undefined>;
  sort?: readonly string[];
  fields?: readonly string[];
  page?: number;
  limit?: number;
  path?: string;
  since?: number;
}

const scalarText = (value: FilterScalar): string =>
  value instanceof Date ? value.toISOString() : String(value);

const isScalar = (value: unknown): value is FilterScalar =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  value instanceof Date;

const filterParams = (filter: Record<string, FilterValue | undefined>): [string, string][] =>
  Object.entries(filter).flatMap(([key, value]): [string, string][] => {
    if (value === undefined) {
      return [];
    }
    if (isScalar(value)) {
      return [[`filter[${key}]`, scalarText(value)]];
    }
    return Object.entries(value).flatMap(([operator, operand]): [string, string][] => {
      if (operand === undefined) {
        return [];
      }
      const text = isScalar(operand) ? scalarText(operand) : operand.map(scalarText).join(',');
      return [[`filter[${key}][${operator}]`, text]];
    });
  });

// Brackets, commas and colons stay as typed, so a logged URL reads like the docs' examples.
const encode = (value: string) =>
  encodeURIComponent(value)
    .replaceAll('%2C', ',')
    .replaceAll('%5B', '[')
    .replaceAll('%5D', ']')
    .replaceAll('%3A', ':');

/** The query string for a delivery request, `?` included, or `''` for none. */
export const queryString = (params: QueryParams): string => {
  const pairs: [string, string][] = [];
  if (params.path !== undefined) {
    pairs.push(['path', params.path]);
  }
  if (params.locale !== undefined) {
    pairs.push(['locale', params.locale]);
  }
  if (params.richText !== undefined) {
    pairs.push(['richText', params.richText]);
  }
  if (params.filter !== undefined) {
    pairs.push(...filterParams(params.filter));
  }
  if (params.sort !== undefined && params.sort.length > 0) {
    pairs.push(['sort', params.sort.join(',')]);
  }
  if (params.fields !== undefined && params.fields.length > 0) {
    pairs.push(['fields', params.fields.join(',')]);
  }
  if (params.page !== undefined) {
    pairs.push(['page', String(params.page)]);
  }
  if (params.limit !== undefined) {
    pairs.push(['limit', String(params.limit)]);
  }
  if (params.since !== undefined) {
    pairs.push(['since', String(params.since)]);
  }
  return pairs.length === 0
    ? ''
    : `?${pairs.map(([name, value]) => `${encode(name)}=${encode(value)}`).join('&')}`;
};
