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
    expect(generateTypes({ locales: [], collections: [], blocks: [] })).toBe(
      'export interface ElgavioContent {\n  collections: Record<string, never>;\n}\n',
    );
  });

  it("doesn't take a list option's value for a type it uses", () => {
    const output = generateTypes({
      locales: [],
      collections: [],
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
