// ============================================================================
// savedJobsController — candidate bookmarks
// ============================================================================
// A candidate can bookmark a posting to come back to it later. A posting is
// either bookmarked or it is not — there is no such thing as saving the same
// job twice.
// ============================================================================

import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import type { SaveJobInput, SavedJobListItemRow, SavedJobRow } from '../types/database.js';
import { handleDbError, paginated, pagination, queryBool } from '../utils/http.js';

type UserParams = { userId: string }
type UserJobParams = { userId: string; jobId: string }

// ----------------------------------------------------------------------------
// GET /api/users/:userId/saved-jobs
// ----------------------------------------------------------------------------
// The candidate's bookmark list, most recently saved first.
//
// Each bookmark shows enough of the posting to render a card, plus the two
// things that make the list useful: whether the posting is still live, and
// whether the candidate has already applied to it. There is also a shortcut
// view for the bookmarks that are still live and not yet applied to — the
// candidate's actual to-do list.
//
// A bookmark outlives the posting it points at. When a posting expires or
// closes, the bookmark stays and is marked as no longer live. Hiding it would
// look to the candidate like the site lost it.
export async function listSavedJobs(req: Request<UserParams>, res: Response): Promise<void> {
  const page = pagination(req.query)

  try {
    const result: QueryResult<SavedJobListItemRow> = await pool.query<SavedJobListItemRow>(
      `SELECT s.job_id,
              s.saved_at,
              s.title,
              s.company_id,
              s.company_name,
              s.location,
              s.is_remote,
              s.salary_min,
              s.salary_max,
              s.status,
              s.expires_at,
              s.is_live,
              s.has_applied,
              COUNT(*) OVER() AS total_count
       FROM (
         SELECT sj.job_id,
                sj.saved_at,
                j.title,
                j.company_id,
                c.name AS company_name,
                j.location,
                j.is_remote,
                j.salary_min,
                j.salary_max,
                j.status,
                j.expires_at,
                (j.status = 'open' AND (j.expires_at IS NULL OR j.expires_at > now())) AS is_live,
                EXISTS (
                  SELECT 1
                  FROM applications a
                  WHERE a.job_id = sj.job_id
                    AND a.user_id = sj.user_id
                ) AS has_applied
         FROM saved_jobs sj
         JOIN jobs j ON j.id = sj.job_id
         JOIN companies c ON c.id = j.company_id
         WHERE sj.user_id = $1
       ) s
       WHERE ($2 = false OR (s.is_live AND NOT s.has_applied))
       ORDER BY s.saved_at DESC, s.job_id DESC
       LIMIT $3 OFFSET $4`,
      [req.params.userId, queryBool(req.query.actionable_only) ?? false, page.limit, page.offset],
    )

    res.json(paginated(result.rows, page))
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to list saved jobs', 'Failed to fetch saved jobs')
  }
}

// ----------------------------------------------------------------------------
// POST /api/users/:userId/saved-jobs
// ----------------------------------------------------------------------------
// Bookmark a posting.
//
// Tapping "save" twice must leave exactly one bookmark and succeed both times —
// the second tap is not an error, the job is simply already saved. Only live
// postings can be bookmarked.
export async function saveJob(req: Request<UserParams, unknown, SaveJobInput>, res: Response): Promise<void> {
  if (!req.body?.job_id) {
    res.status(400).json({ error: 'job_id is required' })
    return
  }

  try {
    const result: QueryResult<SavedJobRow> = await pool.query<SavedJobRow>(
      `INSERT INTO saved_jobs(user_id, job_id)
        SELECT $1, jobs.id
        FROM jobs
        WHERE jobs.id=$2
        AND jobs.status='open'
        AND (jobs.expires_at IS NULL OR jobs.expires_at > now())
       ON CONFLICT (user_id, job_id)
       DO NOTHING
       RETURNING *
      `,
      [req.params.userId, req.body.job_id],
    )

    // Nothing came back, so the bookmark already existed.
    if (result.rows.length === 0) {
      res.status(200).json({ user_id: req.params.userId, job_id: req.body.job_id, already_saved: true })
      return
    }

    res.status(201).json(result.rows[0])
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to save job', 'Failed to save job')
  }
}

// ----------------------------------------------------------------------------
// DELETE /api/users/:userId/saved-jobs/:jobId
// ----------------------------------------------------------------------------
// Remove a bookmark.
//
// Removing one that was never there is a success, not a failure: the candidate
// asked for this job not to be bookmarked, and afterwards it is not.
//
// A candidate can only remove their own bookmarks.
export async function unsaveJob(req: Request<UserJobParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<SavedJobRow> = await pool.query<SavedJobRow>(
      `DELETE FROM saved_jobs
      WHERE job_id=$2 AND user_id=$1
      RETURNING *`,
      [req.params.userId, req.params.jobId],
    )

    res.json({
      user_id: req.params.userId,
      job_id: req.params.jobId,
      removed: result.rows.length > 0,
    })
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to unsave job', 'Failed to remove saved job')
  }
}
