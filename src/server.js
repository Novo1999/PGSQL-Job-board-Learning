// ============================================================================
// Express server entry point
// ============================================================================

// Load environment variables FIRST, before anything that reads process.env
// (db.js builds the pool from DATABASE_URL at require time).
require('dotenv').config();

const express = require('express');
const { pool } = require('./db');

const jobsRouter = require('./routes/jobs');
const usersRouter = require('./routes/users');
const companiesRouter = require('./routes/companies');
const applicationsRouter = require('./routes/applications');

const app = express();

// Parse JSON request bodies (for the POST/PUT endpoints you'll add later).
app.use(express.json());

// ----------------------------------------------------------------------------
// Health check
// ----------------------------------------------------------------------------
// Confirms two things: the HTTP server is up, and PostgreSQL is reachable.
// `SELECT 1` is the cheapest possible query — it just proves we can talk to the
// database.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    console.error('Health check failed — database unreachable:', err.message);
    res.status(500).json({ status: 'error', db: 'unreachable' });
  }
});

// ----------------------------------------------------------------------------
// API routes
// ----------------------------------------------------------------------------
app.use('/api/jobs', jobsRouter);
app.use('/api/users', usersRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/applications', applicationsRouter);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Job Board API listening on http://localhost:${port}`);
  console.log(`Health check:  http://localhost:${port}/health`);
});
