// ============================================================================
// skillsController — the shared skill vocabulary
// ============================================================================
// One canonical list of skills, used by both sides of the marketplace: jobs say
// which skills they need, candidates say which ones they have.
// ============================================================================

import type { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../db.js';
import type { CreateSkillInput, SkillDemandRow, SkillRow } from '../types/database.js';
import {
    handleDbError,
    isUniqueViolation,
    queryInt,
    queryString,
} from '../utils/http.js';

type IdParams = { id: string };

// ----------------------------------------------------------------------------
// GET /api/skills
// ----------------------------------------------------------------------------
// The skill autocomplete, used by both the job editor and the candidate
// profile.
//
// Matches as the user types, ignoring capitalisation, and can be limited to one
// category. Skills that START with what they typed should come before ones that
// merely contain it — someone typing "post" wants PostgreSQL first. Always
// returns a short list; an autocomplete never needs more than a screenful.
export async function listSkills(req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<SkillRow> = await pool.query<SkillRow>(
      `SELECT * FROM skills
      WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR category ILIKE $2)
      ORDER BY (name ILIKE $1 || '%') DESC, name ASC LIMIT $3`, [
      queryString(req.query.q),
      queryString(req.query.category),
      queryInt(req.query.limit) ?? 20,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to list skills', 'Failed to fetch skills');
  }
}

// ----------------------------------------------------------------------------
// GET /api/skills/demand
// ----------------------------------------------------------------------------
// "What is the market asking for?"
//
// For every skill: how many live postings ask for it, how many candidates list
// it, and the gap between the two. A positive gap means employers want more of
// it than the candidate pool has.
//
// Only live postings count towards demand — a skill wanted only by expired
// postings is not in demand. Skills nobody uses at all can optionally be shown,
// so you can see what the vocabulary contains that has gone stale.
export async function getSkillDemand(req: Request, res: Response): Promise<void> {
  try {
    const result: QueryResult<SkillDemandRow> = await pool.query<SkillDemandRow>(
      `SELECT skills.id, skills.name, skills.category,
       COUNT(DISTINCT jobs.id) AS job_count, COUNT(DISTINCT us.user_id) AS candidate_count, (COUNT(DISTINCT jobs.id)-COUNT(DISTINCT us.user_id)) AS demand_gap
       FROM skills
       LEFT JOIN job_skills js ON js.skill_id=skills.id
       LEFT JOIN user_skills us ON us.skill_id=skills.id
       LEFT JOIN jobs ON jobs.id=js.job_id  AND jobs.status = 'open'
       AND (jobs.expires_at IS NULL OR jobs.expires_at > now())
       GROUP BY skills.id, skills.name, skills.category
       HAVING $1 = false OR COUNT(DISTINCT jobs.id) > 0 OR COUNT(DISTINCT us.user_id) > 0
       ORDER BY demand_gap DESC
       LIMIT $2
       `, [
      queryString(req.query.used_only) === 'true',
      queryInt(req.query.limit) ?? 50,
    ]);

    res.json(result.rows);
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to get skill demand', 'Failed to fetch skill demand');
  }
}

// ----------------------------------------------------------------------------
// POST /api/skills
// ----------------------------------------------------------------------------
// Add a skill to the vocabulary.
//
// Called from the autocomplete when someone types a skill that does not exist
// yet — and two people can type the same new skill at the same moment.
//
// "React" and "react" are the same skill. If the skill already exists, return
// the existing one rather than failing: the caller wanted a skill to attach
// something to, and there is one.
export async function createSkill(
  req: Request<Record<string, never>, unknown, CreateSkillInput>,
  res: Response
): Promise<void> {
  if (!req.body?.name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  try {
    const result: QueryResult<SkillRow> = await pool.query<SkillRow>(
     `INSERT INTO skills (name, category)
      VALUES ($1, $2)
      ON CONFLICT (lower(name))
      DO UPDATE SET
       name = skills.name
      RETURNING *`, [
      req.body.name,
      req.body.category ?? null,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'That skill already exists' });
      return;
    }

    handleDbError(err, res, 'Failed to create skill', 'Failed to create skill');
  }
}

// ----------------------------------------------------------------------------
// DELETE /api/skills/:id
// ----------------------------------------------------------------------------
// Remove a skill from the vocabulary.
//
// Deleting a skill strips it from every posting and every profile that lists
// it, so refuse by default when it is still in use anywhere. ?force=true
// removes it everywhere.
export async function deleteSkill(req: Request<IdParams>, res: Response): Promise<void> {
  const force = queryString(req.query.force) === 'true';

  try {
    const result: QueryResult<Pick<SkillRow, 'id'>> = await pool.query<Pick<SkillRow, 'id'>>(
      `DELETE FROM skills
      WHERE id = $1
      AND ($2 = true OR (NOT EXISTS (  
          SELECT 1
          FROM user_skills
          WHERE skill_id = $1)
      AND NOT EXISTS (
          SELECT 1
          FROM job_skills
          WHERE skill_id = $1)))
      RETURNING id`, [
      req.params.id,
      force,
    ]);

    if (result.rows.length === 0) {
      res.status(409).json({
        error: 'Skill not found, or still in use (use ?force=true to remove it everywhere)',
      });
      return;
    }

    res.json({ id: result.rows[0]?.id, deleted: true });
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to delete skill', 'Failed to delete skill');
  }
}
