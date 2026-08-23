// ============================================================================
// companiesController — the employer side of the board
// ============================================================================
// A company is owned by an employer and owns its job postings. Most of what
// this file returns is some number rolled up per company: how many postings,
// how many applications, what they pay.
// ============================================================================

import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import {
  handleDbError,
  pagination,
  paginated,
  queryBool,
  queryEnum,
  queryInt,
  queryString,
} from '../utils/http.js';
import {
  JOB_STATUSES,
  type CompanyDetailRow,
  type CompanyListItemRow,
  type CompanyRow,
  type CreateCompanyInput,
  type FunnelStageRow,
  type JobListItemRow,
  type SalaryBandRow,
  type TopCompanyRow,
  type UpdateCompanyInput,
  APPLICATION_STATUSES,
} from '../types/database.js';

type IdParams = { id: string };

// ----------------------------------------------------------------------------
// GET /api/companies
// ----------------------------------------------------------------------------
// The company directory.
//
// A browsable list of employers showing how many live postings each one has,
// searchable by name and filterable by industry.
//
// A company that is not hiring right now still belongs in the directory, with a
// count of zero — dropping it would make the platform look emptier than it is.
// There is also a "hiring now" view that shows only companies with something
// live.
export async function listCompanies(req: Request, res: Response): Promise<void> {
  const page = pagination(req.query);

  try {
    const result: QueryResult<CompanyListItemRow> = await pool.query<CompanyListItemRow>(``, [
      queryString(req.query.q),
      queryString(req.query.industry),
      queryBool(req.query.hiring_only) ?? false,
      page.limit,
      page.offset,
    ]);

    res.json(paginated(result.rows, page));
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to list companies', 'Failed to fetch companies');
  }
}

// ----------------------------------------------------------------------------
// GET /api/companies/top
// ----------------------------------------------------------------------------
// "Most active employers" for the homepage.
//
// Rank companies by recent hiring activity: live postings, applications
// received in the last N days, and how many people they actually hired. Only
// count recent applications, so a company that was busy a year ago does not sit
// at the top forever, and leave out companies below a minimum level of activity.
export async function getTopHiringCompanies(req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<TopCompanyRow> = await pool.query<TopCompanyRow>(``, [
      queryInt(req.query.days) ?? 30,
      queryInt(req.query.min_applications) ?? 1,
      queryInt(req.query.limit) ?? 10,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get top companies', 'Failed to fetch top companies');
  }
}

// ----------------------------------------------------------------------------
// GET /api/companies/:id
// ----------------------------------------------------------------------------
// The company profile page.
//
// The company, who owns it, and its headline numbers: live postings, total
// postings, applications received, and the average salary range it advertises.
//
// A company can have no owner, and some of its postings may not list a salary
// at all. Neither should make the profile disappear or the averages lie.
export async function getCompanyById(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<CompanyDetailRow> = await pool.query<CompanyDetailRow>(``, [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get company', 'Failed to fetch company');
  }
}

// ----------------------------------------------------------------------------
// GET /api/companies/:id/jobs
// ----------------------------------------------------------------------------
// The postings on a company profile.
//
// Serves two audiences from one endpoint: the public sees only live postings,
// while the employer looking at their own company sees everything, including
// drafts and archived ones, and can filter by status.
export async function listCompanyJobs(req: Request<IdParams>, res: Response): Promise<void> {
  const page = pagination(req.query);

  try {
    const result: QueryResult<JobListItemRow> = await pool.query<JobListItemRow>(``, [
      req.params.id,
      queryBool(req.query.include_all_statuses) ?? false,
      queryEnum(req.query.status, JOB_STATUSES),
      page.limit,
      page.offset,
    ]);

    res.json(paginated(result.rows, page));
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to list company jobs', 'Failed to fetch company jobs');
  }
}

// ----------------------------------------------------------------------------
// GET /api/companies/:id/funnel
// ----------------------------------------------------------------------------
// One company's hiring funnel.
//
// How many applications sit at each stage and what share of the total each one
// represents, either across the whole company or for a single posting so the
// employer can compare one role against their average.
//
// Every stage appears, in pipeline order, including the empty ones.
export async function getCompanyFunnel(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<FunnelStageRow> = await pool.query<FunnelStageRow>(``, [
      req.params.id,
      queryString(req.query.job_id),
      APPLICATION_STATUSES,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get company funnel', 'Failed to fetch funnel');
  }
}

// ----------------------------------------------------------------------------
// GET /api/companies/:id/salary-bands
// ----------------------------------------------------------------------------
// "How do our own roles compare to each other?"
//
// List a company's postings ranked by pay, and for each one show how far it
// sits above or below that company's own average. Optionally compare against
// the whole market instead of just this company.
//
// Postings with no salary listed need a sensible place in the ranking — decide
// where, rather than letting them land at the top by accident.
export async function getCompanySalaryBands(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<SalaryBandRow> = await pool.query<SalaryBandRow>(``, [
      req.params.id,
      queryBool(req.query.market_wide) ?? false,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get salary bands', 'Failed to fetch salary bands');
  }
}

// ----------------------------------------------------------------------------
// POST /api/companies
// ----------------------------------------------------------------------------
// Register a company.
//
// An employer creates the company they will post jobs under. The owner has to
// be a real user with the employer role — a candidate cannot own a company.
export async function createCompany(
  req: Request<Record<string, never>, unknown, CreateCompanyInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<CompanyRow> = await pool.query<CompanyRow>(``, [
      req.body.owner_id,
      req.body.name,
      req.body.description ?? null,
      req.body.website ?? null,
      req.body.industry ?? null,
      req.body.headquarters ?? null,
    ]);

    if (result.rows.length === 0) {
      res.status(400).json({ error: 'owner_id must belong to a user with the employer role' });
      return;
    }

    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to create company', 'Failed to create company');
  }
}

// ----------------------------------------------------------------------------
// PATCH /api/companies/:id
// ----------------------------------------------------------------------------
// Edit a company profile. Only the submitted fields change.
//
// Ownership is not editable here — transferring a company to someone else is a
// separate, deliberate action, not a field on the edit form.
export async function updateCompany(
  req: Request<IdParams, unknown, UpdateCompanyInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<CompanyRow> = await pool.query<CompanyRow>(``, [
      req.params.id,
      req.body.name ?? null,
      req.body.description ?? null,
      req.body.website ?? null,
      req.body.industry ?? null,
      req.body.headquarters ?? null,
    ]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to update company', 'Failed to update company');
  }
}

// ----------------------------------------------------------------------------
// DELETE /api/companies/:id
// ----------------------------------------------------------------------------
// Remove a company.
//
// The most destructive thing the API can do: everything hanging off the company
// goes with it — its postings, their applications, and those applications'
// histories.
//
// Because of that, refuse by default if the company still has live postings.
// Deleting a company out from under people who are mid-application is not
// something an API should do quietly. ?force=true overrides it.
//
// Before trying this on the seed data, count the rows in the other tables.
// Delete Initech and count again.
export async function deleteCompany(req: Request<IdParams>, res: Response): Promise<void> {
  const force = queryBool(req.query.force) === true;

  try {
    const result: QueryResult<Pick<CompanyRow, 'id'>> = await pool.query<Pick<CompanyRow, 'id'>>(
      ``,
      [req.params.id, force]
    );

    if (result.rows.length === 0) {
      res.status(409).json({
        error: 'Company not found, or it still has live job postings (use ?force=true to override)',
      });
      return;
    }

    res.json({ id: result.rows[0]?.id, deleted: true });
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to delete company', 'Failed to delete company');
  }
}
