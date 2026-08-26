// ============================================================================
// db.ts — load the schema and the seed data without needing psql on PATH
// ============================================================================
//   npm run db:schema    drop and recreate every table, constraint and index
//   npm run db:seed      truncate and reload the sample rows
//   npm run db:reset     both, in that order
//
// `psql -d job_board -f sql/schema.sql` does exactly the same thing and is
// still the documented way to do it. This exists so that someone cloning the
// repo on Windows, where psql is often not on PATH, is one command away from a
// working database instead of one PATH edit away.
//
// Neither file contains psql meta-commands (\c, \i, \copy), so sending them
// through node-postgres as one multi-statement query is equivalent.
// ============================================================================

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FILES: Record<string, string> = {
  schema: 'schema.sql',
  seed: 'seed.sql',
};

async function run(step: string): Promise<void> {
  const file = FILES[step];
  if (!file) throw new Error(`Unknown step "${step}". Expected: ${Object.keys(FILES).join(', ')}`);

  const sql = readFileSync(join(ROOT, 'sql', file), 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query(sql);
    console.log(`sql/${file}  applied`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const steps = process.argv.slice(2);
  if (steps.length === 0) {
    console.error('Usage: tsx scripts/db.ts <schema|seed> [...]');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and point it at your database.');
    process.exit(1);
  }

  for (const step of steps) {
    await run(step);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
