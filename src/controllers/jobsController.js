const { pool } = require('../db');

// GET /api/jobs
// Returns every job, newest first.
//
// This is intentionally the simplest possible query — its job is to prove the
// route + database wiring works. As you learn, extend it: filter by location
// with WHERE, search titles with ILIKE $1, JOIN the company name, add
// LIMIT/OFFSET pagination, etc.
async function listJobs(req, res) {
  try {
    const result = await pool.query(
      `
        SELECT id, company_id, title, description,
               salary_min, salary_max, location, created_at
        FROM jobs
        ORDER BY created_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to list jobs:', err.message);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
}

module.exports = { listJobs };
