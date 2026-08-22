const { pool } = require('../db');

// GET /api/applications
// Returns every application, newest first.
async function listApplications(req, res) {
  try {
    const result = await pool.query(
      `
        SELECT id, job_id, user_id, status, applied_at
        FROM applications
        ORDER BY applied_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to list applications:', err.message);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
}

module.exports = { listApplications };
