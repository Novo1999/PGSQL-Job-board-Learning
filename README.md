# Job Board — a SQL / PostgreSQL learning backend

A working Node.js + Express + PostgreSQL job board API where **every query has
been removed**. 69 empty query sites, each with a plain-English description of
what it has to do, arranged so the difficulty climbs from `SELECT ... WHERE` to
window functions, CTEs and row-level locking.

You write the SQL. Everything else — routes, types, error mapping, seed data,
API docs — is already there.

```ts
// src/controllers/skillsController.ts
const result = await pool.query<SkillDemandRow>(``, [
//                                             ^^ this is the exercise
  queryString(req.query.used_only) === 'true',   // $1
  queryInt(req.query.limit) ?? 50,               // $2
]);
```

> **No ORM. No query builder.** No Prisma / Drizzle / Sequelize / TypeORM /
> Knex. All SQL is hand-written, and it lives at the call site where you can
> read it.

---

## Contents

- [Why it exists](#why-it-exists)
- [Quick start](#quick-start)
- [How the exercises work](#how-the-exercises-work)
- [AI assistants are put in tutor mode](#ai-assistants-are-put-in-tutor-mode)
- [The database model](#the-database-model)
- [How the seed data is shaped](#how-the-seed-data-is-shaped)
- [API surface](#api-surface)
- [Generating the API docs](#generating-the-api-docs)
- [Project structure](#project-structure)
- [Commands](#commands)

---

## Why it exists

I'm a frontend developer who already knows how to code — databases are my weak
area. This is a deliberate practice ground where the **database and the SQL are
the point**, not the API surface.

The API is scaffolding: real enough that the queries have to be real, small
enough that nothing distracts from them. There is no authentication, no
front-end, no deployment story. There is a schema with ten tables, seed data
engineered to punish sloppy joins, and 69 blanks.

Anyone learning PostgreSQL is welcome to clone it and work through the same
ladder.

---

## Quick start

**Prerequisites:** Node.js 18+ (developed on 22) and PostgreSQL 14+ running
locally.

```bash
git clone https://github.com/Novo1999/PGSQL-Job-board-Learning.git
cd PGSQL-Job-board-Learning
npm install

# 1. Create the database
createdb job_board
#    ...or, if createdb is not on your PATH:
#    psql -U postgres -c "CREATE DATABASE job_board;"

# 2. Point the app at it
cp .env.example .env            # macOS / Linux
# Copy-Item .env.example .env   # Windows PowerShell
#    then edit DATABASE_URL in .env

# 3. Load the schema and the sample data
npm run db:reset

# 4. Run it
npm run dev
```

```bash
curl http://localhost:3000/health
# -> {"status":"ok","db":"connected"}
```

`npm run db:reset` runs `sql/schema.sql` then `sql/seed.sql` through
node-postgres, so it works without `psql` on your PATH. Both scripts are safe to
re-run — the schema drops its tables first, the seed truncates first. If you
prefer `psql`, it is exactly equivalent to:

```bash
psql -d job_board -f sql/schema.sql
psql -d job_board -f sql/seed.sql
```

**Windows note:** installing from
[postgresql.org](https://www.postgresql.org/download/windows/) gives you `psql`,
but you may need to add its `bin` folder (e.g.
`C:\Program Files\PostgreSQL\16\bin`) to your PATH. `npm run db:reset` sidesteps
this entirely.

---

## How the exercises work

Every controller in `src/controllers/` is complete except its SQL. Above each
handler is a description of the feature in plain English — what it does, who
uses it, which rules it has to honour. No SQL, no hints.

Everything else you need is in the code itself:

- **`$1`, `$2`, … are exactly the array below the query, in order.**
- **The columns your `SELECT` must return** are the fields of the type in the
  `pool.query<…>()` generic. The types under *Projection rows* in
  `src/types/database.ts` exist purely to describe query output.
- **Optional filters arrive as `null`, never `undefined`** — the helpers in
  `src/utils/http.ts` guarantee it, so one query can express an optional filter
  with `($1::text IS NULL OR col = $1)` instead of building SQL strings in
  JavaScript.
- **List endpoints return a `total_count` column**, which `paginated()` reads off
  the first row — so the query itself carries the pre-pagination total.
- **Constraint violations become HTTP statuses** (`23505` → 409, `23503` → 400,
  `23514`/`23502` → 400), so you let the database reject bad data rather than
  pre-checking in JS.
- **`BIGINT`, `count()`, `sum()`, `avg()` and `percentile_cont()` come back as
  strings** from node-postgres — hence `DbId`, `DbCount`, `DbNumeric`.

Nothing crashes while a query is still blank. An empty query string returns no
rows, so the endpoint answers with an empty list or its own 404 / 409 guard. Fill
them in one at a time and test as you go.

**[CONTEXT.md](CONTEXT.md) is the working document**: the full schema, the
business rules that shape most queries, how the seed data is shaped and why, and
a stage-by-stage work order through all 69 query sites, ordered so each stage
only uses concepts from the ones before it.

| Stage | Theme | Sites |
| --- | --- | --- |
| 1 | Single-table reads and writes | 7 |
| 2 | Junction tables, idempotent writes | 3 |
| 3 | Grouping, and the `LEFT JOIN` zero | 4 |
| 4 | Aggregates per group, first window function | 9 |
| 5 | Big filtered reads, first transactions | 20 |
| 6 | The hard users endpoints | 7 |
| 7 | Transactions, row locking, concurrency | 13 |
| 8 | Reporting: CTEs, time series, percentiles | 6 |

[docs/API.md](docs/API.md) marks each endpoint ✅ or ⬜ depending on whether its
query has been written yet.

### Branches

| Branch | What it holds |
| --- | --- |
| `master` | The blank exercise set. All 69 query sites empty. Start here. |
| `learn` | My own working branch, where the answers accumulate as I write them. |

Clone and work on `master` — or branch off it — and leave `learn` alone unless
you want to compare notes after you have written a query yourself.

---

## AI assistants are put in tutor mode

This repo is meaningless if an assistant just fills the blanks in. So it ships
with instructions that put them in **tutor mode**, and — in Claude Code — a hook
that enforces it:

| File | Read by |
| --- | --- |
| [AGENTS.md](AGENTS.md) | The canonical contract. Codex, Cursor, Aider, Jules, Zed, and anything else that reads `AGENTS.md`. |
| [CLAUDE.md](CLAUDE.md) | Claude Code (imports `AGENTS.md`). |
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | GitHub Copilot / VS Code. |
| [.cursor/rules/sql-tutor.mdc](.cursor/rules/sql-tutor.mdc) | Cursor (`alwaysApply`). |
| [.claude/settings.json](.claude/settings.json) | A `PreToolUse` hook that makes edits to `src/controllers/**` require explicit approval and refuses edits to generated files. |

What they enforce, in short:

- Never write SQL into an empty query site unless explicitly asked for the
  finished answer. "Help me with X" is a request for a hint, not for X.
- Climb a hint ladder, one rung per exchange: what data does this need → what
  does one row of the answer look like → what is wrong with your attempt → the
  name of the concept → a skeleton with blanks → the full query, explained.
- Diagnose by effect before naming the fix: *"this multiplies your counts
  together"* comes before *"use `COUNT(DISTINCT ...)`"*.
- Concept questions get complete answers, using a toy example rather than the
  exercise in front of you.
- PostgreSQL is the source of truth — flag anything that only works in MySQL.

Using a different assistant? Point it at `AGENTS.md`. If you would rather have
the answers, delete the files above — but then you are reading a job board API,
not doing the exercises.

---

## The database model

Ten tables. `BIGINT GENERATED ALWAYS AS IDENTITY` rather than `SERIAL`,
`TIMESTAMPTZ` rather than `TIMESTAMP`, `TEXT` rather than `VARCHAR(n)`.

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

Two rules carry most of the weight, and nearly every query sits on one side of
one of them:

**A posting is *live* only when** `status = 'open' AND (expires_at IS NULL OR
expires_at > now())`. Candidate-facing queries must apply it; employer-facing
queries must not, because an employer still needs their drafts, closed and
expired postings.

**`applications.status` and `application_events` must never disagree.** Every
status change writes both, inside one transaction.

The full schema, index list (including what is deliberately *not* indexed, and
why) and the application status pipeline are in [CONTEXT.md](CONTEXT.md).

---

## How the seed data is shaped

Small — 8 users, 11 jobs, 15 applications — but every row is there to make some
query interesting:

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
| **174 `job_views` over 28 days**, ~⅓ anonymous | `date_trunc`, gap filling, `COUNT(*)` vs `COUNT(user_id)` |
| Applications across all 7 pipeline stages | funnels, conversion rates, `LAG()` over the event trail |

Time-sensitive rows use `now() ± interval`, so they stay meaningful whenever you
load them.

---

## API surface

61 requests over 59 handlers. Full reference with every parameter and
description: **[docs/API.md](docs/API.md)**.

| Resource | Endpoints |
| --- | --- |
| Jobs | `GET /api/jobs` · `/trending` · `/expiring` · `/manage` · `GET\|PATCH\|DELETE /:id` · `/:id/similar` · `/:id/skills` (GET, PUT) · `/:id/applications` · `/:id/views` · `POST /:id/view` · `POST /:id/publish` · `POST /:id/close` |
| Users | `GET\|POST /api/users` · `/candidates/search` · `GET\|PATCH\|DELETE /:id` · `POST /:id/deactivate` · `/:id/skills` (GET, PUT) · `/:id/applications` · `/:id/dashboard` · `/:id/recommended-jobs` |
| Saved jobs | `GET\|POST /api/users/:userId/saved-jobs` · `DELETE /api/users/:userId/saved-jobs/:jobId` |
| Companies | `GET\|POST /api/companies` · `/top` · `GET\|PATCH\|DELETE /:id` · `/:id/jobs` · `/:id/funnel` · `/:id/salary-bands` |
| Applications | `GET\|POST /api/applications` · `/funnel` · `POST /bulk-reject` · `GET\|DELETE /:id` · `/:id/timeline` · `PATCH /:id/status` · `POST /:id/withdraw` |
| Skills | `GET\|POST /api/skills` · `/demand` · `DELETE /:id` |
| Analytics | `/api/analytics/overview` · `/salary-benchmarks` · `/applications-over-time` · `/top-jobs-per-company` · `/conversion` · `/time-to-hire` |

There is deliberately **no authentication**. Endpoints that would be scoped to a
logged-in user take the acting user's id as a parameter instead (`?company_id=`,
`user_id` in the body). Where ownership matters — withdrawing your own
application, deleting your own bookmark — the check belongs in the `WHERE`
clause, and the requirement comments say so.

---

## Generating the API docs

```bash
npm run postman         # rebuild postman/ and docs/API.md
npm run postman:check   # fail if they are out of date (CI runs this)
```

Both outputs are **generated from the source**, so they cannot drift from the
code:

| Source | What it contributes |
| --- | --- |
| `src/server.ts` | which router is mounted where → URL prefixes |
| `src/routes/*.ts` | method + path + handler → the request list |
| `src/controllers/*.ts` | the comment above each handler → the description |
| " | every `req.query.x` it reads → the query parameters |
| " | a `?? 20` next to one → that parameter's default value |
| " | empty query sites → the ⬜ / ✅ progress markers |
| `scripts/api-examples.ts` | the rest: example request bodies, friendlier names |

Import `postman/job-board.postman_collection.json` into Postman and set the
`baseUrl` variable. Query parameters arrive **disabled when they are optional
filters** and **enabled when the controller applies a default**, so the URL
itself documents the defaults.

Add an endpoint and the request appears. Reword the comment above a handler and
the documentation follows. Write a query and its ⬜ turns ✅.

---

## Project structure

```
.
├── AGENTS.md                  # the tutor contract every AI assistant must follow
├── CLAUDE.md                  # Claude Code entry point (imports AGENTS.md)
├── CONTEXT.md                 # schema, business rules, seed shapes, work order
├── src/
│   ├── server.ts              # Express app + /health
│   ├── db.ts                  # the single pg Pool (DATABASE_URL)
│   ├── routes/                # URL -> controller wiring, one file per resource
│   ├── controllers/           # request handlers — the SQL goes here
│   ├── types/database.ts      # row types + projection rows (query output shapes)
│   ├── utils/http.ts          # query-param parsing + PG error -> HTTP status
│   └── services/              # reserved, empty on purpose (see its README)
├── sql/
│   ├── schema.sql             # tables, constraints, indexes (drops first)
│   └── seed.sql               # sample data (truncates first)
├── scripts/
│   ├── generate-postman.ts    # builds the collection + docs/API.md from source
│   ├── api-examples.ts        # the hand-written half: bodies, names, examples
│   ├── db.ts                  # npm run db:schema / db:seed / db:reset
│   └── guard-exercise-files.mjs  # the Claude Code hook
├── postman/                   # generated collection — do not hand-edit
├── docs/
│   ├── API.md                 # generated API reference
│   └── origin-prompt.md       # the prompt this project was generated from
└── .github/workflows/ci.yml   # typecheck, build, load the SQL, check the docs
```

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with auto-reload on `http://localhost:3000` |
| `npm start` | Run the built output from `dist/` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Typecheck `src/` and `scripts/` without emitting |
| `npm run db:schema` | Load `sql/schema.sql` (drops and recreates the tables) |
| `npm run db:seed` | Load `sql/seed.sql` (truncates first) |
| `npm run db:reset` | Both, in order |
| `npm run postman` | Regenerate `postman/` and `docs/API.md` |
| `npm run postman:check` | Fail if the generated docs are out of date |

---

## Notes

**SQLZoo:** SQLZoo is MySQL, this project is PostgreSQL. They share most core
SQL, but `ILIKE`, `FILTER`, `RETURNING`, `DISTINCT ON`, `generate_series` and
`::` casts are Postgres-only, and `LIMIT`/`OFFSET` behaves differently from
`TOP`. Where something you learned there does not work here, that difference is
itself worth understanding — PostgreSQL is the source of truth for this project.

**Stack:** Node 22 · Express 5 · [`pg`](https://node-postgres.com/) 8 ·
TypeScript with native ES modules · `tsx` for development · `morgan` for request
logging · PostgreSQL 18.6 in development, 16 in CI.

## License

[MIT](LICENSE).
