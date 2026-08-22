// ============================================================================
// PostgreSQL connection pool
// ============================================================================
// We create ONE connection pool for the whole application and reuse it for
// every query. A pool keeps a small set of TCP connections open and hands them
// out as needed — this is far cheaper than opening a brand new connection for
// each request.
//
// IMPORTANT: dotenv must be configured BEFORE this file is required, because the
// Pool reads process.env.DATABASE_URL at construction time. server.js calls
// require('dotenv').config() as its very first line, so we are covered.
// ============================================================================

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// If an idle client in the pool errors out (e.g. the database restarts), log it
// loudly rather than letting the process fail silently.
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
  process.exit(1);
});

// Export the pool directly. Throughout the app we call pool.query(sql, params)
// so that the SQL is always visible at the call site — no query-builder or ORM
// hiding it.
module.exports = { pool };
