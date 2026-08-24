// ============================================================================
// usersController — candidates and employers
// ============================================================================
// One table, two kinds of person. A user's role decides which fields mean
// anything — headline, location and years of experience describe a candidate
// and stay empty for an employer — and which of these endpoints apply to them.
// ============================================================================

import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import {
    USER_ROLES,
    type CandidateApplicationRow,
    type CandidateDashboardRow,
    type CandidateMatchRow,
    type CreateUserInput,
    type RecommendedJobRow,
    type SetUserSkillsInput,
    type UpdateUserInput,
    type UserRow,
    type UserSkillDetailRow,
} from '../types/database.js';
import { handleDbError, isUniqueViolation, paginated, pagination, queryBool, queryEnum, queryIdList, queryInt, queryString } from '../utils/http.js';

type IdParams = { id: string }

// ----------------------------------------------------------------------------
// GET /api/users
// ----------------------------------------------------------------------------
// The admin user list.
//
// Everyone on the platform, filterable by role and searchable by name or email,
// always paginated. Deactivated accounts are hidden unless asked for, so the
// default list shows the live user base.
export async function listUsers(req: Request, res: Response): Promise<void> {
  const page = pagination(req.query)
  const sortOrder = req.query.order === 'desc' ? 'DESC' : 'ASC'

  try {
    const result: QueryResult<UserRow & { total_count: string }> = await pool.query<UserRow & { total_count: string }>(
      `SELECT users.*, COUNT(*) OVER () AS total_count FROM users
      WHERE ($1::text IS NULL OR users.role=$1) AND 
      ($2::text IS NULL OR users.name ILIKE $2 || '%' OR users.email ILIKE $2 || '%')
      AND (users.is_active = true OR $3 = true)
      ORDER BY users.id ${sortOrder}
      LIMIT $4 OFFSET $5`,
      [queryEnum(req.query.role, USER_ROLES), queryString(req.query.q), queryBool(req.query.include_inactive) ?? false, page.limit, page.offset],
    )

    res.json(paginated(result.rows, page))
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to list users', 'Failed to fetch users')
  }
}

// ----------------------------------------------------------------------------
// GET /api/users/candidates/search
// ----------------------------------------------------------------------------
// Employer-side candidate sourcing.
//
// Search the candidate pool by the skills people list on their profile, so a
// recruiter can approach someone who never applied. Only active candidates
// appear.
//
// Two ways to match, and the difference matters: find candidates who have ANY
// of the chosen skills, or only those who have ALL of them. Optionally narrow
// further by minimum years of experience and by location.
//
// Each result names which of the searched-for skills that candidate actually
// has, and the strongest matches come first.
export async function searchCandidates(req: Request, res: Response): Promise<void> {
  const page = pagination(req.query)

  try {
    const result: QueryResult<CandidateMatchRow> = await pool.query<CandidateMatchRow>(``, [
      queryIdList(req.query.skill),
      queryEnum(req.query.match, ['any', 'all'] as const) ?? 'any',
      queryInt(req.query.min_experience),
      queryString(req.query.location),
      page.limit,
      page.offset,
    ])

    res.json(paginated(result.rows, page))
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to search candidates', 'Failed to search candidates')
  }
}

// ----------------------------------------------------------------------------
// GET /api/users/:id
// ----------------------------------------------------------------------------
// A user profile.
//
// The person, plus the numbers that describe them: for a candidate, how many
// applications and saved jobs they have; for an employer, how many companies
// they own.
export async function getUserById(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<UserRow & { application_count: string; saved_jobs_count: string; companies_count: string }> = await pool.query(``, [req.params.id])

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json(result.rows[0])
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get user', 'Failed to fetch user')
  }
}

// ----------------------------------------------------------------------------
// POST /api/users
// ----------------------------------------------------------------------------
// Register a new user.
//
// Email addresses are unique, and two people can try to register the same one
// at the same moment. Treat "Alice@example.com" and "alice@example.com" as the
// same address rather than letting both become accounts.
export async function createUser(req: Request<Record<string, never>, unknown, CreateUserInput>, res: Response): Promise<void> {
  try {
    const result: QueryResult<UserRow> = await pool.query<UserRow>(`
      INSERT INTO users(name, email, role, headline, location, years_experience)
      `, [
      req.body.name,
      req.body.email,
      req.body.role,
      req.body.headline ?? null,
      req.body.location ?? null,
      req.body.years_experience ?? null,
    ])

    res.status(201).json(result.rows[0])
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'A user with that email already exists' })
      return
    }

    handleDbError(err, res, 'Failed to create user', 'Failed to create user')
  }
}

// ----------------------------------------------------------------------------
// PATCH /api/users/:id
// ----------------------------------------------------------------------------
// Edit a profile.
//
// Only the fields the user submitted change; the rest keep their current
// values. Changing an email can still collide with someone else's.
//
// Role is deliberately not editable here — turning a candidate into an employer
// would strand their applications, so it would be a deliberate migration rather
// than a field on the edit form.
export async function updateUser(req: Request<IdParams, unknown, UpdateUserInput>, res: Response): Promise<void> {
  try {
    const result: QueryResult<UserRow> = await pool.query<UserRow>(``, [
      req.params.id,
      req.body.name ?? null,
      req.body.email ?? null,
      req.body.headline ?? null,
      req.body.location ?? null,
      req.body.years_experience ?? null,
    ])

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json(result.rows[0])
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'A user with that email already exists' })
      return
    }

    handleDbError(err, res, 'Failed to update user', 'Failed to update user')
  }
}

// ----------------------------------------------------------------------------
// GET /api/users/:id/skills
// ----------------------------------------------------------------------------
// The skills section of a candidate's profile, most experienced first. Skills
// with no experience recorded go last rather than first.
export async function getUserSkills(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<UserSkillDetailRow> = await pool.query<UserSkillDetailRow>(``, [req.params.id])

    res.json(result.rows)
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get user skills', 'Failed to fetch user skills')
  }
}

// ----------------------------------------------------------------------------
// PUT /api/users/:id/skills
// ----------------------------------------------------------------------------
// Replace a candidate's skill list.
//
// The candidate submits their complete list and it replaces what was there
// before, along with how many years of experience they claim for each one.
// Employers do not have skills and should be refused.
//
// As with a job's requirements, the replacement has to succeed or fail as a
// whole.
export async function setUserSkills(req: Request<IdParams, unknown, SetUserSkillsInput>, res: Response): Promise<void> {
  const skills = Array.isArray(req.body?.skills) ? req.body.skills : []
  const skillIds = skills.map((skill) => skill.skill_id)
  const years = skills.map((skill) => skill.years_experience ?? null)

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Remove the skills that are no longer listed.
    await client.query(``, [req.params.id, skillIds])

    // Add or update the submitted list.
    if (skillIds.length > 0) {
      await client.query(``, [req.params.id, skillIds, years])
    }

    // Read back the final list to return it.
    const result: QueryResult<UserSkillDetailRow> = await client.query<UserSkillDetailRow>(``, [req.params.id])

    await client.query('COMMIT')
    res.json(result.rows)
  } catch (err: unknown) {
    await client.query('ROLLBACK')
    handleDbError(err, res, 'Failed to set user skills', 'Failed to update user skills')
  } finally {
    client.release()
  }
}

// ----------------------------------------------------------------------------
// GET /api/users/:id/applications
// ----------------------------------------------------------------------------
// "My applications" — the candidate's own tracking screen.
//
// Every job they applied to, with the company name and where each application
// currently stands, newest first. Can be narrowed to one stage, or to only the
// applications still in play.
//
// Applications to postings that are no longer live still belong here. Someone
// who applied to a job before it expired needs to see it, so return the
// posting's status and let the screen label it.
export async function listUserApplications(req: Request<IdParams>, res: Response): Promise<void> {
  const page = pagination(req.query)

  try {
    const result: QueryResult<CandidateApplicationRow> = await pool.query<CandidateApplicationRow>(``, [
      req.params.id,
      queryString(req.query.status),
      queryBool(req.query.active_only) ?? false,
      page.limit,
      page.offset,
    ])

    res.json(paginated(result.rows, page))
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to list user applications', 'Failed to fetch applications')
  }
}

// ----------------------------------------------------------------------------
// GET /api/users/:id/dashboard
// ----------------------------------------------------------------------------
// The counters across the top of the candidate's home screen: total
// applications, how many are still active, interviews, offers, rejections, and
// saved jobs.
//
// Six numbers, but the screen should not need six separate trips to the
// database to draw them. A candidate who has done nothing yet gets zeros, not
// an empty response.
export async function getUserDashboard(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<CandidateDashboardRow> = await pool.query<CandidateDashboardRow>(``, [req.params.id])

    res.json(result.rows[0] ?? null)
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get user dashboard', 'Failed to fetch dashboard')
  }
}

// ----------------------------------------------------------------------------
// GET /api/users/:id/recommended-jobs
// ----------------------------------------------------------------------------
// "Jobs picked for you."
//
// Score live postings against the skills on a candidate's profile and return
// the best matches, with a match percentage. Jobs they have already applied to
// are left out, and so are jobs that match none of their skills. Optionally
// restrict to remote postings or ones near where they live.
//
// Note that Emma in the seed data has no skills recorded at all. Decide what
// she should see, and make sure that is what she gets.
export async function getRecommendedJobs(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<RecommendedJobRow> = await pool.query<RecommendedJobRow>(``, [req.params.id, queryInt(req.query.limit) ?? 10, queryBool(req.query.local_only) ?? false])

    res.json(result.rows)
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get recommended jobs', 'Failed to fetch recommendations')
  }
}

// ----------------------------------------------------------------------------
// POST /api/users/:id/deactivate
// ----------------------------------------------------------------------------
// Deactivate an account.
//
// The user disappears from listings and searches, but nothing is deleted —
// their applications stay attached to the jobs they applied to, so employers
// keep a coherent history. Deactivating an already-inactive account is fine and
// changes nothing.
export async function deactivateUser(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<UserRow> = await pool.query<UserRow>(``, [req.params.id])

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json(result.rows[0])
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to deactivate user', 'Failed to deactivate user')
  }
}

// ----------------------------------------------------------------------------
// DELETE /api/users/:id
// ----------------------------------------------------------------------------
// Erase an account permanently, as opposed to deactivating it.
//
// Their applications, skills and bookmarks go with them. Their view history and
// any companies they own do not — those survive, just without a person attached.
//
// Try this on Frank, who owns two companies, and on Alice, who has applications
// and views, and count the other tables before and after.
export async function deleteUser(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const result: QueryResult<Pick<UserRow, 'id'>> = await pool.query<Pick<UserRow, 'id'>>(``, [req.params.id])

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({ id: result.rows[0]?.id, deleted: true })
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to delete user', 'Failed to delete user')
  }
}
