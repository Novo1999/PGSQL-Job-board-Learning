// ============================================================================
// Request-parsing helpers
// ============================================================================
// There is deliberately NO SQL in this file. Its only job is to turn untrusted
// Express input (`req.query`, `req.body`) into values that are safe to hand to
// pool.query() as $1, $2, ... parameters.
//
// Why this file exists at all, given the project rule that SQL stays visible at
// the call site: without it, every controller would open with fifteen lines of
// `typeof x === 'string' ? ... : ...` noise, and the SQL would be buried. The
// helpers keep the controllers thin so the query stays the thing you read.
//
// The convention throughout: a missing or unparseable value becomes `null`,
// never `undefined` and never a thrown error. `null` reaches PostgreSQL as SQL
// NULL, which lets a single query express an optional filter:
//
//     WHERE ($1::text IS NULL OR location ILIKE $1)
//
// One query, one plan, no string concatenation, no SQL injection.
// ============================================================================

import type { Request, Response } from 'express';

// Express gives query values as string | string[] | ParsedQs | ParsedQs[].
// Take the first usable string and ignore anything structured.
export function queryString(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function queryInt(value: unknown): number | null {
  const raw = queryString(value);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// Accepts true/false, 1/0, yes/no. Anything else is "not specified".
export function queryBool(value: unknown): boolean | null {
  const raw = queryString(value)?.toLowerCase();
  if (raw === undefined || raw === null) return null;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return null;
}

// Only lets through values the database's CHECK constraint would accept, so a
// bad value becomes "no filter" instead of a 500 from PostgreSQL.
export function queryEnum<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  const raw = queryString(value);
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

// Parses `?skill=1,2,3` and `?skill=1&skill=2` alike into ['1','2','3'].
// Ids stay STRINGS: they are BIGINT in PostgreSQL, and `= ANY($1::bigint[])`
// casts them back on the database side without any precision loss in JS.
export function queryIdList(value: unknown): string[] | null {
  const values = Array.isArray(value) ? value : [value];
  const ids = values
    .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
    .map((entry) => entry.trim())
    .filter((entry) => /^\d+$/.test(entry));
  return ids.length > 0 ? ids : null;
}

export interface Pagination {
  limit: number;
  offset: number;
  page: number;
}

// Clamped so a caller cannot ask for `?limit=1000000` and pull the whole table.
export function pagination(
  query: Request['query'],
  defaultLimit = 20,
  maxLimit = 100
): Pagination {
  const limit = Math.min(Math.max(queryInt(query.limit) ?? defaultLimit, 1), maxLimit);
  const page = Math.max(queryInt(query.page) ?? 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}

// Every list endpoint answers with the same envelope so clients can paginate
// without special-casing. `total` comes from the COUNT(*) OVER () column in the
// query itself — which is why it is read off the first row rather than fetched
// separately.
export function paginated<T extends { total_count?: string }>(
  rows: T[],
  { limit, page }: Pagination
): { data: T[]; page: number; limit: number; total: number; total_pages: number } {
  const total = rows.length > 0 ? Number(rows[0]?.total_count ?? rows.length) : 0;
  return {
    data: rows,
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}

// --------------------------------------------------------------------------
// PostgreSQL error codes
// --------------------------------------------------------------------------
// The database enforces the real rules (UNIQUE, FOREIGN KEY, CHECK). When it
// rejects a write it raises a SQLSTATE code, and mapping that code to the right
// HTTP status is how a constraint becomes a good API error instead of a 500.
//
//   23505  unique_violation      -> 409 Conflict   (already applied to this job)
//   23503  foreign_key_violation -> 400/404        (job_id points nowhere)
//   23514  check_violation       -> 400            (salary_min > salary_max)
//   23502  not_null_violation    -> 400            (required field missing)

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
}

function pgErrorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null ? (err as PgError).code : undefined;
}

export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23505';
}

export function isForeignKeyViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23503';
}

export function isCheckViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23514';
}

export function isNotNullViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23502';
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// The default catch-all used by every controller. Constraint violations are the
// database telling us the *client* was wrong, so they become 4xx; anything else
// is our bug and becomes a 500.
export function handleDbError(
  err: unknown,
  res: Response,
  context: string,
  fallbackMessage: string
): void {
  const message = errorMessage(err);
  console.error(`${context}:`, message);

  if (isCheckViolation(err) || isNotNullViolation(err)) {
    res.status(400).json({ error: 'Request violates a database constraint', detail: message });
    return;
  }
  if (isForeignKeyViolation(err)) {
    res.status(400).json({ error: 'Referenced record does not exist', detail: message });
    return;
  }
  if (isUniqueViolation(err)) {
    res.status(409).json({ error: 'Record already exists', detail: message });
    return;
  }
  res.status(500).json({ error: fallbackMessage });
}
