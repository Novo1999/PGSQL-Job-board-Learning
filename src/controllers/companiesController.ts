import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import type {
  CompanyRow,
  CreateCompanyInput,
  UpdateCompanyInput,
} from '../types/database.js';

type IdParams = { id: string };

export async function listCompanies(_req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<CompanyRow> = await pool.query<CompanyRow>(``);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to list companies:', message);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
}

export async function getCompanyById(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<CompanyRow> = await pool.query<CompanyRow>(``, [req.params.id]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to get company:', message);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
}

export async function createCompany(
  req: Request<{}, unknown, CreateCompanyInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<CompanyRow> = await pool.query<CompanyRow>(``, [
      req.body.name,
      req.body.description,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to create company:', message);
    res.status(500).json({ error: 'Failed to create company' });
  }
}

export async function updateCompany(
  req: Request<IdParams, unknown, UpdateCompanyInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<CompanyRow> = await pool.query<CompanyRow>(``, [
      req.params.id,
      req.body.name,
      req.body.description,
    ]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to update company:', message);
    res.status(500).json({ error: 'Failed to update company' });
  }
}

export async function deleteCompany(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<Pick<CompanyRow, 'id'>> =
      await pool.query<Pick<CompanyRow, 'id'>>(``, [req.params.id]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to delete company:', message);
    res.status(500).json({ error: 'Failed to delete company' });
  }
}
