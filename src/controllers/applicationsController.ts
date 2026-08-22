import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import type { ApplicationRow } from '../types/database.js';

export async function listApplications(_req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<ApplicationRow> = await pool.query(`
      SELECT id, job_id, user_id, status, applied_at
      FROM applications
      ORDER BY applied_at DESC
    `);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to list applications:', message);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
}
