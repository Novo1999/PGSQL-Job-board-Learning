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

This creates the `users`, `companies`, `jobs`, and `applications` tables with all
their constraints and indexes. The script drops the tables first, so it's safe
to re-run while you experiment.

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
│   │   └── applications.ts
│   ├── controllers/           # request handlers — SQL lives here, visible
│   │   ├── jobsController.ts
│   │   ├── usersController.ts
│   │   ├── companiesController.ts
│   │   └── applicationsController.ts
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
users ──1─────N── applications ──N─────1── jobs ──N─────1── companies

users     1 ── N  applications      (a user has many applications)
jobs      1 ── N  applications      (a job has many applications)
companies 1 ── N  jobs              (a company has many jobs)
```

`users` and `jobs` are therefore **many-to-many through `applications`**. A user
can apply to a job only once — enforced by `UNIQUE (job_id, user_id)` in the
database, not just in application code.

The seed data is shaped for interesting practice:
- **Junior Backend Engineer** has **no applications** → practice `LEFT JOIN`.
- **Junior Backend Engineer** has **NULL salaries** → practice `NULL` / `COALESCE`.
- **Data Analyst** has **three** applicants; **Senior Backend Engineer** has two.
- A full spread of statuses (`pending` / `accepted` / `rejected`), salaries,
  locations, and dates.

## 13. Learning progression (suggested)

Once the foundation runs, build features incrementally and let the SQL get
progressively harder:

1. **Basic reads** — `GET /api/jobs/:id`, filter jobs by `location` / salary
   range (`WHERE`, `ORDER BY`, `LIMIT` / `OFFSET`).
2. **Search** — title search with `ILIKE` and parameterized queries.
3. **Writes** — `POST` a job, `POST` an application (watch the `UNIQUE`
   constraint reject duplicates).
4. **JOINs** — list jobs *with* their company name; list a user's applications
   *with* job + company details.
5. **Aggregation** — applications-per-job, jobs-per-company, average salary per
   company (`GROUP BY`, `HAVING`, `COUNT`, `AVG`).
6. **Subqueries & CTEs** — "jobs with more applicants than average", multi-step
   queries with `WITH`.
7. **Window functions** — rank jobs by salary within each company
   (`RANK() OVER (PARTITION BY ...)`).
8. **Transactions** — multi-step writes that must succeed or fail together.

> **SQLZoo note:** SQLZoo uses MySQL; this project uses PostgreSQL. They share
> most core SQL, but some syntax differs (e.g. `LIMIT`/`OFFSET`, string
> functions, `ILIKE`). When something you learned on SQLZoo doesn't work here,
> that difference is itself worth understanding — PostgreSQL is the source of
> truth for this project.
