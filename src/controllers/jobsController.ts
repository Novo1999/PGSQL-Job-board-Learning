// ============================================================================
// jobsController — job postings
// ============================================================================
// A posting is LIVE, meaning candidates can see it, when its status is 'open'
// and it has not expired. Candidate-facing endpoints show only live postings.
// Employer-facing endpoints show everything, because an employer still needs
// their drafts, closed and expired postings.
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
  queryIdList,
  queryInt,
  queryString,
} from '../utils/http.js';
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  JOB_STATUSES,
  type ApplicationStatus,
  type CreateJobInput,
  type ExpiringJobRow,
  type JobApplicantRow,
  type JobDetailRow,
  type JobListItemRow,
  type JobRow,
  type JobSkillDetailRow,
  type JobViewStatsRow,
  type PublishJobInput,
  type RecordJobViewInput,
  type SetJobSkillsInput,
  type TrendingJobRow,
  type UpdateJobInput,
  APPLICATION_STATUSES,
} from '../types/database.js';

type IdParams = { id: string };

const SORT_KEYS = ['newest', 'oldest', 'salary_high', 'salary_low', 'relevance'] as const;

// ----------------------------------------------------------------------------
// GET /api/jobs
// ----------------------------------------------------------------------------
// The public job board.
//
// Candidates browse live postings and narrow them down with a search box and a
// set of filters: keyword, location, remote-only, employment type, experience
// level, salary range, required skills, company, and how recently the job was
// posted. Every filter is optional and they combine.
//
// Results are paginated and can be sorted by newest, oldest, highest salary,
// lowest salary, or best match for the search term. Each result shows the
// company name and how many people have already applied, and the response
// includes the total number of matches so the client can page through them.
//
// Some postings have no salary listed. Decide what should happen to those when
// a candidate filters by salary.
export async function browseJobs(req: Request, res: Response): Promise<void> {
  const page = pagination(req.query);

  try {
    const result: QueryResult<JobListItemRow> = await pool.query<JobListItemRow>(``, [
      queryString(req.query.q),
      queryString(req.query.location),
      queryBool(req.query.remote),
      queryEnum(req.query.employment_type, EMPLOYMENT_TYPES),
      queryEnum(req.query.experience_level, EXPERIENCE_LEVELS),
      queryInt(req.query.min_salary),
      queryInt(req.query.max_salary),
      queryIdList(req.query.skill),
      queryString(req.query.company_id),
      queryInt(req.query.posted_within_days),
      queryEnum(req.query.sort, SORT_KEYS) ?? 'newest',
      page.limit,
      page.offset,
    ]);

    res.json(paginated(result.rows, page));
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to browse jobs', 'Failed to fetch jobs');
  }
}

// ----------------------------------------------------------------------------
// GET /api/jobs/trending
// ----------------------------------------------------------------------------
// "Trending this week" on the homepage.
//
// Rank live postings by how many times they were viewed in the last few days,
// and show whether that attention is rising or falling compared with the same
// stretch of time before it. Postings nobody has looked at recently are left
// out entirely.
export async function getTrendingJobs(req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<TrendingJobRow> = await pool.query<TrendingJobRow>(``, [
      queryInt(req.query.days) ?? 7,
      queryInt(req.query.limit) ?? 10,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get trending jobs', 'Failed to fetch trending jobs');
  }
}

// ----------------------------------------------------------------------------
// GET /api/jobs/expiring
// ----------------------------------------------------------------------------
// "Your postings are about to expire."
//
// Warn an employer about open postings that will expire within the next few
// days, soonest first, so they can renew them before they quietly disappear
// from the board. Show how many days each one has left and how many
// applications it has collected. Postings that have already expired are a
// different problem and are not included.
//
// Works for a single company, or across the whole platform for an admin view.
export async function getExpiringJobs(req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<ExpiringJobRow> = await pool.query<ExpiringJobRow>(``, [
      queryInt(req.query.days) ?? 7,
      queryString(req.query.company_id),
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get expiring jobs', 'Failed to fetch expiring jobs');
  }
}

// ----------------------------------------------------------------------------
// GET /api/jobs/:id
// ----------------------------------------------------------------------------
// The job detail page.
//
// One posting with everything needed to render it: the job itself, the company
// it belongs to, how many people have applied, and how many have bookmarked it.
//
// This endpoint serves both candidates and employers, so it returns a posting
// whatever its status and lets the caller decide what to do with it. An id that
// does not exist is a 404.
export async function getJobById(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<JobDetailRow> = await pool.query<JobDetailRow>(``, [req.params.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get job', 'Failed to fetch job');
  }
}

// ----------------------------------------------------------------------------
// GET /api/jobs/:id/similar
// ----------------------------------------------------------------------------
// "Similar jobs" at the bottom of the detail page.
//
// Given one posting, suggest other live postings a candidate might also want,
// based on how many skills the two have in common. The more skills they share,
// the higher it ranks. Never suggest the posting itself, and a posting with no
// skills listed should not match everything on the board.
export async function getSimilarJobs(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<JobListItemRow> = await pool.query<JobListItemRow>(``, [
      req.params.id,
      queryInt(req.query.limit) ?? 5,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get similar jobs', 'Failed to fetch similar jobs');
  }
}

// ----------------------------------------------------------------------------
// GET /api/jobs/:id/skills
// ----------------------------------------------------------------------------
// The "Requirements" block on the detail page.
//
// List the skills a posting asks for, by name, with the required ones before
// the nice-to-haves.
export async function getJobSkills(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<JobSkillDetailRow> = await pool.query<JobSkillDetailRow>(``, [
      req.params.id,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get job skills', 'Failed to fetch job skills');
  }
}

// ----------------------------------------------------------------------------
// PUT /api/jobs/:id/skills
// ----------------------------------------------------------------------------
// Editing the requirements list.
//
// The employer submits the complete list of skills for the posting, and it
// replaces whatever was there before: skills they removed disappear, new ones
// are added, and a skill whose required/nice-to-have flag changed is updated.
// Submitting an empty list clears the requirements.
//
// The whole replacement has to succeed or fail as one unit — the posting must
// never be left with half its old requirements and half its new ones.
export async function setJobSkills(
  req: Request<IdParams, unknown, SetJobSkillsInput>,
  res: Response
): Promise<void> {
  const skills = Array.isArray(req.body?.skills) ? req.body.skills : [];
  const skillIds = skills.map((skill) => skill.skill_id);
  const requiredFlags = skills.map((skill) => skill.is_required ?? true);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Remove the skills that are no longer in the submitted list.
    await client.query(``, [req.params.id, skillIds]);

    // Add or update the submitted list.
    if (skillIds.length > 0) {
      await client.query(``, [req.params.id, skillIds, requiredFlags]);
    }

    // Read back the final list to return it.
    const result: QueryResult<JobSkillDetailRow> = await client.query<JobSkillDetailRow>(``, [
      req.params.id,
    ]);

    await client.query('COMMIT');
    res.json(result.rows);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    handleDbError(err, res, 'Failed to set job skills', 'Failed to update job skills');
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// GET /api/jobs/:id/applications
// ----------------------------------------------------------------------------
// The employer's applicant list for one posting.
//
// Everyone who applied, with enough of their profile to triage them, filterable
// by pipeline stage and sortable by date or by how well they match the job.
// "How well they match" means how many of the posting's required skills the
// candidate actually has, out of how many it asks for.
//
// The posting's status does not matter here — a closed posting still has
// applicants to review. Candidates who withdrew are hidden by default but can
// be shown with the status filter.
export async function listJobApplicants(req: Request<IdParams>, res: Response): Promise<void> {
  const page = pagination(req.query);

  try {
    const result: QueryResult<JobApplicantRow> = await pool.query<JobApplicantRow>(``, [
      req.params.id,
      queryEnum<ApplicationStatus>(req.query.status, APPLICATION_STATUSES),
      queryInt(req.query.min_matched_skills),
      queryEnum(req.query.sort, ['match', 'newest', 'oldest'] as const) ?? 'newest',
      page.limit,
      page.offset,
    ]);

    res.json(paginated(result.rows, page));
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to list job applicants', 'Failed to fetch applicants');
  }
}

// ----------------------------------------------------------------------------
// GET /api/jobs/:id/views
// ----------------------------------------------------------------------------
// The "views over time" chart on the employer's posting page.
//
// How often the posting was opened, grouped by day, week or month over a chosen
// stretch of history, split into logged-in and anonymous traffic.
//
// Quiet days still belong on the chart as zeros. If a day with no views is
// simply missing from the response, the chart will draw a straight line from
// the last busy day to the next one and show activity that never happened.
export async function getJobViewStats(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<JobViewStatsRow> = await pool.query<JobViewStatsRow>(``, [
      req.params.id,
      queryInt(req.query.days) ?? 30,
      queryEnum(req.query.bucket, ['day', 'week', 'month'] as const) ?? 'day',
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get job view stats', 'Failed to fetch view stats');
  }
}

// ----------------------------------------------------------------------------
// POST /api/jobs/:id/view
// ----------------------------------------------------------------------------
// Record that someone opened the posting.
//
// Two things happen: the view is added to the posting's view history, and the
// posting's running view total goes up by one. Both must happen together, or
// the total and the history will disagree from then on.
//
// Only live postings accept views. The visitor may be logged out, in which case
// the view is recorded without a user. Returns the new total so the page can
// update without reloading.
export async function recordJobView(
  req: Request<IdParams, unknown, RecordJobViewInput>,
  res: Response
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Record the view. Affects nothing if the posting is not live.
    const inserted: QueryResult<{ id: string }> = await client.query<{ id: string }>(``, [
      req.params.id,
      req.body?.user_id ?? null,
    ]);

    if (inserted.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Job not found or not accepting views' });
      return;
    }

    // Bump the running total to match.
    const counter: QueryResult<Pick<JobRow, 'id' | 'views_count'>> = await client.query<
      Pick<JobRow, 'id' | 'views_count'>
    >(``, [req.params.id]);

    await client.query('COMMIT');
    res.status(201).json(counter.rows[0]);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    handleDbError(err, res, 'Failed to record job view', 'Failed to record view');
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// POST /api/jobs
// ----------------------------------------------------------------------------
// Create a posting as a draft.
//
// An employer writes a posting over several sittings, so creating one must
// never publish it. It starts as a draft, invisible to candidates, until they
// explicitly publish it. The client cannot choose the status.
//
// Fields the employer leaves out should fall back to the database's defaults
// rather than being set here. A nonsensical salary range should be rejected.
export async function createJob(
  req: Request<Record<string, never>, unknown, CreateJobInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<JobRow> = await pool.query<JobRow>(``, [
      req.body.company_id,
      req.body.title,
      req.body.description ?? null,
      req.body.salary_min ?? null,
      req.body.salary_max ?? null,
      req.body.location ?? null,
      req.body.is_remote ?? false,
      req.body.employment_type ?? 'full_time',
      req.body.experience_level ?? null,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to create job', 'Failed to create job');
  }
}

// ----------------------------------------------------------------------------
// PATCH /api/jobs/:id
// ----------------------------------------------------------------------------
// Edit a posting.
//
// The edit form sends only the fields that changed. Everything the employer did
// not send keeps the value it already had.
//
// Archived postings are read-only and the edit should be refused rather than
// silently applied.
export async function updateJob(
  req: Request<IdParams, unknown, UpdateJobInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<JobRow> = await pool.query<JobRow>(``, [
      req.params.id,
      req.body.title ?? null,
      req.body.description ?? null,
      req.body.salary_min ?? null,
      req.body.salary_max ?? null,
      req.body.location ?? null,
      req.body.is_remote ?? null,
      req.body.employment_type ?? null,
      req.body.experience_level ?? null,
    ]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Job not found or cannot be edited' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to update job', 'Failed to update job');
  }
}

// ----------------------------------------------------------------------------
// POST /api/jobs/:id/publish
// ----------------------------------------------------------------------------
// Take a posting live.
//
// The posting becomes open to candidates and gets an expiry date a chosen
// number of days out, or no expiry at all if the employer wants it to run
// indefinitely.
//
// Only a draft or a previously closed posting can be published. Publishing one
// that is already open should do nothing. Re-opening a closed posting keeps its
// original publication date, so it does not jump back to the top of the board
// as if it were new.
export async function publishJob(
  req: Request<IdParams, unknown, PublishJobInput>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<JobRow> = await pool.query<JobRow>(``, [
      req.params.id,
      req.body?.duration_days ?? 30,
    ]);

    if (result.rows.length === 0) {
      res.status(409).json({ error: 'Job cannot be published from its current status' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to publish job', 'Failed to publish job');
  }
}

// ----------------------------------------------------------------------------
// POST /api/jobs/:id/close
// ----------------------------------------------------------------------------
// Stop accepting applications.
//
// The role is filled, or the employer is done. The posting leaves the public
// board but keeps all of its applications and history.
//
// Only an open posting can be closed. Closing is not the same as rejecting:
// candidates part-way through the process stay exactly where they are.
export async function closeJob(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<JobRow> = await pool.query<JobRow>(``, [req.params.id]);

    if (result.rows.length === 0) {
      res.status(409).json({ error: 'Only an open job can be closed' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to close job', 'Failed to close job');
  }
}

// ----------------------------------------------------------------------------
// DELETE /api/jobs/:id
// ----------------------------------------------------------------------------
// Remove a posting, in one of two ways.
//
// By default it is archived: the posting is hidden but the row stays, so the
// applications, history and view records attached to it survive. This is what a
// real product does, because a true delete would erase people's application
// records along with the posting.
//
// With ?hard=true the row is deleted outright, and everything that depends on
// it goes too. Worth trying once against the seed data to see how far that
// reaches.
export async function deleteJob(req: Request<IdParams>, res: Response): Promise<void> {
  const hardDelete = queryBool(req.query.hard) === true;

  try {
    const result: QueryResult<Pick<JobRow, 'id'>> = hardDelete
      ? // Delete the posting outright.
        await pool.query<Pick<JobRow, 'id'>>(``, [req.params.id])
      : // Archive it and keep the history.
        await pool.query<Pick<JobRow, 'id'>>(``, [req.params.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ id: result.rows[0]?.id, deleted: hardDelete, archived: !hardDelete });
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to delete job', 'Failed to delete job');
  }
}

// ----------------------------------------------------------------------------
// GET /api/jobs/manage
// ----------------------------------------------------------------------------
// The employer's posting dashboard.
//
// Every posting belonging to a company, including drafts, closed and expired
// ones, with the numbers the employer cares about: total applications, how many
// are still waiting for a first review, and total views.
//
// Archived postings are hidden unless explicitly asked for. This is the mirror
// image of the public board: same postings, opposite visibility rules.
export async function listCompanyJobsForEmployer(req: Request, res: Response): Promise<void> {
  const page = pagination(req.query);

  try {
    const result: QueryResult<JobListItemRow> = await pool.query<JobListItemRow>(``, [
      queryString(req.query.company_id),
      queryEnum(req.query.status, JOB_STATUSES),
      queryBool(req.query.include_archived) ?? false,
      page.limit,
      page.offset,
    ]);

    res.json(paginated(result.rows, page));
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to list employer jobs', 'Failed to fetch jobs');
  }
}
