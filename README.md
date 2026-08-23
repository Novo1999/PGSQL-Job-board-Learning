# Job Board — SQL / PostgreSQL Learning Backend

A minimal but real **Job Board** backend, built as a hands-on environment for
learning **SQL and PostgreSQL** deeply.

## 1. What this is

A Node.js + Express backend for a job board: companies post jobs, and candidates
apply to them. It exposes a small HTTP API over a PostgreSQL database.

## 2. Why it exists

I'm a frontend developer who already knows how to code — my weak area is
databases. This project is a deliberate practice ground: the **database and SQL
are the point**, not the API surface. Queries are written by hand and kept
visible so the SQL is always front and center.

## 3. Tech stack

- **Node.js** + **Express** — HTTP server
- **PostgreSQL** — the database (the star of the show)
- **[`pg`](https://node-postgres.com/)** (node-postgres) — the PostgreSQL driver
- **TypeScript** — application code with native ES modules
- **dotenv** — loads configuration from `.env`
- **tsx** — runs and watches TypeScript during development

> **No ORM. No query builder.** No Prisma / Drizzle / Sequelize / TypeORM /
> Knex. All SQL is written and visible by design.

## 4. Prerequisites

- **Node.js 18+** (developed on Node 22)
- **PostgreSQL 14+** installed and running locally, including the `psql` and
  `createdb` command-line tools

Check what you have:

```bash
node --version
psql --version
```

## 5. Create the PostgreSQL database

```bash
createdb job_board
```

If `createdb` isn't on your PATH, you can do the same from inside `psql`:

```bash
psql -U postgres -c "CREATE DATABASE job_board;"
```

**OS notes**
- **macOS** (Homebrew): `brew install postgresql@16` then `brew services start postgresql@16`.
- **Windows**: install from [postgresql.org/download](https://www.postgresql.org/download/windows/).
  The installer includes `psql`; you may need to add its `bin` folder
  (e.g. `C:\Program Files\PostgreSQL\16\bin`) to your PATH, or use the bundled
  "SQL Shell (psql)" app.
- **Linux** (Debian/Ubuntu): `sudo apt install postgresql`.

## 6. Configure `.env`

Copy the example file and edit it to match your local PostgreSQL setup:

```bash
cp .env.example .env          # macOS / Linux
copy .env.example .env        # Windows CMD
Copy-Item .env.example .env   # Windows PowerShell
```

Then set your connection string in `.env`:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/job_board
PORT=3000
```

`.env` is gitignored — never commit it.

## 7. Load the schema

```bash
psql -d job_board -f sql/schema.sql
```

This creates all ten tables — `users`, `skills`, `companies`, `jobs`,
`job_skills`, `user_skills`, `applications`, `application_events`, `saved_jobs`
and `job_views` — with their constraints and indexes. The script drops the
tables first, so it's safe to re-run while you experiment.

## 8. Load the seed data

```bash
psql -d job_board -f sql/seed.sql
```

This loads a small, deliberately-shaped dataset (see below). It's also safe to
re-run — it truncates the tables first.

## 9. Start the server

```bash
npm install     # first time only — installs dependencies
npm run dev     # development, auto-restarts on file changes
# or
npm start       # plain run
```

Then verify it's alive:

```bash
curl http://localhost:3000/health
# -> {"status":"ok","db":"connected"}

curl http://localhost:3000/api/jobs
```

## 10. Project structure

```
.
├── src/
│   ├── server.ts              # Express app + /health check
│   ├── db.ts                  # single pg connection pool (reused everywhere)
│   ├── routes/                # URL -> controller wiring (one file per resource)
│   │   ├── jobs.ts
│   │   ├── users.ts
│   │   ├── companies.ts
│   │   ├── applications.ts
│   │   ├── skills.ts
│   │   └── analytics.ts
│   ├── controllers/           # request handlers — SQL lives here, visible
│   │   ├── jobsController.ts
│   │   ├── usersController.ts
│   │   ├── companiesController.ts
│   │   ├── applicationsController.ts
│   │   ├── savedJobsController.ts
│   │   ├── skillsController.ts
│   │   └── analyticsController.ts
│   ├── types/
│   │   └── database.ts        # row + projection types (the shape each query returns)
│   ├── utils/
│   │   └── http.ts            # query-param parsing + PostgreSQL error -> HTTP status
│   └── services/              # reserved for reusable query logic (empty for now)
├── sql/
│   ├── schema.sql             # tables, constraints, foreign keys, indexes
│   └── seed.sql               # sample data
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

> The project lives in the repository root rather than a nested `job-board/`
> folder — this repo *is* the project.

## 11. How SQL is intentionally kept explicit

Every database call goes through `pool.query(...)` with the SQL written right
there, so you can always read exactly what runs:

```js
const result = await pool.query(
  `
    SELECT *
    FROM jobs
    ORDER BY created_at DESC
  `
);
```

When user input is involved, always use **parameterized queries** (`$1`, `$2`, …)
— never string-concatenate input into SQL (that's how SQL injection happens):

```js
const result = await pool.query(
  `
    SELECT *
    FROM jobs
    WHERE title ILIKE $1
  `,
  [`%${search}%`]
);
```

## 12. The database model

```
                     ┌── job_skills ──┐
companies ──1──N── jobs ──1──N── applications ──N──1── users ──N── user_skills
                     │                    │                            │
                     ├── saved_jobs ──────┼────────────────────────────┘
                     └── job_views        └── application_events
                                                                    skills
```

| Relationship | Cardinality | Notes |
| --- | --- | --- |
| `companies` → `jobs` | 1 : N | `ON DELETE CASCADE` — a job cannot outlive its company |
| `users` → `companies` | 1 : N | via `owner_id`, `ON DELETE SET NULL` — a company outlives its owner |
| `jobs` ↔ `users` | N : M | through `applications`; `UNIQUE (job_id, user_id)` |
| `jobs` ↔ `skills` | N : M | through `job_skills` (`is_required` splits must-have from nice-to-have) |
| `users` ↔ `skills` | N : M | through `user_skills` |
| `users` ↔ `jobs` | N : M | through `saved_jobs` (bookmarks) |
| `applications` → `application_events` | 1 : N | append-only audit trail of every status change |
| `jobs` → `job_views` | 1 : N | event stream; `user_id` is NULL for logged-out visitors |

Two rules carry most of the weight:

**A posting is *live* only when** `status = 'open' AND (expires_at IS NULL OR
expires_at > now())`. Candidate-facing queries must apply it; employer-facing
queries must not. Nearly every query in the project sits on one side of that
line.

**`applications.status` and `application_events` must never disagree.** Every
status change writes both, inside one transaction.

### How the seed data is shaped

It is small (11 jobs, 15 applications) but every row is there for a reason:

| What | Why |
| --- | --- |
| **Junior Backend Engineer** — no applications, NULL salaries | `LEFT JOIN`, `NULL` / `COALESCE`, `avg()` ignoring NULLs |
| **Technical Writer** — `draft` | never published; must not leak to candidates |
| **Support Engineer** — `open` but `expires_at` in the past | the trap: status alone says live, the date says otherwise |
| **QA Engineer** — `closed`, still has applicants | closing ≠ rejecting; employer queries must still find them |
| **Solutions Architect** — `archived` | hidden even from the employer dashboard |
| **Data Analyst** / **Senior Backend Engineer** — 3 applicants each | `GROUP BY`, `HAVING`, ranking |
| **Emma** — a candidate with zero skills recorded | matching queries must not return everything for her |
| **Frank** — owns two companies | grouping by owner |
| **Senior Backend Engineer** — 3 required skills, nobody holds all 3 | strict "matches every requirement" correctly returns nothing |
| **174 `job_views` spread over 28 days**, ~1/3 anonymous | `date_trunc`, gap-filling, `COUNT(*)` vs `COUNT(user_id)` |
| Applications spread across all 7 pipeline stages | funnels, conversion rates, `LAG()` over the event trail |

## 13. The controllers are the exercise

Every controller in `src/controllers/` is fully written **except the SQL**:

```ts
const result = await pool.query<JobListItemRow>(``, [ /* $1, $2, ... */ ]);
//                                            ^^ your job
```

Above each one is a plain-English description of the feature: what it is for,
who uses it, and the rules it has to honour. No SQL, no hints — working out the
query is the point.

The rest of the information you need is in the code itself:

- The **values passed to the query** are right there in the array, so `$1`, `$2`,
  … are whatever that array holds, in order.
- The **columns your `SELECT` must produce** are the fields of the type in the
  `pool.query<…>()` generic. Those types live in `src/types/database.ts`, and
  the ones under *Projection rows* exist purely to describe query output.

Nothing crashes while a query is still blank: an empty query string returns no
rows, so the endpoint answers with an empty list or its own `404` / `409` guard.
That means you can fill them in one at a time and test as you go, with the
Postman collection in `postman/` or with `curl`.

### Suggested order

Difficulty climbs roughly with this list:

| # | Theme | Start with |
| --- | --- | --- |
| 1 | Reads, filters, pagination | `getJobById`, `listSkills`, `getJobSkills` |
| 2 | Optional filters in one query | `browseJobs`, `listUsers`, `listCompanies` |
| 3 | Writes + `RETURNING` | `createJob`, `createUser`, `updateJob` |
| 4 | JOINs | `listUserApplications`, `listCompanyJobs` |
| 5 | Aggregation, `GROUP BY` / `HAVING` | `getUserDashboard`, `getTopHiringCompanies` |
| 6 | Outer joins that must keep empty groups | `listCompanies`, `getApplicationFunnel` |
| 7 | Many-to-many matching, relational division | `searchCandidates`, `getRecommendedJobs` |
| 8 | Upserts, `ON CONFLICT`, bulk writes | `saveJob`, `createSkill`, `setJobSkills` |
| 9 | Transactions + row locking | `applyToJob`, `updateApplicationStatus`, `recordJobView` |
| 10 | Window functions | `getCompanySalaryBands`, `getApplicationTimeline` |
| 11 | CTEs, time series, percentiles | everything in `analyticsController.ts` |

## 14. API surface

| Resource | Endpoints |
| --- | --- |
| Jobs | `GET /api/jobs` · `/trending` · `/expiring` · `/manage` · `GET|PATCH|DELETE /:id` · `/:id/similar` · `/:id/skills` (GET, PUT) · `/:id/applications` · `/:id/views` · `POST /:id/view` · `POST /:id/publish` · `POST /:id/close` |
| Users | `GET|POST /api/users` · `/candidates/search` · `GET|PATCH|DELETE /:id` · `POST /:id/deactivate` · `/:id/skills` (GET, PUT) · `/:id/applications` · `/:id/dashboard` · `/:id/recommended-jobs` |
| Saved jobs | `GET|POST /api/users/:userId/saved-jobs` · `DELETE /api/users/:userId/saved-jobs/:jobId` |
| Companies | `GET|POST /api/companies` · `/top` · `GET|PATCH|DELETE /:id` · `/:id/jobs` · `/:id/funnel` · `/:id/salary-bands` |
| Applications | `GET|POST /api/applications` · `/funnel` · `POST /bulk-reject` · `GET|DELETE /:id` · `/:id/timeline` · `PATCH /:id/status` · `POST /:id/withdraw` |
| Skills | `GET|POST /api/skills` · `/demand` · `DELETE /:id` |
| Analytics | `/api/analytics/overview` · `/salary-benchmarks` · `/applications-over-time` · `/top-jobs-per-company` · `/conversion` · `/time-to-hire` |

There is deliberately **no authentication**. Endpoints that would be scoped to
the logged-in user take the acting user's id as a parameter instead
(`?company_id=`, `user_id` in the body). Where that matters — withdrawing your
own application, deleting your own bookmark — the ownership check belongs in the
`WHERE` clause, and the requirement comments say so.

> **SQLZoo note:** SQLZoo uses MySQL; this project uses PostgreSQL. They share
> most core SQL, but some syntax differs (e.g. `LIMIT`/`OFFSET`, string
> functions, `ILIKE`). When something you learned on SQLZoo doesn't work here,
> that difference is itself worth understanding — PostgreSQL is the source of
> truth for this project.
