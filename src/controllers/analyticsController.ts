// ============================================================================
// analyticsController — reporting
// ============================================================================
// Nothing here writes anything. Every endpoint answers a question the tables do
// not store directly: distributions, activity over time, rankings within
// groups, and where candidates drop out of the process.
// ============================================================================

import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import { handleDbError, queryEnum, queryInt, queryString } from '../utils/http.js';
import type {
  CompanyTopJobRow,
  OverviewStatsRow,
  SalaryBenchmarkRow,
  TimeSeriesPointRow,
} from '../types/database.js';

// ----------------------------------------------------------------------------
// GET /api/analytics/overview
// ----------------------------------------------------------------------------
// The admin dashboard header.
//
// Every headline number about the platform in one response: users split by
// role, companies, postings split by live/draft/closed, total applications,
// applications in the last week, the average number of applications a live
// posting receives, and how many postings have received none at all.
//
// Eleven numbers from five tables, and the dashboard should not need eleven
// trips to the database to draw them.
export async function getOverview(_req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<OverviewStatsRow> = await pool.query<OverviewStatsRow>(``);

    res.json(result.rows[0] ?? null);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get overview', 'Failed to fetch overview');
  }
}

// ----------------------------------------------------------------------------
// GET /api/analytics/salary-benchmarks
// ----------------------------------------------------------------------------
// "What does this kind of role pay?" — the report candidates come to a job
// board for.
//
// Salary distribution grouped by experience level, employment type or location.
// Report the middle of the range and the quarter-points, not just the average:
// one unusually high posting drags an average upwards and misleads everyone
// reading it.
//
// Postings that do not list a salary must be left out of the maths entirely,
// not counted as zero. Do not publish a benchmark for a group with only one or
// two postings in it — a "typical salary" drawn from a single posting is worse
// than no number at all.
export async function getSalaryBenchmarks(req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<SalaryBenchmarkRow> = await pool.query<SalaryBenchmarkRow>(``, [
      queryEnum(
        req.query.group_by,
        ['experience_level', 'employment_type', 'location'] as const
      ) ?? 'experience_level',
      queryInt(req.query.min_sample) ?? 2,
      queryEnum(req.query.live_only, ['true', 'false'] as const) !== 'false',
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get salary benchmarks', 'Failed to fetch benchmarks');
  }
}

// ----------------------------------------------------------------------------
// GET /api/analytics/applications-over-time
// ----------------------------------------------------------------------------
// The activity chart: applications per day, week or month over a chosen stretch
// of history, either platform-wide or for one company.
//
// Quiet periods must appear as zeros. A chart drawn from data that simply omits
// the empty days will join the last busy day to the next one and invent
// activity that never happened.
export async function getApplicationsOverTime(req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<TimeSeriesPointRow> = await pool.query<TimeSeriesPointRow>(``, [
      queryInt(req.query.days) ?? 30,
      queryEnum(req.query.bucket, ['day', 'week', 'month'] as const) ?? 'day',
      queryString(req.query.company_id),
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get applications over time', 'Failed to fetch time series');
  }
}

// ----------------------------------------------------------------------------
// GET /api/analytics/top-jobs-per-company
// ----------------------------------------------------------------------------
// The most-applied-to postings at EACH company — not the top few overall, so a
// small employer is not buried under a large one.
//
// Every company that has any applications contributes its own best few.
// Postings with no applications do not appear. Decide what should happen when
// two postings at the same company are tied.
export async function getTopJobsPerCompany(req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<CompanyTopJobRow> = await pool.query<CompanyTopJobRow>(``, [
      queryInt(req.query.per_company) ?? 3,
      queryEnum(req.query.live_only, ['true', 'false'] as const) !== 'false',
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get top jobs per company', 'Failed to fetch top jobs');
  }
}

// ----------------------------------------------------------------------------
// GET /api/analytics/conversion
// ----------------------------------------------------------------------------
// "Where do candidates drop out?"
//
// For each stage of the pipeline, how many applications ever reached it, and
// what share of the previous stage that represents. Optionally scoped to one
// company or to a recent window of time.
//
// The catch: an application's current stage cannot answer this. Someone sitting
// at "rejected" today may well have been interviewed on the way there, so
// counting current stages undercounts every stage before the last one. The
// answer is in the application history, which records every stage an
// application ever reached.
//
// Rejection and withdrawal are exits rather than stages, so keep them out of
// the chain or the percentages stop making sense.
export async function getConversionRates(req: Request, res: Response): Promise<void> {
  const chainedStages = ['pending', 'reviewing', 'interview', 'offer', 'accepted'] as const;

  try {
    const result: QueryResult<{
      stage: string;
      reached_count: string;
      conversion_from_previous_pct: string | null;
    }> = await pool.query(``, [
      queryString(req.query.company_id),
      queryInt(req.query.days),
      chainedStages,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get conversion rates', 'Failed to fetch conversion rates');
  }
}

// ----------------------------------------------------------------------------
// GET /api/analytics/time-to-hire
// ----------------------------------------------------------------------------
// "How long does our process actually take?"
//
// For applications that reached a decision, how long each step of the process
// took — the gap between one stage and the next, summarised across every
// application, platform-wide or for one company.
//
// Report the typical duration rather than the average: a single application
// that sat untouched for six months would dominate an average and describe
// nobody's experience. Applications still in progress have no end date and must
// be left out rather than treated as ending today.
export async function getTimeToHire(req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<{
      transition: string;
      sample_size: string;
      median_days: string | null;
      avg_days: string | null;
    }> = await pool.query(``, [
      queryString(req.query.company_id),
      queryInt(req.query.min_sample) ?? 1,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get time to hire', 'Failed to fetch time-to-hire stats');
  }
}
