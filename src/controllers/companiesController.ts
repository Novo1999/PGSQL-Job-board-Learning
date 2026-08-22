import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import type { CompanyRow } from '../types/database.js';

export async function listCompanies(_req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<CompanyRow> = await pool.query(`
      SELECT id, name, description, created_at
      FROM companies
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to list companies:', message);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
}
