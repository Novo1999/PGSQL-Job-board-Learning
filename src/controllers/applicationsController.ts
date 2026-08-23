// ============================================================================
// applicationsController — the hiring pipeline
// ============================================================================
// Two rules hold everywhere in this file:
//
//   A candidate can apply to a given job only once.
//   An application's current status and its history never disagree — every
//   status change records both.
//
// The pipeline a candidate moves through:
//     pending -> reviewing -> interview -> offer -> accepted
//                     \            \         \
//                      `----------- rejected -'
//     withdrawn  (the candidate pulled out, from any stage)
// ============================================================================

import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import {
  handleDbError,
  isUniqueViolation,
  pagination,
  paginated,
  queryEnum,
  queryInt,
  queryString,
} from '../utils/http.js';
import {
  APPLICATION_STATUSES,
  type ApplicationRow,
  type ApplicationStatus,
  type ApplicationTimelineRow,
  type BulkRejectInput,
  type CreateApplicationInput,
  type FunnelStageRow,
  type JobApplicantRow,
  type UpdateApplicationStatusInput,
} from '../types/database.js';

type IdParams = { id: string };

// The stages a candidate is still actively in.
const ACTIVE_STATUSES: readonly ApplicationStatus[] = [
  'pending',
  'reviewing',
  'interview',
  'offer',
];

// ----------------------------------------------------------------------------
// POST /api/applications
// ----------------------------------------------------------------------------
// Apply to a job.
//
// A candidate submits an application, optionally with a cover letter and a link
// to their CV.
//
// The posting must still be live and the applicant must be a candidate, not an
// employer. Nobody may apply to the same job twice — and remember that the
// "Apply" button gets double-clicked, so two identical requests can arrive
// milliseconds apart and both must not succeed.
//
// A new application starts at the "pending" stage, and that first step is
// recorded in its history straight away.
export async function applyToJob(
  req: Request<Record<string, never>, unknown, CreateApplicationInput>,
  res: Response
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create the application, but only for a live job and a real candidate.
    const created: QueryResult<ApplicationRow> = await client.query<ApplicationRow>(``, [
      req.body.job_id,
      req.body.user_id,
      req.body.cover_letter ?? null,
      req.body.resume_url ?? null,
    ]);

    const application = created.rows[0];

    if (!application) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Job is not accepting applications, or user is not a candidate' });
      return;
    }

    // Record the first step of its history.
    await client.query(``, [application.id]);

    await client.query('COMMIT');
    res.status(201).json(application);
  } catch (err: unknown) {
    await client.query('ROLLBACK');

    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'You have already applied to this job' });
      return;
    }

    handleDbError(err, res, 'Failed to create application', 'Failed to create application');
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// GET /api/applications
// ----------------------------------------------------------------------------
// The employer's inbox.
//
// Every application across all of a company's postings in one list, so a
// recruiter can work through them without opening each job separately. It can
// also be narrowed to a single posting.
//
// Filterable by pipeline stage, searchable by the candidate's name or email,
// and — the thing recruiters actually need — able to show only the applications
// nobody has touched in the last N days.
//
// Sortable by newest, oldest, or by pipeline stage. Note that sorting by stage
// means the order candidates move through the process, not alphabetical order.
export async function listApplications(req: Request, res: Response): Promise<void> {
  const page = pagination(req.query);

  try {
    const result: QueryResult<JobApplicantRow> = await pool.query<JobApplicantRow>(``, [
      queryString(req.query.company_id),
      queryString(req.query.job_id),
      queryEnum<ApplicationStatus>(req.query.status, APPLICATION_STATUSES),
      queryString(req.query.q),
      queryInt(req.query.stale_days),
      queryEnum(req.query.sort, ['newest', 'oldest', 'stage'] as const) ?? 'newest',
      page.limit,
      page.offset,
    ]);

    res.json(paginated(result.rows, page));
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to list applications', 'Failed to fetch applications');
  }
}

// ----------------------------------------------------------------------------
// GET /api/applications/:id
// ----------------------------------------------------------------------------
// One application, fully expanded.
//
// Everything needed to review a candidate on a single screen: the application
// itself, the candidate's profile, the job and company they applied to, and how
// well their skills line up with what the posting requires.
export async function getApplicationById(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<JobApplicantRow> = await pool.query<JobApplicantRow>(``, [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get application', 'Failed to fetch application');
  }
}

// ----------------------------------------------------------------------------
// PATCH /api/applications/:id/status
// ----------------------------------------------------------------------------
// Move a candidate through the pipeline.
//
// The employer advances or rejects an application, optionally attaching a note
// that becomes part of its permanent record.
//
// The application's status changes and the move is added to its history, and
// the history has to record which stage it came from. Once an application has
// been accepted, rejected or withdrawn it is finished and cannot move again.
// Setting the stage it is already at should change nothing.
//
// Two recruiters can act on the same candidate at the same moment. Make sure
// that cannot produce two conflicting history entries.
export async function updateApplicationStatus(
  req: Request<IdParams, unknown, UpdateApplicationStatusInput>,
  res: Response
): Promise<void> {
  const nextStatus = queryEnum<ApplicationStatus>(req.body?.status, APPLICATION_STATUSES);

  if (nextStatus === null) {
    res.status(400).json({ error: `status must be one of: ${APPLICATION_STATUSES.join(', ')}` });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Read the stage it is currently at, and hold it while we work.
    const current: QueryResult<Pick<ApplicationRow, 'id' | 'status'>> = await client.query<
      Pick<ApplicationRow, 'id' | 'status'>
    >(``, [req.params.id]);

    const existing = current.rows[0];

    if (!existing) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    if (existing.status === nextStatus) {
      await client.query('ROLLBACK');
      res.status(200).json({ ...existing, unchanged: true });
      return;
    }

    // Move it on. Should do nothing if it was already finished.
    const updated: QueryResult<ApplicationRow> = await client.query<ApplicationRow>(``, [
      req.params.id,
      nextStatus,
    ]);

    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: `Cannot move an application out of '${existing.status}'` });
      return;
    }

    // Record the move in its history.
    await client.query(``, [
      req.params.id,
      existing.status,
      nextStatus,
      req.body?.note ?? null,
    ]);

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    handleDbError(err, res, 'Failed to update application status', 'Failed to update application');
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// POST /api/applications/:id/withdraw
// ----------------------------------------------------------------------------
// The candidate pulls out.
//
// Same idea as a status change, but the candidate starts it, and it is allowed
// from any stage that is not already finished.
//
// A candidate may only withdraw their own application — knowing an application
// id must not be enough to withdraw someone else's.
export async function withdrawApplication(
  req: Request<IdParams, unknown, { user_id: string; note?: string | null }>,
  res: Response
): Promise<void> {
  if (!req.body?.user_id) {
    res.status(400).json({ error: 'user_id is required' });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updated: QueryResult<ApplicationRow> = await client.query<ApplicationRow>(``, [
      req.params.id,
      req.body.user_id,
    ]);

    const application = updated.rows[0];

    if (!application) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Application not found, not yours, or already finished' });
      return;
    }

    await client.query(``, [req.params.id, application.status, req.body.note ?? null]);

    await client.query('COMMIT');
    res.json(application);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    handleDbError(err, res, 'Failed to withdraw application', 'Failed to withdraw application');
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// POST /api/applications/bulk-reject
// ----------------------------------------------------------------------------
// "Reject all remaining candidates" once a role is filled.
//
// The recruiter selects a set of applications and rejects them in one action,
// with an optional note that goes on every one of them.
//
// Applications that have already been decided are skipped rather than failing
// the whole batch, so the number actually rejected is often smaller than the
// number requested — report both. Each rejection is recorded in that
// application's history like any other stage change.
//
// However many applications are selected, this should be one trip to the
// database, not one per application.
export async function bulkRejectApplications(
  req: Request<Record<string, never>, unknown, BulkRejectInput>,
  res: Response
): Promise<void> {
  const ids = Array.isArray(req.body?.application_ids) ? req.body.application_ids : [];

  if (ids.length === 0) {
    res.status(400).json({ error: 'application_ids must be a non-empty array' });
    return;
  }

  try {
    const result: QueryResult<Pick<ApplicationRow, 'id'>> = await pool.query<
      Pick<ApplicationRow, 'id'>
    >(``, [ids, ACTIVE_STATUSES, req.body?.note ?? null]);

    res.json({
      requested: ids.length,
      rejected: result.rows.length,
      skipped: ids.length - result.rows.length,
      ids: result.rows.map((row) => row.id),
    });
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to bulk reject applications', 'Failed to reject applications');
  }
}

// ----------------------------------------------------------------------------
// GET /api/applications/:id/timeline
// ----------------------------------------------------------------------------
// "How long has this been sitting with us?"
//
// The full history of one application, oldest first, and for each step how long
// it spent at the previous stage. The very first step has nothing before it, so
// it has no gap to report.
export async function getApplicationTimeline(
  req: Request<IdParams>,
  res: Response
): Promise<void> {
  try {
    const result: QueryResult<ApplicationTimelineRow> = await pool.query<ApplicationTimelineRow>(
      ``,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get application timeline', 'Failed to fetch timeline');
  }
}

// ----------------------------------------------------------------------------
// GET /api/applications/funnel
// ----------------------------------------------------------------------------
// The hiring funnel.
//
// How many applications are sitting at each stage right now, and what share of
// the total each stage represents. Can cover the whole platform, one company,
// or only applications from the last N days.
//
// Every stage must appear, including ones with no applications at all, and they
// must come back in pipeline order. A funnel that quietly leaves out
// "interview: 0" tells the reader the wrong story.
export async function getApplicationFunnel(req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<FunnelStageRow> = await pool.query<FunnelStageRow>(``, [
      queryString(req.query.company_id),
      queryInt(req.query.days),
      APPLICATION_STATUSES,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get application funnel', 'Failed to fetch funnel');
  }
}

// ----------------------------------------------------------------------------
// DELETE /api/applications/:id
// ----------------------------------------------------------------------------
// Erase an application entirely, the way a data-deletion request would.
//
// Different from withdrawing: withdrawing keeps the record and its history,
// this removes both. Real products almost always withdraw instead.
export async function deleteApplication(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<Pick<ApplicationRow, 'id'>> = await pool.query<
      Pick<ApplicationRow, 'id'>
    >(``, [req.params.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    res.json({ id: result.rows[0]?.id, deleted: true });
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to delete application', 'Failed to delete application');
  }
}
