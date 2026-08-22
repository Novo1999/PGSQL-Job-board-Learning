import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import type { CreateUserInput, UpdateUserInput, UserRow } from '../types/database.js';

type IdParams = { id: string };

export async function listUsers(_req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<UserRow> = await pool.query<UserRow>(``);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to list users:', message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

export async function getUserById(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<UserRow> = await pool.query<UserRow>(``, [req.params.id]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to get user:', message);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

export async function createUser(
  req: Request<{}, unknown, CreateUserInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<UserRow> = await pool.query<UserRow>(``, [
      req.body.name,
      req.body.email,
      req.body.role,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to create user:', message);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

export async function updateUser(
  req: Request<IdParams, unknown, UpdateUserInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<UserRow> = await pool.query<UserRow>(``, [
      req.params.id,
      req.body.name,
      req.body.email,
      req.body.role,
    ]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to update user:', message);
    res.status(500).json({ error: 'Failed to update user' });
  }
}

export async function deleteUser(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<Pick<UserRow, 'id'>> = await pool.query<Pick<UserRow, 'id'>>(``, [
      req.params.id,
    ]);
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to delete user:', message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
}
