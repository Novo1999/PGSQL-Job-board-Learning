import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import type { JobRow } from '../types/database.js';

export async function listJobs(_req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<JobRow> = await pool.query(`
      SELECT id, company_id, title, description,
             salary_min, salary_max, location, created_at
      FROM jobs
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to list jobs:', message);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
}

export async function getJobById(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: 'Job id must be a positive integer' });
    return;
  }

  try {
    const result: QueryResult<JobRow> = await pool.query(
      `
        SELECT id, company_id, title, description,
               salary_min, salary_max, location, created_at
        FROM jobs
        WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to fetch job:', message);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
}
