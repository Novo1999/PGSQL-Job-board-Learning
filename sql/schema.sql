-- ============================================================================
-- Job Board — PostgreSQL schema
-- ============================================================================
-- Run with:   psql -d job_board -f sql/schema.sql
--
-- Notes on the conventions used here (these are deliberate, modern PostgreSQL
-- choices — not copied from MySQL tutorials):
--
--   * BIGINT GENERATED ALWAYS AS IDENTITY  instead of SERIAL.
--       IDENTITY is the SQL-standard way to auto-generate primary keys and is
--       preferred over SERIAL in modern PostgreSQL. "ALWAYS" means you cannot
--       accidentally insert your own id — the database owns it.
--   * TIMESTAMPTZ  instead of TIMESTAMP.
--       Always store timestamps with a time zone. now() returns TIMESTAMPTZ.
--   * TEXT  instead of VARCHAR(n).
--       In PostgreSQL there is no performance benefit to VARCHAR(n); use TEXT
--       and add a CHECK constraint only if you truly need a length limit.
-- ============================================================================

-- This script is safe to re-run while learning: it drops the tables first.
-- Drop in reverse dependency order (children before parents).
-- WARNING: this deletes all data in these tables.
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS users;


-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
-- A person on the platform. Right now a user is either a candidate (applies to
-- jobs) or an employer. We enforce the allowed roles with a CHECK constraint.
CREATE TABLE users (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT        NOT NULL,
    email      TEXT        NOT NULL UNIQUE,
    role       TEXT        NOT NULL CHECK (role IN ('candidate', 'employer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
-- An organization that posts jobs. Kept intentionally standalone for now
-- (no owner/user link yet) to match the initial scope.
CREATE TABLE companies (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- jobs
-- ----------------------------------------------------------------------------
-- A job posting that belongs to exactly one company.
--
-- ON DELETE CASCADE on company_id: a job cannot exist without its company, so
-- if the company is deleted we remove its jobs too. This is a deliberate choice
-- (the alternative, RESTRICT, would force you to delete jobs manually first).
--
-- The CHECK constraints keep salary data sane: non-negative, and min <= max.
-- Salaries are nullable so a posting can omit them (see the NULL example in the
-- seed data) — the checks are written to allow NULLs.
CREATE TABLE jobs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id  BIGINT      NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    description TEXT,
    salary_min  INTEGER,
    salary_max  INTEGER,
    location    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT jobs_salary_min_nonneg CHECK (salary_min IS NULL OR salary_min >= 0),
    CONSTRAINT jobs_salary_max_nonneg CHECK (salary_max IS NULL OR salary_max >= 0),
    CONSTRAINT jobs_salary_range      CHECK (
        salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max
    )
);


-- ----------------------------------------------------------------------------
-- applications
-- ----------------------------------------------------------------------------
-- A candidate applying to a job. This is the join table that gives users and
-- jobs their many-to-many relationship.
--
-- Key business rule: a user may apply to a given job only ONCE. We enforce that
-- at the database level with UNIQUE (job_id, user_id) rather than trusting
-- application code — the database is the last line of defense.
--
-- ON DELETE CASCADE on both foreign keys: an application only has meaning while
-- both its job and its user exist. Deleting either removes the application.
CREATE TABLE applications (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id     BIGINT      NOT NULL REFERENCES jobs (id)  ON DELETE CASCADE,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status     TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'accepted', 'rejected')),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT applications_unique_user_job UNIQUE (job_id, user_id)
);


-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
-- Foreign-key columns are not indexed automatically in PostgreSQL. Indexing
-- them speeds up JOINs and lookups like "all jobs for a company".
CREATE INDEX idx_jobs_company_id       ON jobs (company_id);
CREATE INDEX idx_applications_user_id  ON applications (user_id);

-- Note: we do NOT add a separate index on applications(job_id). The UNIQUE
-- constraint above creates an index on (job_id, user_id), and PostgreSQL can
-- use its leftmost column (job_id) for lookups — so a standalone job_id index
-- would be redundant. This is a useful thing to understand about composite
-- indexes.
