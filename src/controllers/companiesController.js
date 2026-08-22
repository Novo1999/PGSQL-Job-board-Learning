const { pool } = require('../db');

// GET /api/companies
// Returns every company, newest first.
async function listCompanies(req, res) {
  try {
    const result = await pool.query(
      `
        SELECT id, name, description, created_at
        FROM companies
        ORDER BY created_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to list companies:', err.message);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
}

module.exports = { listCompanies };
