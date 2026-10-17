import { NestFactory } from '@nestjs/core';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './swagger';

/**
 * Writes the OpenAPI document to disk WITHOUT starting the server or
 * connecting to Postgres/Redis (Nest "preview" mode builds the route
 * graph but instantiates no providers).
 *
 *   pnpm openapi:export            -> ../docs/openapi.json
 *   pnpm openapi:export -- <path>  -> custom path
 */
async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
    abortOnError: false,
  });
  const document = buildOpenApiDocument(app);
  const out = resolve(process.argv[2] ?? '../docs/openapi.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(document, null, 2) + '\n');
  console.log(
    `OpenAPI written to ${out} (${Object.keys(document.paths).length} paths)`,
  );
  await app.close();
}

void exportOpenApi();
