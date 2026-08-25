# Project context — Job Board (PostgreSQL learning backend)

> Paste this whole file into a new chat before asking anything about the project.

---

## How I want you to help me

I am a **frontend developer learning SQL and PostgreSQL deliberately**. Databases
are my weak area and this project exists to fix that. The SQL is the point — the
API around it is scaffolding.

So, when I ask about a feature that needs a query:

- **Do not open with the finished query.** Help me reason: what data does this
  need, which tables, what shape is the result?
- Ask me what I think the SQL should be, let me attempt it, then review my
  attempt and explain what is wrong and why.
- Show the full solution when I explicitly ask for it, or after I have had a go.
  When you do, explain it rather than just pasting it.
- Point out *what* is wrong with an approach ("this will multiply your counts
  together", "this drops rows that have no match") before naming the construct
  that fixes it.

PostgreSQL is the source of truth. I also practise on SQLZoo, which is MySQL, so
flag where the two differ instead of assuming MySQL syntax works.

---

## What the project is

A Node.js + Express backend for a job board: companies post jobs, candidates
apply. It exposes an HTTP API over PostgreSQL.

**Hard constraints — these are deliberate, do not suggest changing them:**

- **No ORM, no query builder.** No Prisma, Drizzle, Sequelize, TypeORM, Knex.
- All SQL is hand-written and lives **at the call site** inside
  `pool.query(...)`, so it is always visible.
- All user input goes through **parameterised queries** (`$1`, `$2`, …). Never
  string concatenation.

**Stack:** Node 22 · Express 5 · `pg` (node-postgres) 8 · TypeScript with native
ES modules · **PostgreSQL 18.6** on Windows.

---

## Schema

Ten tables. Conventions used throughout: `BIGINT GENERATED ALWAYS AS IDENTITY`
(not `SERIAL`), `TIMESTAMPTZ` (not `TIMESTAMP`), `TEXT` (not `VARCHAR(n)`).

```sql
users
  id               BIGINT IDENTITY PK
  name             TEXT NOT NULL
  email            TEXT NOT NULL UNIQUE
  role             TEXT NOT NULL CHECK (role IN ('candidate','employer'))
  headline         TEXT              -- candidate-only, NULL for employers
  location         TEXT              -- candidate-only
  years_experience INTEGER           -- candidate-only, CHECK 0..60
  is_active        BOOLEAN NOT NULL DEFAULT true
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()

skills
  id         BIGINT IDENTITY PK
  name       TEXT NOT NULL          -- UNIQUE INDEX on lower(name)
  category   TEXT                   -- 'database' | 'language' | 'framework' | 'infrastructure'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()

companies
  id           BIGINT IDENTITY PK
  owner_id     BIGINT REFERENCES users(id) ON DELETE SET NULL
  name         TEXT NOT NULL
  description  TEXT
  website      TEXT
  industry     TEXT
  headquarters TEXT
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()

jobs
  id               BIGINT IDENTITY PK
  company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE
  title            TEXT NOT NULL
  description      TEXT
  salary_min       INTEGER           -- nullable; CHECK >= 0
  salary_max       INTEGER           -- nullable; CHECK >= 0; CHECK min <= max
  location         TEXT
  is_remote        BOOLEAN NOT NULL DEFAULT false
  employment_type  TEXT NOT NULL DEFAULT 'full_time'
                     CHECK (IN ('full_time','part_time','contract','internship'))
  experience_level TEXT CHECK (IS NULL OR IN ('junior','mid','senior','lead'))
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (IN ('draft','open','closed','archived'))
  views_count      INTEGER NOT NULL DEFAULT 0   -- denormalised counter, see job_views
  published_at     TIMESTAMPTZ       -- CHECK: status='draft' OR published_at IS NOT NULL
  expires_at       TIMESTAMPTZ       -- NULL means never expires
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  search_vector    tsvector GENERATED ALWAYS AS (
                     setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                     setweight(to_tsvector('english', coalesce(description,'')), 'B')
                   ) STORED

job_skills                            -- jobs N:M skills
  job_id      BIGINT NOT NULL REFERENCES jobs(id)   ON DELETE CASCADE
  skill_id    BIGINT NOT NULL REFERENCES skills(id) ON DELETE CASCADE
  is_required BOOLEAN NOT NULL DEFAULT true         -- must-have vs nice-to-have
  PRIMARY KEY (job_id, skill_id)

user_skills                           -- users N:M skills
  user_id          BIGINT NOT NULL REFERENCES users(id)  ON DELETE CASCADE
  skill_id         BIGINT NOT NULL REFERENCES skills(id) ON DELETE CASCADE
  years_experience INTEGER
  PRIMARY KEY (user_id, skill_id)

applications                          -- jobs N:M users
  id           BIGINT IDENTITY PK
  job_id       BIGINT NOT NULL REFERENCES jobs(id)  ON DELETE CASCADE
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (IN ('pending','reviewing','interview','offer',
                            'accepted','rejected','withdrawn'))
  cover_letter TEXT
  resume_url   TEXT
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  UNIQUE (job_id, user_id)            -- a user applies to a job at most once

application_events                    -- append-only audit trail
  id             BIGINT IDENTITY PK
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE
  from_status    TEXT                 -- NULL on the first event
  to_status      TEXT NOT NULL
  note           TEXT
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()

saved_jobs                            -- candidate bookmarks
  user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  job_id   BIGINT NOT NULL REFERENCES jobs(id)  ON DELETE CASCADE
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
  PRIMARY KEY (user_id, job_id)

job_views                             -- event stream, one row per page open
  id        BIGINT IDENTITY PK
  job_id    BIGINT NOT NULL REFERENCES jobs(id)  ON DELETE CASCADE
  user_id   BIGINT REFERENCES users(id) ON DELETE SET NULL  -- NULL = logged out
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:** FK columns (`jobs.company_id`, `applications.user_id`,
`companies.owner_id`, `job_skills.skill_id`, `user_skills.skill_id`,
`saved_jobs.job_id`, `application_events(application_id, created_at)`); a
**partial** index `jobs(published_at DESC) WHERE status='open'`; filter indexes on
`employment_type`, `experience_level`, `salary_max`, `applications.status`;
`job_views(job_id, viewed_at DESC)`; a **GIN** index on `jobs.search_vector`; a
**functional** unique index on `lower(skills.name)`.

Deliberately *not* indexed: `applications(job_id)`, `job_skills(job_id)`,
`user_skills(user_id)`, `saved_jobs(user_id)` — each is the leftmost column of an
existing composite key, so a separate index would be redundant.

`pg_trgm` is available but not enabled (commented out in `schema.sql`).

---

## Business rules that shape most queries

1. **A posting is LIVE** — visible to candidates — only when:
   ```sql
   status = 'open' AND (expires_at IS NULL OR expires_at > now())
   ```
   Candidate-facing endpoints must apply it. Employer-facing endpoints must not,
   because an employer still needs their drafts, closed and expired postings.

2. **One application per candidate per job**, enforced by
   `UNIQUE (job_id, user_id)` — not by a check-then-insert in JavaScript.

3. **`applications.status` and `application_events` must never disagree.** Every
   status change writes both, in one transaction.

4. **`jobs.views_count` is denormalised.** Every insert into `job_views` must bump
   it in the same transaction, or the two drift apart.

5. **Pipeline order** (not alphabetical):
   ```
   pending -> reviewing -> interview -> offer -> accepted
                   \            \         \
                    `----------- rejected -'
   withdrawn  (candidate pulled out, from any stage)
   ```
   `accepted`, `rejected` and `withdrawn` are terminal.

---

## Seed data (`sql/seed.sql`)

Small on purpose, but every row is there to make some query interesting.
Re-runnable — it truncates first. Time-sensitive rows use `now() ± interval` so
they stay meaningful whenever it is run.

**Counts:** 8 users (5 candidates, 3 employers) · 14 skills · 4 companies ·
11 jobs · 26 job_skills · 18 user_skills · 15 applications ·
41 application_events · 8 saved_jobs · 174 job_views.

**Users:** Alice (backend, 7y), Bob (full-stack, 4y), Carol (frontend, 9y),
David (devops, 5y), Emma (data, 2y) are candidates. Frank, Grace, Henry are
employers. Frank owns two companies (Acme Corp, Umbrella Systems); Grace owns
Globex Inc; Henry owns Initech.

**Jobs — 7 of 11 are live.** The other 4 are each a different reason for not
being live, which is the point:

| Posting | Status | Why it matters |
| --- | --- | --- |
| Senior Backend Engineer | live | 3 applicants; requires 3 skills that no single candidate has |
| Frontend Developer | live | 2 applicants |
| Data Analyst | live | 3 applicants |
| DevOps Engineer | live | most-viewed posting |
| Product Manager | live | no expiry date at all |
| Machine Learning Engineer | live | expires in ~4 days |
| Junior Backend Engineer | live | **NULL salaries, zero applications** |
| Technical Writer | **draft** | never published, `published_at` is NULL |
| Support Engineer | **open but expired** | the trap: status says live, the date says no |
| QA Engineer | **closed** | still has an applicant — closing ≠ rejecting |
| Solutions Architect | **archived** | still has an applicant |

**Other deliberate shapes:**
- **Emma has no skills recorded** — skill-matching queries must not return
  everything for her.
- Applications exist against the closed, expired and archived postings.
- All 7 pipeline stages appear across the 15 applications.
- `application_events` always ends at the application's current status, so
  "current status" and "last event" agree.
- `job_views` spread over 28 distinct days, ~1/3 with `user_id` NULL, and the
  per-job counts vary — so `COUNT(*)` vs `COUNT(user_id)` differ, and
  time-series queries have real gaps to deal with.

---

## Code layout and conventions

```
src/
  server.ts                 Express app, routers, /health, JSON 404 + error handler
  db.ts                     the single pg Pool (DATABASE_URL)
  routes/                   jobs, users, companies, applications, skills, analytics
  controllers/              request handlers — SQL lives here
  types/database.ts         row types + "projection rows" (query output shapes)
  utils/http.ts             query-param parsing + PG error code -> HTTP status
sql/schema.sql              tables, constraints, indexes (drops first, re-runnable)
sql/seed.sql                sample data (truncates first, re-runnable)
postman/                    61 requests covering every endpoint
```

**The controllers are the exercise.** Each handler is fully written *except the
SQL*, which is an empty template literal:

```ts
export async function listUsers(req: Request, res: Response): Promise<void> {
  const page = pagination(req.query);
  try {
    const result: QueryResult<UserRow & { total_count: string }> = await pool.query<
      UserRow & { total_count: string }
    >(``, [                                     // <- I write the SQL here
      queryEnum(req.query.role, USER_ROLES),    // $1
      queryString(req.query.q),                 // $2
      queryBool(req.query.include_inactive) ?? false, // $3
      page.limit,                               // $4
      page.offset,                              // $5
    ]);
    res.json(paginated(result.rows, page));
  } catch (err: unknown) {
    handleDbError(err, res, 'Failed to list users', 'Failed to fetch users');
  }
}
```

Above each handler is a **plain-English description of the feature** — what it
does, who uses it, what rules it honours. No SQL hints, on purpose.

Conventions to know when helping:

- **`$1..$n` are exactly the array below the query, in order.**
- **The columns my `SELECT` must return** are the fields of the type in the
  `pool.query<…>()` generic. Types under *"Projection rows"* in
  `types/database.ts` exist only to describe query output.
- **Optional filters arrive as `null`, not `undefined`.** The helpers in
  `utils/http.ts` guarantee that, so a single query can express an optional
  filter rather than building SQL strings conditionally in JavaScript.
- **List endpoints return a `total_count` column** which `paginated()` reads off
  the first row to compute page count — so the query itself is expected to carry
  the pre-pagination total.
- **Constraint violations become HTTP statuses**, mapped in `utils/http.ts`:
  `23505` → 409, `23503` → 400, `23514`/`23502` → 400. So I generally let the
  database reject bad data rather than pre-checking in JS.
- **Transactions** use `pool.connect()` with explicit
  `BEGIN`/`COMMIT`/`ROLLBACK`; those strings are already written, the data
  statements inside are not.

**node-postgres gotcha baked into the types:** `BIGINT` comes back as a **string**
(JS numbers can't hold every BIGINT). So do `count()`, `sum()`, `avg()` and
`percentile_cont()`. Hence `DbId = string`, `DbCount = string`,
`DbNumeric = string | null`.

---

## Endpoints (59 handlers, all routed, 69 query sites)

| Resource | Endpoints |
| --- | --- |
| Jobs | `GET /api/jobs` · `/trending` · `/expiring` · `/manage` · `GET\|PATCH\|DELETE /:id` · `/:id/similar` · `/:id/skills` (GET, PUT) · `/:id/applications` · `/:id/views` · `POST /:id/view` · `POST /:id/publish` · `POST /:id/close` |
| Users | `GET\|POST /api/users` · `/candidates/search` · `GET\|PATCH\|DELETE /:id` · `POST /:id/deactivate` · `/:id/skills` (GET, PUT) · `/:id/applications` · `/:id/dashboard` · `/:id/recommended-jobs` |
| Saved jobs | `GET\|POST /api/users/:userId/saved-jobs` · `DELETE /api/users/:userId/saved-jobs/:jobId` |
| Companies | `GET\|POST /api/companies` · `/top` · `GET\|PATCH\|DELETE /:id` · `/:id/jobs` · `/:id/funnel` · `/:id/salary-bands` |
| Applications | `GET\|POST /api/applications` · `/funnel` · `POST /bulk-reject` · `GET\|DELETE /:id` · `/:id/timeline` · `PATCH /:id/status` · `POST /:id/withdraw` |
| Skills | `GET\|POST /api/skills` · `/demand` · `DELETE /:id` |
| Analytics | `/api/analytics/overview` · `/salary-benchmarks` · `/applications-over-time` · `/top-jobs-per-company` · `/conversion` · `/time-to-hire` |

There is **no authentication**. Endpoints that would be scoped to a logged-in
user take the acting user's id as a parameter instead (`?company_id=`, `user_id`
in the body). Where ownership matters — withdrawing your own application,
removing your own bookmark — the check belongs in the `WHERE` clause.

---

## Work order — all 69 query sites, in the order to write them

69 empty query sites across 7 controllers (`listUsers` is the only one with SQL
in it so far). They are **not** ordered by file, because no single controller is
uniformly easy — `usersController` alone spans the easiest query in the project
and three of the hardest. Each stage below only uses concepts from the stages
above it.

Tick these off as they go green.

### Stage 1 — Single-table reads and writes (7 sites)

`usersController`, the CRUD half. No joins yet.

- [X] `listUsers` — `GET /api/users` — optional filters via `$1 IS NULL OR ...`, `ILIKE` with wildcards, `COUNT(*) OVER ()` for the total, and a stable `ORDER BY` so pagination doesn't repeat rows
- [X] `createUser` — `POST /api/users` — `INSERT ... RETURNING`; make `Alice@` and `alice@` collide
- [ ] `updateUser` — `PATCH /api/users/:id` — partial update with `COALESCE($n, column)`
- [ ] `deactivateUser` — `POST /api/users/:id/deactivate` — `UPDATE ... RETURNING`, idempotent
- [ ] `deleteUser` — `DELETE /api/users/:id` — `DELETE ... RETURNING`; count the other tables before and after (Frank owns two companies, Alice has applications and views)
- [ ] `getUserSkills` — `GET /api/users/:id/skills` — first join; `ORDER BY ... DESC NULLS LAST`
- [ ] `getUserById` — `GET /api/users/:id` — counts from three other tables on one row

### Stage 2 — Junction tables and idempotent writes (3 sites)

`savedJobsController`. Smallest file in the repo, and the cleanest introduction
to a many-to-many table.

- [ ] `saveJob` — `POST /api/users/:userId/saved-jobs` — `INSERT ... SELECT` to gate on "job is live", `ON CONFLICT DO NOTHING RETURNING` so the second tap returns no row instead of erroring
- [ ] `unsaveJob` — `DELETE .../saved-jobs/:jobId` — ownership belongs in the `WHERE`, not in an `if` above it
- [ ] `listSavedJobs` — `GET /api/users/:userId/saved-jobs` — `LEFT JOIN` to the job, `EXISTS` for "already applied", and a bookmark that must survive its posting expiring

### Stage 3 — Grouping, and the LEFT JOIN zero (4 sites)

`skillsController`. The `demand` query is where most people meet the single most
common aggregation bug.

- [ ] `listSkills` — `GET /api/skills` — rank prefix matches above substring matches (`ORDER BY CASE WHEN ... THEN 0 ELSE 1 END`)
- [ ] `createSkill` — `POST /api/skills` — `ON CONFLICT DO UPDATE` upsert, safe under a double-submit
- [ ] `deleteSkill` — `DELETE /api/skills/:id` — what the FKs from `job_skills` / `user_skills` do here
- [ ] `getSkillDemand` — `GET /api/skills/demand` — **the lesson:** a `WHERE` clause on the right-hand table silently turns a `LEFT JOIN` back into an inner one and drops every zero-demand skill. Put the "live posting" condition in the `ON`, and use `COUNT(DISTINCT ...)` once two joins multiply rows

### Stage 4 — Aggregates per group (9 sites)

`companiesController`. Same zero-preservation lesson as Stage 3, at scale, plus
the first window function.

- [ ] `updateCompany` — `PATCH /api/companies/:id` — `COALESCE` again, now familiar
- [ ] `createCompany` — `POST /api/companies` — `INSERT ... SELECT` that only inserts if `owner_id` is a user with role `employer`; zero rows back means a 400
- [ ] `listCompanyJobs` — `GET /api/companies/:id/jobs` — one query, two audiences, switched by a boolean parameter inside the predicate
- [ ] `listCompanies` — `GET /api/companies` — `COUNT(*) FILTER (WHERE ...)` for live postings, keeping companies with zero
- [ ] `getCompanyById` — `GET /api/companies/:id` — several aggregates at once; `AVG` skips NULL salaries on its own, and a company with no owner must not vanish
- [ ] `getTopHiringCompanies` — `GET /api/companies/top` — time-windowed counts plus `HAVING` for the minimum-activity cut
- [ ] `deleteCompany` — `DELETE /api/companies/:id` — a guard expressed as a `WHERE ... AND (NOT EXISTS (live jobs) OR $2)`; delete Initech and count the wreckage
- [ ] `getCompanyFunnel` — `GET /api/companies/:id/funnel` — `unnest($3::text[])` LEFT JOINed to the counts, so every stage appears in pipeline order including the empty ones
- [ ] `getCompanySalaryBands` — `GET /api/companies/:id/salary-bands` — first window function: `AVG(...) OVER (PARTITION BY company_id)` to compare each row against its own group

### Stage 5 — Big filtered reads, and the first transactions (20 sites)

`jobsController`. The largest file. Start with its small queries, finish with the
two multi-statement transactions.

- [ ] `getJobSkills` — `GET /api/jobs/:id/skills` — required before nice-to-have
- [ ] `getJobById` — `GET /api/jobs/:id` — detail plus application and bookmark counts
- [ ] `createJob` — `POST /api/jobs` — omit columns entirely so the schema defaults apply; status is forced to `draft`, never taken from the client
- [ ] `updateJob` — `PATCH /api/jobs/:id` — `COALESCE`, with `status <> 'archived'` in the `WHERE` so an archived posting comes back as zero rows
- [ ] `publishJob` — `POST /api/jobs/:id/publish` — conditional `UPDATE` guarded on current status; re-opening a closed posting keeps its original `published_at`
- [ ] `closeJob` — `POST /api/jobs/:id/close` — same shape, narrower guard
- [ ] `deleteJob` (archive branch) — soft delete, history intact
- [ ] `deleteJob` (hard branch) — `?hard=true`; run it once against seed data and see how far the cascade reaches
- [ ] `listCompanyJobsForEmployer` — `GET /api/jobs/manage` — the mirror image of the public board: same table, inverted visibility rules
- [ ] `browseJobs` — `GET /api/jobs` — the big one. Thirteen parameters, every filter optional and combinable, `= ANY($8::bigint[])` for skills, and a dynamic sort via `ORDER BY CASE $11 WHEN 'salary_high' THEN ... END`. Decide what a salary filter does to postings with no salary listed
- [ ] `getExpiringJobs` — `GET /api/jobs/expiring` — interval arithmetic and days-remaining
- [ ] `getSimilarJobs` — `GET /api/jobs/:id/similar` — self-join through `job_skills`, ranked by shared-skill count; a posting with no skills must not match the whole board
- [ ] `listJobApplicants` — `GET /api/jobs/:id/applications` — match score as matched-required-skills over total-required
- [ ] `recordJobView` (insert) — `INSERT ... SELECT` that yields no row unless the posting is live
- [ ] `recordJobView` (counter) — `UPDATE ... RETURNING` in the **same transaction**; this is business rule 4, and the two rows drift apart forever if it isn't
- [ ] `setJobSkills` (delete) — remove what is no longer in the submitted list: `NOT (skill_id = ANY($2::bigint[]))`
- [ ] `setJobSkills` (upsert) — `unnest($2::bigint[], $3::boolean[])` to insert two parallel arrays in one statement, with `ON CONFLICT DO UPDATE` for changed flags
- [ ] `setJobSkills` (read-back) — inside the transaction, before `COMMIT`
- [ ] `getTrendingJobs` — `GET /api/jobs/trending` — two time windows counted side by side and compared for direction
- [ ] `getJobViewStats` — `GET /api/jobs/:id/views` — `generate_series` LEFT JOINed to `date_trunc` buckets so quiet days come back as zeros rather than missing, split logged-in vs anonymous with `FILTER`

### Stage 6 — The hard users endpoints, revisited (7 sites)

Come back to what was skipped in Stage 1. Every one of these is now a variation
on something already written.

- [ ] `listUserApplications` — `GET /api/users/:id/applications` — multi-join; applications to expired postings still belong here
- [ ] `getUserDashboard` — `GET /api/users/:id/dashboard` — six `COUNT(*) FILTER (WHERE ...)` in one pass; a candidate who has done nothing gets zeros, not an empty response
- [ ] `setUserSkills` (delete / upsert / read-back — 3 sites) — the same `unnest` + `ON CONFLICT` transaction as `setJobSkills`, with years instead of flags. Employers must be refused
- [ ] `searchCandidates` — `GET /api/users/candidates/search` — ANY vs ALL matching: `HAVING COUNT(DISTINCT skill_id) = cardinality($1)` is the difference between the two
- [ ] `getRecommendedJobs` — `GET /api/users/:id/recommended-jobs` — scoring against a profile, `NOT EXISTS` to exclude jobs already applied to, and deciding what Emma (no skills at all) should see

### Stage 7 — Transactions and concurrency (13 sites)

`applicationsController`. The rules from `## Business rules` are the whole point
of this file — status and history must never disagree.

- [ ] `getApplicationById` — `GET /api/applications/:id` — the widest join in the project: application + candidate + job + company + skill overlap
- [ ] `deleteApplication` — `DELETE /api/applications/:id`
- [ ] `listApplications` — `GET /api/applications` — the employer inbox; `stale_days` ("untouched for N days"), and sorting by **pipeline order**, which is not alphabetical
- [ ] `applyToJob` (insert) — `INSERT ... SELECT` gated on live-job-and-real-candidate; the `UNIQUE (job_id, user_id)` is what stops the double-clicked Apply button, not a check-then-insert
- [ ] `applyToJob` (history) — the `pending` event, same transaction
- [ ] `withdrawApplication` (update) — ownership and "not already terminal", both in the `WHERE`
- [ ] `withdrawApplication` (history)
- [ ] `updateApplicationStatus` (lock) — `SELECT ... FOR UPDATE`; this is the row lock that stops two recruiters writing conflicting history
- [ ] `updateApplicationStatus` (update) — guarded against terminal statuses
- [ ] `updateApplicationStatus` (history) — records where it came from
- [ ] `bulkRejectApplications` — `POST /api/applications/bulk-reject` — **one** round trip however many ids: `WHERE id = ANY($1) AND status = ANY($2)`, with a CTE writing the history rows and `RETURNING` telling you how many actually moved
- [ ] `getApplicationTimeline` — `GET /api/applications/:id/timeline` — `LAG()` for the gap since the previous step; the first step has no gap
- [ ] `getApplicationFunnel` — `GET /api/applications/funnel` — the company funnel again, platform-wide

### Stage 8 — Reporting (6 sites)

`analyticsController`. Nothing writes. Every one of these assumes the stages
above.

- [ ] `getTopJobsPerCompany` — `GET /api/analytics/top-jobs-per-company` — `ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY ...)` in a subquery, filtered outside it. The canonical top-N-per-group
- [ ] `getApplicationsOverTime` — `/applications-over-time` — `generate_series` + `date_trunc` gap filling, now with a variable bucket
- [ ] `getOverview` — `/overview` — eleven numbers from five tables in one round trip; CTEs keep it readable
- [ ] `getConversionRates` — `/conversion` — **the trap:** current status cannot answer this. Someone at `rejected` today may have been interviewed on the way there. Count from `application_events`, and keep rejection/withdrawal out of the chain
- [ ] `getSalaryBenchmarks` — `/salary-benchmarks` — `percentile_cont` for median and quartiles, `GROUP BY` chosen at runtime, `HAVING count >= min_sample` so no benchmark is published from one posting
- [ ] `getTimeToHire` — `/time-to-hire` — median gap per transition, from the event history; applications still in progress are excluded, not treated as ending today

---

## Where I am right now

- Schema and seed are **loaded and verified** against PostgreSQL 18.6.
- All 59 endpoints are routed and respond; an empty query returns no rows, so
  each endpoint currently answers with an empty list or its own 404/409 guard.
- **SQL written so far: 1 of 69 query sites.** `listUsers` now applies all five
  parameters and returns `total_count` via `COUNT(*) OVER ()`. Two things still
  wrong with it: `ILIKE $2` has no `%` wildcards, so `?q=Ali` finds nothing
  because it is an exact case-insensitive match rather than a search; and
  `LIMIT/OFFSET` with no `ORDER BY` means page 2 may repeat or skip rows.

The concept ladder I am climbing: basic reads → optional filters → writes with
`RETURNING` → joins → aggregation → outer joins that must keep empty groups →
many-to-many matching → upserts and bulk writes → transactions and row locking →
window functions → CTEs, time series and percentiles.

**See `## Work order` above for the query-by-query checklist** — 8 stages mapped
onto that ladder, each one using only concepts from the stages before it.
