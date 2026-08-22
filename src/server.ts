// ============================================================================
// Express server entry point
// ============================================================================

// Load environment variables before importing db.ts, which reads DATABASE_URL.
import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import { pool } from './db.js';

import jobsRouter from './routes/jobs.js';
import usersRouter from './routes/users.js';
import companiesRouter from './routes/companies.js';
import applicationsRouter from './routes/applications.js';

const app = express();

app.use(express.json());

app.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Health check failed - database unreachable:', message);
    res.status(500).json({ status: 'error', db: 'unreachable' });
  }
});

app.use('/api/jobs', jobsRouter);
app.use('/api/users', usersRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/applications', applicationsRouter);

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

app.listen(port, () => {
  console.log(`Job Board API listening on http://localhost:${port}`);
  console.log(`Health check:  http://localhost:${port}/health`);
});
