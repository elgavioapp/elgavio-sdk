// `npm version`'s hook: the client names its version in `Elgavio-Client`, and a bundled SDK can't
// read package.json at run time.
import { readFile, writeFile } from 'node:fs/promises';

const { version } = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

await writeFile(
  new URL('../src/version.ts', import.meta.url),
  `// Written by \`npm version\` (scripts/write-version.ts); never by hand.\nexport const SDK_VERSION = '${version}';\n`,
);
