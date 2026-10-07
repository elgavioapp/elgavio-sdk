// Writes src/openapi.ts from the delivery API's public OpenAPI document. OPENAPI_URL points it at
// another deployment of the API.
import { writeFileSync } from 'node:fs';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';
import type { OpenAPI3 } from 'openapi-typescript';

const url = process.env.OPENAPI_URL ?? 'https://api.elgavio.com/delivery/v1/openapi.json';

const response = await fetch(url);
if (!response.ok) {
  throw new Error(`Fetching ${url} failed: ${String(response.status)} ${response.statusText}`);
}
const document = (await response.json()) as OpenAPI3;

const output = `${COMMENT_HEADER}${astToString(await openapiTS(document))}`;
writeFileSync(new URL('../src/openapi.ts', import.meta.url), output);
console.log(`Wrote src/openapi.ts from ${url}`);
