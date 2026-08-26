// ============================================================================
// generate-postman.ts — build the API docs from the source, not by hand
// ============================================================================
//   npm run postman          regenerate postman/ + docs/API.md
//   npm run postman:check    fail if they are out of date (for CI)
//
// Why generate instead of hand-editing a 50 KB collection: the routers and the
// controllers already hold every fact the documentation needs.
//
//   src/server.ts        which router is mounted where  -> URL prefixes
//   src/routes/*.ts      method + path + handler        -> the request list
//   src/controllers/*.ts the comment above each handler -> the description
//                        every `req.query.x` it reads   -> the query params
//                        `?? 20` next to one of those   -> that param's default
//                        empty pool.query(``) sites     -> "SQL not written yet"
//
// Only what genuinely is not in the source — example request bodies, nicer
// request names — lives in scripts/api-examples.ts.
//
// Deliberately dependency-free: node + tsx, no Postman SDK, no OpenAPI
// toolchain. It is a text-processing script, and keeping it readable matters
// more than handling TypeScript syntax nobody in this repo writes.
// ============================================================================

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const COLLECTION_PATH = join(ROOT, 'postman', 'job-board.postman_collection.json');
const MARKDOWN_PATH = join(ROOT, 'docs', 'API.md');

import {
  COLLECTION_VARIABLES,
  CONTROLLER_FOLDERS,
  EXAMPLES,
  FOLDER_ORDER,
  PATH_VARIABLES,
  STANDALONE_REQUESTS,
  type ParamExample,
  type RequestExample,
} from './api-examples.js';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

interface QueryParam {
  name: string;
  /** The fallback the controller applies when the caller omits it, if any. */
  default: string | null;
}

interface HandlerInfo {
  doc: string;
  params: QueryParam[];
  /** pool.query(``) call sites still waiting for their SQL. */
  emptySites: number;
  /** pool.query(`SELECT ...`) call sites that have been written. */
  writtenSites: number;
}

interface Endpoint {
  folder: string;
  handler: string;
  method: string;
  /** Full path with :params, e.g. /api/jobs/:id/skills */
  path: string;
  name: string;
  description: string;
  params: Array<{ name: string; value: string; enabled: boolean; default: string | null }>;
  body?: unknown;
  emptySites: number;
  writtenSites: number;
}

// ---------------------------------------------------------------------------
// 1. server.ts -> where each router is mounted
// ---------------------------------------------------------------------------

function readMounts(): Array<{ prefix: string; routeFile: string }> {
  const source = readFileSync(join(SRC, 'server.ts'), 'utf8');

  // import jobsRouter from './routes/jobs.js';
  const importedFrom = new Map<string, string>();
  for (const m of source.matchAll(/import\s+(\w+)\s+from\s+'\.\/routes\/(\w+)\.js'/g)) {
    importedFrom.set(m[1]!, m[2]!);
  }

  // app.use('/api/jobs', jobsRouter);
  const mounts: Array<{ prefix: string; routeFile: string }> = [];
  for (const m of source.matchAll(/app\.use\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/g)) {
    const routeFile = importedFrom.get(m[2]!);
    if (routeFile) mounts.push({ prefix: m[1]!, routeFile });
  }
  return mounts;
}

// ---------------------------------------------------------------------------
// 2. routes/*.ts -> method, path, handler
// ---------------------------------------------------------------------------

interface RouteEntry {
  method: string;
  path: string;
  handler: string;
  controller: string;
}

function readRoutes(routeFile: string, prefix: string): RouteEntry[] {
  const source = readFileSync(join(SRC, 'routes', `${routeFile}.ts`), 'utf8');

  // import { a, b } from '../controllers/jobsController.js';
  const controllerOf = new Map<string, string>();
  for (const m of source.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*'\.\.\/controllers\/(\w+)\.js'/g
  )) {
    for (const name of m[1]!.split(',')) {
      const trimmed = name.trim();
      if (trimmed) controllerOf.set(trimmed, m[2]!);
    }
  }

  const routes: RouteEntry[] = [];
  // router.get('/:id/skills', getJobSkills);
  for (const m of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'\s*,\s*(\w+)\s*\)/g)) {
    const [, method, routePath, handler] = m as unknown as [string, string, string, string];
    const suffix = routePath === '/' ? '' : routePath;
    routes.push({
      method: method.toUpperCase(),
      path: `${prefix}${suffix}`,
      handler,
      controller: controllerOf.get(handler) ?? routeFile,
    });
  }
  return routes;
}

// ---------------------------------------------------------------------------
// 3. controllers/*.ts -> docs, query params, unwritten query sites
// ---------------------------------------------------------------------------

const BANNER = /^\/\/[\s\-=]*$/;
const ROUTE_HEADING = /^(GET|POST|PUT|PATCH|DELETE)\s+\//;

/**
 * The comment block sitting directly above a handler is its documentation.
 * The dashed banner lines and the `// GET /api/jobs` heading are structure,
 * not prose, so they are dropped — the method and path are already known from
 * the router.
 */
function extractDoc(source: string, handlerStart: number): string {
  const before = source.slice(0, handlerStart).split('\n');
  const comment: string[] = [];

  for (let i = before.length - 1; i >= 0; i--) {
    const line = before[i]!.trim();
    if (line === '') {
      // A blank line ends the block unless the comment continues above it.
      if (comment.length > 0) break;
      continue;
    }
    if (!line.startsWith('//')) break;
    comment.unshift(line);
  }

  const content = comment
    .filter((line) => !BANNER.test(line))
    .map((line) => line.replace(/^\/\/ ?/, ''))
    .filter((line, index, all) => !(index === 0 && ROUTE_HEADING.test(line.trim())));

  // Re-wrap: the source is hard-wrapped at 80 columns, which reads badly in a
  // Postman pane. Join wrapped prose back into paragraphs, but leave indented
  // lines, lists and tables exactly as they are.
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = (): void => {
    if (current.length > 0) paragraphs.push(current.join(' '));
    current = [];
  };

  for (const line of content) {
    const isPreformatted = /^(\s{2,}|[-*|>]|\d+\.\s)/.test(line);
    if (line.trim() === '') {
      flush();
    } else if (isPreformatted) {
      flush();
      paragraphs.push(line);
    } else {
      current.push(line.trim());
    }
  }
  flush();

  return paragraphs.join('\n\n').trim();
}

/**
 * Walk forward from a `req.query.x` to find the fallback applied to it. Starts
 * one bracket deep so the `,` separating arguments of the enclosing helper call
 * does not look like the end of the expression:
 *
 *     queryInt(req.query.days) ?? 7,                 -> "7"
 *     queryEnum(req.query.sort, SORT) ?? 'newest',   -> "newest"
 *     queryBool(req.query.hard) === true             -> "false"
 *     queryEnum(req.query.live_only, ...) !== 'false' -> "true"
 */
function deriveDefault(source: string, from: number): string | null {
  let depth = 1;
  let text = '';

  for (let i = from; i < source.length && text.length < 200; i++) {
    const ch = source[i]!;
    if (ch === '`') break;
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if ((ch === ',' && depth <= 0) || (ch === ';' && depth <= 1)) break;
    text += ch;
  }

  const nullish =
    /\?\?\s*'([^']*)'/.exec(text) ??
    /\?\?\s*(-?\d+(?:\.\d+)?)/.exec(text) ??
    /\?\?\s*(true|false)\b/.exec(text);
  if (nullish) return nullish[1]!;

  // Comparisons that turn a missing value into a boolean.
  if (/!==\s*'false'/.test(text)) return 'true';
  if (/===\s*'true'/.test(text)) return 'false';
  if (/===\s*true\b/.test(text)) return 'false';

  return null;
}

function extractParams(body: string): QueryParam[] {
  const params: QueryParam[] = [];
  const seen = new Set<string>();

  for (const m of body.matchAll(/req\.query\.(\w+)/g)) {
    const name = m[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    params.push({ name, default: deriveDefault(body, m.index! + m[0]!.length) });
  }

  // pagination() reads ?page and ?limit itself, so they never appear as a
  // literal req.query.page. Add them last, which is where they belong in a URL.
  const paginated = /pagination\(\s*req\.query\s*(?:,\s*(\d+))?/.exec(body);
  if (paginated) {
    if (!seen.has('page')) params.push({ name: 'page', default: '1' });
    if (!seen.has('limit')) params.push({ name: 'limit', default: paginated[1] ?? '20' });
  }

  return params;
}

/** Counts written vs still-empty pool.query() / client.query() call sites. */
function countQuerySites(body: string): { empty: number; written: number } {
  let empty = 0;
  let written = 0;

  for (const m of body.matchAll(/\b(?:pool|client)\.query\s*(?:<[^(]*>)?\s*\(\s*/g)) {
    const rest = body.slice(m.index! + m[0]!.length);
    if (rest.startsWith('``')) empty++;
    else if (rest.startsWith('`')) written++;
    // Anything else is a quoted literal: 'BEGIN', 'COMMIT', 'ROLLBACK'.
  }
  return { empty, written };
}

function readController(controller: string): Map<string, HandlerInfo> {
  const source = readFileSync(join(SRC, 'controllers', `${controller}.ts`), 'utf8');
  const handlers = new Map<string, HandlerInfo>();
  const found = [...source.matchAll(/^export async function (\w+)/gm)];

  found.forEach((match, index) => {
    const start = match.index!;
    const end = index + 1 < found.length ? found[index + 1]!.index! : source.length;
    const body = source.slice(start, end);
    const sites = countQuerySites(body);

    handlers.set(match[1]!, {
      doc: extractDoc(source, start),
      params: extractParams(body),
      emptySites: sites.empty,
      writtenSites: sites.written,
    });
  });

  return handlers;
}

// ---------------------------------------------------------------------------
// 4. Stitch it together
// ---------------------------------------------------------------------------

function prettifyHandlerName(handler: string): string {
  return handler
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function resolveParamExample(
  param: QueryParam,
  override: ParamExample | undefined
): { name: string; value: string; enabled: boolean; default: string | null } {
  if (typeof override === 'string') {
    return { name: param.name, value: override, enabled: true, default: param.default };
  }
  if (override && typeof override === 'object') {
    return {
      name: param.name,
      value: override.value,
      enabled: override.enabled ?? true,
      default: param.default,
    };
  }
  // No example given: send the parameter only when the controller has a
  // default for it, so the URL documents the default. Pure optional filters
  // ship disabled, which is how Postman shows "you may add this".
  return {
    name: param.name,
    value: param.default ?? '',
    enabled: param.default !== null,
    default: param.default,
  };
}

function buildEndpoints(): Endpoint[] {
  const endpoints: Endpoint[] = [];

  for (const standalone of STANDALONE_REQUESTS) {
    endpoints.push({
      folder: standalone.folder,
      handler: '',
      method: standalone.method,
      path: standalone.path,
      name: standalone.name,
      description: standalone.description,
      params: [],
      emptySites: 0,
      writtenSites: 0,
    });
  }

  const controllerCache = new Map<string, Map<string, HandlerInfo>>();

  for (const mount of readMounts()) {
    for (const route of readRoutes(mount.routeFile, mount.prefix)) {
      if (!controllerCache.has(route.controller)) {
        controllerCache.set(route.controller, readController(route.controller));
      }
      const info = controllerCache.get(route.controller)!.get(route.handler);
      if (!info) {
        throw new Error(
          `${route.method} ${route.path} points at ${route.handler}(), which is not exported from ${route.controller}.ts`
        );
      }

      const folder = CONTROLLER_FOLDERS[route.controller] ?? prettifyHandlerName(route.controller);
      const example = EXAMPLES[route.handler] ?? {};
      const variants: RequestExample[] = [example, ...(example.variants ?? [])];

      for (const variant of variants) {
        endpoints.push({
          folder,
          handler: route.handler,
          method: route.method,
          path: route.path,
          name: variant.name ?? prettifyHandlerName(route.handler),
          description: info.doc,
          params: info.params.map((param) =>
            resolveParamExample(param, variant.params?.[param.name])
          ),
          body: 'body' in variant ? variant.body : example.body,
          emptySites: info.emptySites,
          writtenSites: info.writtenSites,
        });
      }
    }
  }

  return endpoints;
}

// ---------------------------------------------------------------------------
// 5a. Emit the Postman collection (schema v2.1.0)
// ---------------------------------------------------------------------------

/** /api/users/:id/skills -> /api/users/{{userId}}/skills */
function pathSegments(path: string, folder: string): string[] {
  const variables = PATH_VARIABLES[folder] ?? {};
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      if (!segment.startsWith(':')) return segment;
      const name = segment.slice(1);
      return `{{${variables[name] ?? name}}}`;
    });
}

function buildCollection(endpoints: Endpoint[]): unknown {
  const folders = orderedFolders(endpoints);

  return {
    info: {
      name: 'Job Board API',
      description: collectionDescription(endpoints),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: COLLECTION_VARIABLES,
    item: folders.map((folder) => ({
      name: folder,
      item: endpoints
        .filter((endpoint) => endpoint.folder === folder)
        .map((endpoint) => {
          const segments = pathSegments(endpoint.path, endpoint.folder);
          const query = endpoint.params.map((param) => ({
            key: param.name,
            value: param.value,
            disabled: !param.enabled,
          }));
          const queryString = query
            .map((param) => `${param.key}=${param.value}`)
            .join('&');

          const request: Record<string, unknown> = {
            method: endpoint.method,
            header: endpoint.body === undefined
              ? []
              : [{ key: 'Content-Type', value: 'application/json' }],
            url: {
              raw: `{{baseUrl}}/${segments.join('/')}${queryString ? `?${queryString}` : ''}`,
              host: ['{{baseUrl}}'],
              path: segments,
              ...(query.length > 0 ? { query } : {}),
            },
          };

          if (endpoint.body !== undefined) {
            request.body = {
              mode: 'raw',
              raw: JSON.stringify(endpoint.body, null, 2),
              options: { raw: { language: 'json' } },
            };
          }

          return {
            name: endpoint.name,
            request: {
              ...request,
              description: requestDescription(endpoint),
            },
          };
        }),
    })),
  };
}

function orderedFolders(endpoints: Endpoint[]): string[] {
  const present = [...new Set(endpoints.map((endpoint) => endpoint.folder))];
  const known = FOLDER_ORDER.filter((folder) => present.includes(folder));
  const extra = present.filter((folder) => !FOLDER_ORDER.includes(folder));
  return [...known, ...extra];
}

function exerciseNote(endpoint: Endpoint): string | null {
  if (endpoint.emptySites === 0) return null;
  const [sites, verb] =
    endpoint.emptySites === 1 ? ['query', 'is'] : [`${endpoint.emptySites} queries`, 'are'];
  return `Exercise: the ${sites} behind this endpoint ${verb} still empty, so it answers with an empty result rather than an error.`;
}

function requestDescription(endpoint: Endpoint): string {
  const parts = [`\`${endpoint.method} ${endpoint.path}\``, endpoint.description];
  const note = exerciseNote(endpoint);
  if (note) parts.push(`_${note}_`);
  return parts.filter(Boolean).join('\n\n');
}

function collectionDescription(endpoints: Endpoint[]): string {
  const { written, total } = progress(endpoints);
  return [
    'HTTP requests for the SQL/PostgreSQL learning job board.',
    "Every controller ships with an empty query template — a `pool.query()` with nothing between its backticks. Writing that SQL is the exercise. Until a query is written its endpoint returns an empty result or the controller's own guard (404 / 409), never a crash, so requests can be checked one at a time as the queries land.",
    `Query sites written so far: **${written} of ${total}**.`,
    'Disabled query parameters are the optional filters — enable the ones to test. Enabled ones carry the default the controller applies.',
    'Generated from the source by `npm run postman`. Edit the code, not this file.',
  ].join('\n\n');
}

function progress(endpoints: Endpoint[]): { written: number; total: number } {
  const counted = new Set<string>();
  let written = 0;
  let total = 0;

  for (const endpoint of endpoints) {
    if (!endpoint.handler || counted.has(endpoint.handler)) continue;
    counted.add(endpoint.handler);
    written += endpoint.writtenSites;
    total += endpoint.writtenSites + endpoint.emptySites;
  }
  return { written, total };
}

// ---------------------------------------------------------------------------
// 5b. Emit docs/API.md — the same information, readable without Postman
// ---------------------------------------------------------------------------

function buildMarkdown(endpoints: Endpoint[]): string {
  const folders = orderedFolders(endpoints);
  const { written, total } = progress(endpoints);
  const out: string[] = [];

  out.push('# API reference');
  out.push('');
  out.push(
    '<!-- Generated by `npm run postman` from src/routes and src/controllers. Do not edit by hand. -->'
  );
  out.push('');
  out.push(
    `${endpoints.length} requests across ${folders.length} resources. Every description below is the comment written above that handler in \`src/controllers/\`.`
  );
  out.push('');
  out.push(
    `**SQL progress: ${written} of ${total} query sites written.** Endpoints marked ⬜ still have an empty query template — that is the exercise, not a bug.`
  );
  out.push('');
  out.push('## Contents');
  out.push('');
  for (const folder of folders) {
    const count = endpoints.filter((endpoint) => endpoint.folder === folder).length;
    out.push(`- [${folder}](#${anchor(folder)}) — ${count} request${count === 1 ? '' : 's'}`);
  }

  for (const folder of folders) {
    out.push('');
    out.push(`## ${folder}`);

    for (const endpoint of endpoints.filter((e) => e.folder === folder)) {
      const mark = endpoint.emptySites > 0 ? '⬜' : '✅';
      out.push('');
      out.push(`### ${mark} \`${endpoint.method} ${endpoint.path}\` — ${endpoint.name}`);
      out.push('');
      if (endpoint.handler) {
        out.push(`Handler: \`${endpoint.handler}()\``);
        out.push('');
      }
      if (endpoint.description) {
        out.push(endpoint.description);
        out.push('');
      }

      if (endpoint.params.length > 0) {
        out.push('| Query parameter | Default | Example |');
        out.push('| --- | --- | --- |');
        for (const param of endpoint.params) {
          const fallback = param.default === null ? '—' : `\`${param.default}\``;
          const value = param.enabled && param.value !== '' ? `\`${param.value}\`` : '—';
          out.push(`| \`${param.name}\` | ${fallback} | ${value} |`);
        }
        out.push('');
      }

      if (endpoint.body !== undefined) {
        out.push('```json');
        out.push(JSON.stringify(endpoint.body, null, 2));
        out.push('```');
        out.push('');
      }

      const note = exerciseNote(endpoint);
      if (note) {
        out.push(`> ${note}`);
        out.push('');
      }
    }
  }

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function anchor(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function writeIfChanged(path: string, contents: string, check: boolean): boolean {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (existing === contents) return false;
  if (!check) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  }
  return true;
}

function main(): void {
  const check = process.argv.includes('--check');
  const endpoints = buildEndpoints();
  const { written, total } = progress(endpoints);

  const collection = `${JSON.stringify(buildCollection(endpoints), null, 2)}\n`;
  const markdown = buildMarkdown(endpoints);

  const stale = [
    writeIfChanged(COLLECTION_PATH, collection, check),
    writeIfChanged(MARKDOWN_PATH, markdown, check),
  ].some(Boolean);

  const folders = orderedFolders(endpoints).length;

  if (check) {
    if (stale) {
      console.error('API docs are out of date. Run `npm run postman` and commit the result.');
      process.exit(1);
    }
    console.log(`API docs are up to date (${endpoints.length} requests).`);
    return;
  }

  console.log(`postman/job-board.postman_collection.json  ${endpoints.length} requests, ${folders} folders`);
  console.log(`docs/API.md                                ${endpoints.length} requests documented`);
  console.log(`SQL progress                               ${written} of ${total} query sites written`);
}

main();
