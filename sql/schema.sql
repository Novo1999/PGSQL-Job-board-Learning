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
DROP TABLE IF EXISTS application_events;
DROP TABLE IF EXISTS job_views;
DROP TABLE IF EXISTS saved_jobs;
DROP TABLE IF EXISTS job_skills;
DROP TABLE IF EXISTS user_skills;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS skills;
DROP TABLE IF EXISTS users;


-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
-- A person on the platform. Right now a user is either a candidate (applies to
-- jobs) or an employer. We enforce the allowed roles with a CHECK constraint.
--
-- headline / location / years_experience describe a *candidate* profile. They
-- are nullable because an employer has no use for them — a very common
-- real-world shape: one table, some columns only meaningful for some rows.
CREATE TABLE users (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name             TEXT        NOT NULL,
    email            TEXT        NOT NULL UNIQUE,
    role             TEXT        NOT NULL CHECK (role IN ('candidate', 'employer')),
    headline         TEXT,
    location         TEXT,
    years_experience INTEGER,
    is_active        BOOLEAN     NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT users_years_experience_sane CHECK (
        years_experience IS NULL OR (years_experience >= 0 AND years_experience <= 60)
    )
);


CREATE UNIQUE INDEX users_email_unique
ON users (lower(email));
-- ----------------------------------------------------------------------------
-- skills
-- ----------------------------------------------------------------------------
-- A controlled vocabulary of skills ("PostgreSQL", "React", "Kubernetes").
--
-- Why a table instead of a TEXT[] column on jobs? Because a shared table gives
-- you one canonical spelling per skill, cheap joins in both directions
-- ("which jobs need SQL?" AND "which skills does this job need?"), and a place
-- to hang extra data later. This is the classic normalized many-to-many setup.
--
-- The lower(name) unique index is a *functional* index: it makes "PostgreSQL"
-- and "postgresql" collide, so you cannot end up with both.
CREATE TABLE skills (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT        NOT NULL,
    category   TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_skills_name_lower ON skills (lower(name));


-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
-- An organization that posts jobs.
--
-- owner_id is the employer who administers the company. ON DELETE SET NULL (not
-- CASCADE): a company outlives the individual who created its account. Compare
-- this with jobs.company_id below — choosing the right ON DELETE action per
-- relationship is a real modelling decision, not a default to copy blindly.
CREATE TABLE companies (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id    BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    name        TEXT        NOT NULL,
    description TEXT,
    website     TEXT,
    industry    TEXT,
    headquarters TEXT,
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
--
-- LIFECYCLE — this is the single most important addition for realistic queries:
--
--     draft     written but not visible to candidates
--     open      published and accepting applications
--     closed    the employer stopped accepting applications
--     archived  hidden from the employer's dashboard too
--
-- A posting is *live* (should appear on the public board) only when:
--     status = 'open' AND (expires_at IS NULL OR expires_at > now())
-- That condition shows up in nearly every candidate-facing query. Get used to
-- writing it.
--
-- views_count is a denormalized counter kept alongside the job_views table.
-- Storing the same fact twice is normally a smell — here it is a deliberate
-- trade-off: reading a counter is far cheaper than COUNT(*) over millions of
-- view rows. The price is that every insert into job_views must bump this
-- column *in the same transaction*, or the two drift apart.
--
-- search_vector is a STORED generated column: PostgreSQL recomputes it on every
-- INSERT/UPDATE and keeps it on disk, so full-text search does not re-parse the
-- description on every query. setweight() marks title matches as more important
-- ('A') than description matches ('B'), which ts_rank() then respects.
CREATE TABLE jobs (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id       BIGINT      NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    title            TEXT        NOT NULL,
    description      TEXT,
    salary_min       INTEGER,
    salary_max       INTEGER,
    location         TEXT,
    is_remote        BOOLEAN     NOT NULL DEFAULT false,
    employment_type  TEXT        NOT NULL DEFAULT 'full_time'
                                 CHECK (employment_type IN
                                     ('full_time', 'part_time', 'contract', 'internship')),
    experience_level TEXT        CHECK (experience_level IS NULL OR experience_level IN
                                     ('junior', 'mid', 'senior', 'lead')),
    status           TEXT        NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft', 'open', 'closed', 'archived')),
    views_count      INTEGER     NOT NULL DEFAULT 0,
    published_at     TIMESTAMPTZ,
    expires_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    search_vector    tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED,

    CONSTRAINT jobs_salary_min_nonneg CHECK (salary_min IS NULL OR salary_min >= 0),
    CONSTRAINT jobs_salary_max_nonneg CHECK (salary_max IS NULL OR salary_max >= 0),
    CONSTRAINT jobs_salary_range      CHECK (
        salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max
    ),
    -- A published job must know when it was published. Enforcing the invariant
    -- here means no code path can forget to set it.
    CONSTRAINT jobs_published_has_date CHECK (
        status = 'draft' OR published_at IS NOT NULL
    ),
    CONSTRAINT jobs_views_nonneg CHECK (views_count >= 0)
);


-- ----------------------------------------------------------------------------
-- job_skills   (jobs  N ── N  skills)
-- ----------------------------------------------------------------------------
-- Which skills a posting asks for. is_required separates "must have" from
-- "nice to have", which makes matching queries genuinely interesting: a
-- candidate matches a job only if they hold *all* of its required skills —
-- a HAVING count(...) = (SELECT count(...)) shaped problem.
--
-- The primary key is the pair of foreign keys (a "composite" / "natural" PK).
-- There is no surrogate id column because the pair itself is the identity, and
-- it doubles as the uniqueness guarantee: a skill cannot be listed twice.
CREATE TABLE job_skills (
    job_id      BIGINT  NOT NULL REFERENCES jobs (id)   ON DELETE CASCADE,
    skill_id    BIGINT  NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
    is_required BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (job_id, skill_id)
);


-- ----------------------------------------------------------------------------
-- user_skills   (users  N ── N  skills)
-- ----------------------------------------------------------------------------
-- The other half of the matching problem: what a candidate actually knows.
CREATE TABLE user_skills (
    user_id          BIGINT  NOT NULL REFERENCES users (id)   ON DELETE CASCADE,
    skill_id         BIGINT  NOT NULL REFERENCES skills (id)  ON DELETE CASCADE,
    years_experience INTEGER,

    PRIMARY KEY (user_id, skill_id),

    CONSTRAINT user_skills_years_nonneg CHECK (
        years_experience IS NULL OR years_experience >= 0
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
-- application code — the database is the last line of defense. In the API this
-- surfaces as PostgreSQL error code 23505, which the controller turns into a
-- 409 Conflict.
--
-- ON DELETE CASCADE on both foreign keys: an application only has meaning while
-- both its job and its user exist. Deleting either removes the application.
--
-- status is a real hiring pipeline, not a boolean. The order below is the order
-- candidates move through, which makes funnel queries ("how many reached
-- interview?") natural:
--
--     pending -> reviewing -> interview -> offer -> accepted
--                     \            \         \
--                      `----------- rejected -'
--     withdrawn  (candidate pulled out, from any stage)
CREATE TABLE applications (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id       BIGINT      NOT NULL REFERENCES jobs (id)  ON DELETE CASCADE,
    user_id      BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status       TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'reviewing', 'interview',
                                               'offer', 'accepted', 'rejected',
                                               'withdrawn')),
    cover_letter TEXT,
    resume_url   TEXT,
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT applications_unique_user_job UNIQUE (job_id, user_id)
);


-- ----------------------------------------------------------------------------
-- application_events
-- ----------------------------------------------------------------------------
-- An append-only audit trail: every status change writes one row here, inside
-- the same transaction that updates applications.status.
--
-- Why keep both? applications.status answers "where is this candidate now?" in
-- one lookup; application_events answers "how did they get here, and how long
-- did each stage take?". The second question is what window functions were
-- invented for — LAG() over (PARTITION BY application_id ORDER BY created_at)
-- gives you the previous event's timestamp on the same row, so the gap between
-- stages becomes plain subtraction.
--
-- from_status is NULL for the very first event (the application being created).
CREATE TABLE application_events (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id BIGINT      NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    from_status    TEXT,
    to_status      TEXT        NOT NULL,
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- saved_jobs   (a candidate's bookmarks)
-- ----------------------------------------------------------------------------
-- Same composite-PK pattern as job_skills. Because the PK already enforces
-- uniqueness, "save this job" can be written as a plain INSERT with
-- ON CONFLICT DO NOTHING — no read-then-write race, no duplicate rows.
CREATE TABLE saved_jobs (
    user_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    job_id   BIGINT      NOT NULL REFERENCES jobs (id)  ON DELETE CASCADE,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, job_id)
);


-- ----------------------------------------------------------------------------
-- job_views
-- ----------------------------------------------------------------------------
-- One row per time a posting was opened. user_id is NULL for logged-out
-- visitors, which is exactly the kind of nullable foreign key that makes
-- LEFT JOIN and COUNT(column) vs COUNT(*) behave differently — worth
-- experimenting with.
--
-- This is the project's only "event stream" table: it is the right place to
-- practice date_trunc(), generate_series() gap-filling, and rolling windows.
CREATE TABLE job_views (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id    BIGINT      NOT NULL REFERENCES jobs (id)  ON DELETE CASCADE,
    user_id   BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
-- Foreign-key columns are not indexed automatically in PostgreSQL. Indexing
-- them speeds up JOINs and lookups like "all jobs for a company".
CREATE INDEX idx_jobs_company_id       ON jobs (company_id);
CREATE INDEX idx_applications_user_id  ON applications (user_id);
CREATE INDEX idx_companies_owner_id    ON companies (owner_id);
CREATE INDEX idx_job_skills_skill_id   ON job_skills (skill_id);
CREATE INDEX idx_user_skills_skill_id  ON user_skills (skill_id);
CREATE INDEX idx_saved_jobs_job_id     ON saved_jobs (job_id);
CREATE INDEX idx_app_events_app_id     ON application_events (application_id, created_at);

-- Note: we do NOT add a separate index on applications(job_id). The UNIQUE
-- constraint above creates an index on (job_id, user_id), and PostgreSQL can
-- use its leftmost column (job_id) for lookups — so a standalone job_id index
-- would be redundant. This is a useful thing to understand about composite
-- indexes. The same reasoning applies to job_skills(job_id), user_skills
-- (user_id) and saved_jobs(user_id): their composite primary keys already
-- cover the leftmost column, which is why only the *second* column gets its
-- own index above.

-- A PARTIAL index: it only contains rows matching the WHERE clause. The public
-- job board only ever reads open postings, so indexing the drafts, closed and
-- archived rows would be wasted space. Run EXPLAIN on the browse query with and
-- without this to see the difference.
CREATE INDEX idx_jobs_open_published
    ON jobs (published_at DESC)
    WHERE status = 'open';

-- Filter columns used by the browse endpoint.
CREATE INDEX idx_jobs_employment_type ON jobs (employment_type);
CREATE INDEX idx_jobs_experience_level ON jobs (experience_level);
CREATE INDEX idx_jobs_salary_max      ON jobs (salary_max);
CREATE INDEX idx_applications_status  ON applications (status);

-- Time-series lookups on the view stream: "views for job X since date Y".
CREATE INDEX idx_job_views_job_time   ON job_views (job_id, viewed_at DESC);

-- GIN is the index type for full-text search. It indexes every lexeme in the
-- tsvector, so `WHERE search_vector @@ websearch_to_tsquery('english', $1)`
-- can be answered without scanning the table.
CREATE INDEX idx_jobs_search_vector   ON jobs USING GIN (search_vector);

-- OPTIONAL — trigram index for fuzzy ILIKE '%term%' matching, which a normal
-- B-tree index cannot help with. Requires the pg_trgm extension, which needs
-- privileges your local user may not have. Uncomment if you want to explore it:
--
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   CREATE INDEX idx_companies_name_trgm ON companies USING GIN (name gin_trgm_ops);
