const { pool } = require('../db');

// GET /api/users
// Returns every user, newest first.
async function listUsers(req, res) {
  try {
    const result = await pool.query(
      `
        SELECT id, name, email, role, created_at
        FROM users
        ORDER BY created_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to list users:', err.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

module.exports = { listUsers };
