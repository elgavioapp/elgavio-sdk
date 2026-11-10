import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generateTypes } from './generate.js';
import type { DeliverySchema } from './types.js';

const fixture = JSON.parse(
  await readFile(new URL('../test/fixture/schema.json', import.meta.url), 'utf8'),
) as DeliverySchema;

describe('generateTypes', () => {
  // `npm run typecheck` compiles test/fixture/usage.ts against this file; `vitest -u` rewrites it.
  it('writes the fixture project as test/fixture/elgavio-types.ts', async () => {
    await expect(generateTypes(fixture)).toMatchFileSnapshot('../test/fixture/elgavio-types.ts');
  });

  it('imports nothing for a project without collections or blocks', () => {
    expect(
      generateTypes({
        locales: [],
        collections: [],
        blocks: [],
        strings: { keys: [], folders: [] },
      }),
    ).toBe(
      [
        'export type StringKey = never;',
        '',
        'export type StringFolder = never;',
        '',
        'export type StringTree = Record<string, never>;',
        '',
        'export type ElgavioContent = {',
        '  collections: Record<string, never>;',
        '  strings: { key: StringKey; folder: StringFolder; tree: StringTree };',
        '};',
        '',
      ].join('\n'),
    );
  });

  it("doesn't take a list option's value for a type it uses", () => {
    const output = generateTypes({
      locales: [],
      collections: [],
      strings: { keys: [], folders: [] },
      blocks: [
        {
          key: 'tag',
          name: 'Tag',
          description: null,
          availableIn: 'all',
          fields: [
            {
              key: 'kind',
              label: 'Kind',
              helpText: null,
              cardinality: { kind: 'one' },
              required: true,
              type: 'list',
              config: { options: [{ value: 'Media', label: 'Media' }] },
            },
          ],
        },
      ],
    });
    expect(output).toContain("import type { BlockInstance, ListOption } from '@elgavio/sdk';");
  });
});
