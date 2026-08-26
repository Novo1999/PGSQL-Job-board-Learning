# Claude Code Prompt — SQL + PostgreSQL Job Board Backend

> **This is the prompt that created this repository**, kept for the record. It
> is not instructions for working on the project — for that, see
> [AGENTS.md](../AGENTS.md) and [CONTEXT.md](../CONTEXT.md).
>
> It is here because it explains *why* the project is shaped the way it is: no
> ORM, SQL at the call site, a schema built to make queries interesting rather
> than to ship a product. It is also a reasonable starting point if you want to
> generate your own learning project for a different stack.

## Role

Act as a senior backend engineer helping me build a real project specifically to learn SQL and PostgreSQL deeply.

I am a frontend developer and already know how to code. My weak area is SQL/database knowledge.

Your job is to SET UP the project and development foundation, not to teach me everything up front and not to over-engineer the application.

The project is a real Job Board backend using:

- Node.js
- Express
- PostgreSQL
- `pg` (node-postgres)
- dotenv

Do NOT use an ORM.

Do NOT use Prisma, Drizzle, Sequelize, TypeORM, Mongoose, Knex, or any query builder.

I want to write and understand the SQL myself.

---

# 1. Core Learning Goal

The database and SQL should be the most important part of this project.

I am using SQLZoo to practice SQL separately. SQLZoo uses MySQL, while this project uses PostgreSQL.

The project should therefore give me a realistic environment where I can practice:

- SELECT
- INSERT
- UPDATE
- DELETE
- WHERE
- ORDER BY
- LIMIT / OFFSET
- DISTINCT
- JOINs
- LEFT JOIN
- INNER JOIN
- GROUP BY
- HAVING
- aggregate functions
- subqueries
- CTEs
- window functions
- constraints
- foreign keys
- indexes
- transactions
- PostgreSQL-specific features

Whenever PostgreSQL syntax differs from common/MySQL SQL, keep PostgreSQL as the source of truth.

---

# 2. Project Scope

Build the initial backend foundation for a Job Board application.

The initial domain should contain:

### users

- id
- name
- email
- role
- created_at

Roles should initially support:

- candidate
- employer

### companies

- id
- name
- description
- created_at

### jobs

- id
- company_id
- title
- description
- salary_min
- salary_max
- location
- created_at

### applications

- id
- job_id
- user_id
- status
- applied_at

Application status should initially support:

- pending
- accepted
- rejected

The relationships should be:

users 1 ---- N applications

companies 1 ---- N jobs

jobs 1 ---- N applications

users and jobs therefore have a many-to-many relationship through applications.

---

# 3. Important Architectural Rule

Keep the project simple.

I am learning backend/database fundamentals, so don't create a huge enterprise architecture.

Use a structure roughly like:

job-board/
├── src/
│   ├── server.js
│   ├── db.js
│   ├── routes/
│   ├── controllers/
│   └── services/
├── sql/
│   ├── schema.sql
│   └── seed.sql
├── .env.example
├── .gitignore
├── package.json
└── README.md

You may adjust the structure slightly if there is a strong reason, but keep it simple and explain the reason.

Do not create unnecessary layers such as repositories, DTOs, domain entities, dependency injection containers, etc. unless they become genuinely useful later.

---

# 4. PostgreSQL Setup

The project should expect a local PostgreSQL database.

Database name:

`job_board`

Use an environment variable:

`DATABASE_URL`

Example:

`postgresql://postgres:password@localhost:5432/job_board`

Do NOT commit `.env`.

Create `.env.example`.

The application should load environment variables using dotenv.

---

# 5. Database Schema

Create `sql/schema.sql`.

The schema should use proper PostgreSQL constraints.

Use:

- PRIMARY KEY
- FOREIGN KEY
- NOT NULL
- UNIQUE
- CHECK
- DEFAULT

Use PostgreSQL-appropriate types.

Prefer modern PostgreSQL conventions where appropriate.

For example, do not blindly copy MySQL syntax from tutorials.

The schema should enforce important business rules at the database level.

For applications, prevent the same user from applying to the same job more than once.

Use a database constraint for that rather than relying only on application code.

Use sensible foreign-key behavior such as `ON DELETE` rules, but don't blindly use CASCADE everywhere. Choose deliberately.

---

# 6. Seed Data

Create `sql/seed.sql`.

Provide enough realistic data to make SQL queries interesting.

At minimum include:

- several users
- several employers
- several candidates
- several companies
- several jobs across companies
- multiple applications
- different application statuses
- different salaries
- different locations
- different creation dates

The seed data should make it possible to practice:

- JOINs
- aggregation
- GROUP BY
- HAVING
- filtering
- sorting
- subqueries
- later window-function queries

Do not generate thousands of rows. A small but meaningful dataset is enough initially.

---

# 7. Node/PostgreSQL Connection

Use the `pg` package.

Create `src/db.js`.

Use a PostgreSQL connection pool.

Do not create a new PostgreSQL connection for every request.

Keep the database connection code simple and understandable.

---

# 8. Express Setup

Create a minimal Express server.

It should:

- load environment variables
- create the Express application
- use JSON middleware
- connect to PostgreSQL
- expose a simple health endpoint
- listen on a configurable port

Example health endpoint:

`GET /health`

It should verify that the server is running.

Preferably have it also verify the PostgreSQL connection with a simple query such as:

`SELECT 1`

Do not build authentication yet.

Do not build a frontend yet.

Do not add unnecessary middleware.

---

# 9. Initial Routes

Set up the route structure, but do NOT implement a huge amount of business logic yet.

Create:

`/api/jobs`

`/api/users`

`/api/companies`

`/api/applications`

For the initial setup, it is okay if only a basic GET endpoint is implemented to verify the database connection.

The important thing is that the structure is ready for incremental development.

---

# 10. SQL Must Be Explicit

Whenever the backend needs database access, SQL should be visible.

Example:

```js
const result = await pool.query(
  `
    SELECT *
    FROM jobs
    ORDER BY created_at DESC
  `
);
```

Do not hide SQL behind abstractions.

Parameterized queries should be used whenever user input is involved.

Example:

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

Never concatenate user input directly into SQL.

---

# 11. package.json Scripts

Set up useful scripts such as:

- `dev`
- `start`

Use nodemon for development.

Example idea:

`npm run dev`

should start the Express server in development mode.

---

# 12. README

Create a useful README explaining:

1. What the project is
2. Why it exists
3. Tech stack
4. Prerequisites
5. How to create the PostgreSQL database
6. How to configure `.env`
7. How to run `schema.sql`
8. How to run `seed.sql`
9. How to start the server
10. Project structure
11. How SQL is intentionally kept explicit
12. The planned learning progression

Include PostgreSQL `psql` commands where useful.

For example:

```bash
createdb job_board
psql -d job_board -f sql/schema.sql
psql -d job_board -f sql/seed.sql
```

If commands differ across operating systems, mention that briefly.

---

# 13. No ORM / No Abstraction

This is extremely important.

DO NOT install or introduce:

- Prisma
- Drizzle
- Sequelize
- TypeORM
- Knex
- Objection
- any ORM
- any SQL query builder

Do not create a generic database repository abstraction.

I want to see the SQL.

---

# 14. Don't Overbuild

At this stage, do NOT add:

- authentication
- JWT
- password hashing
- Redis
- Docker
- Kafka
- WebSockets
- file uploads
- cloud storage
- deployment configuration
- testing frameworks
- complex validation systems
- frontend
- admin dashboards
- pagination abstractions
- caching
- microservices

Those can come later if they become relevant.

The current goal is a clean foundation for learning SQL/PostgreSQL through a real application.

---

# 15. Development Philosophy

Do not solve future problems before they exist.

Prefer boring, explicit, understandable code.

I am deliberately learning the database layer, so readability is more important than cleverness.

If there are multiple valid PostgreSQL approaches, choose the simplest one initially.

Avoid unnecessary abstractions.

---

# 16. Important: Don't Generate the Whole Application

You are setting up the project foundation.

Do NOT implement dozens of endpoints or write all the SQL queries for the entire application.

I want to build the features incrementally myself.

Set up:

- project
- dependencies
- PostgreSQL connection
- schema
- seed data
- basic Express server
- basic routes
- health check
- README
- scripts

Then STOP.

At the end, tell me:

1. What you created
2. What commands I need to run
3. How to verify PostgreSQL is connected
4. What the database relationships are
5. What the next feature I should build is

---

# 17. Teaching Constraint

When I later ask you to help implement a feature, do not immediately dump the final SQL on me.

Instead:

1. Explain what data the feature needs.
2. Help me reason about the tables involved.
3. Ask me what SQL I think we need when appropriate.
4. Let me attempt the query.
5. Review my SQL.
6. Explain mistakes.
7. Show the PostgreSQL solution only when useful.

I want to learn SQL by solving problems, not by copying queries.

If I explicitly ask for the answer, then give me the answer and explain it.

---

# 18. SQLZoo Compatibility

I will also be practicing SQLZoo.

SQLZoo uses MySQL.

If I bring a SQLZoo query into this project and it uses MySQL-specific syntax, point that out and show the PostgreSQL equivalent.

Do not pretend MySQL and PostgreSQL are identical.

Common SQL concepts should still be taught in database-agnostic terms where possible.

---

# 19. First Task

Start by inspecting the current directory.

Then initialize the project according to the requirements above.

Before creating files, briefly summarize the implementation plan.

Then create the project.

After creating it, verify:

- dependencies install correctly
- Node starts
- PostgreSQL configuration is valid
- schema syntax is valid if PostgreSQL is available
- seed data can be loaded if PostgreSQL is available
- the server can start
- `/health` works

Do not make unrelated changes to my machine or existing projects.

If PostgreSQL is not installed/running or the database cannot be reached, do not fake verification. Tell me exactly what could not be verified and why.

The final project should be ready for me to start learning SQL through building the Job Board.
