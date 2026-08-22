import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import type { CreateJobInput, JobRow, UpdateJobInput } from '../types/database.js';

type IdParams = { id: string };

export async function listJobs(_req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<JobRow> = await pool.query<JobRow>(``);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to list jobs:', message);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
}

export async function getJobById(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<JobRow> = await pool.query<JobRow>(``, [req.params.id]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to get job:', message);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
}

export async function createJob(
  req: Request<{}, unknown, CreateJobInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<JobRow> = await pool.query<JobRow>(``, [
      req.body.company_id,
      req.body.title,
      req.body.description,
      req.body.salary_min,
      req.body.salary_max,
      req.body.location,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to create job:', message);
    res.status(500).json({ error: 'Failed to create job' });
  }
}

export async function updateJob(
  req: Request<IdParams, unknown, UpdateJobInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<JobRow> = await pool.query<JobRow>(``, [
      req.params.id,
      req.body.company_id,
      req.body.title,
      req.body.description,
      req.body.salary_min,
      req.body.salary_max,
      req.body.location,
    ]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to update job:', message);
    res.status(500).json({ error: 'Failed to update job' });
  }
}

export async function deleteJob(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<Pick<JobRow, 'id'>> = await pool.query<Pick<JobRow, 'id'>>(``, [
      req.params.id,
    ]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to delete job:', message);
    res.status(500).json({ error: 'Failed to delete job' });
  }
}
