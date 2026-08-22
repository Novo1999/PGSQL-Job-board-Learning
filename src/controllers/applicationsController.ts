import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import type {
  ApplicationRow,
  CreateApplicationInput,
  UpdateApplicationInput,
} from '../types/database.js';

type IdParams = { id: string };

export async function listApplications(_req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<ApplicationRow> = await pool.query<ApplicationRow>(``);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to list applications:', message);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
}

export async function getApplicationById(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<ApplicationRow> = await pool.query<ApplicationRow>(``, [
      req.params.id,
    ]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to get application:', message);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
}

export async function createApplication(
  req: Request<{}, unknown, CreateApplicationInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<ApplicationRow> = await pool.query<ApplicationRow>(``, [
      req.body.job_id,
      req.body.user_id,
      req.body.status,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to create application:', message);
    res.status(500).json({ error: 'Failed to create application' });
  }
}

export async function updateApplication(
  req: Request<IdParams, unknown, UpdateApplicationInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<ApplicationRow> = await pool.query<ApplicationRow>(``, [
      req.params.id,
      req.body.status,
    ]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to update application:', message);
    res.status(500).json({ error: 'Failed to update application' });
  }
}

export async function deleteApplication(
  req: Request<IdParams>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<Pick<ApplicationRow, 'id'>> =
      await pool.query<Pick<ApplicationRow, 'id'>>(``, [req.params.id]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to delete application:', message);
    res.status(500).json({ error: 'Failed to delete application' });
  }
}
