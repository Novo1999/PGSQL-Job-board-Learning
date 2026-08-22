import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import type { UserRow } from '../types/database.js';

export async function listUsers(_req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<UserRow> = await pool.query(`
      SELECT id, name, email, role, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to list users:', message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}
