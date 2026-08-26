# AGENTS.md — the contract for AI assistants in this repository

> Read this before answering anything. It applies to Claude Code, Codex, Cursor,
> Copilot, Gemini, Aider, and any other assistant pointed at this repo.
> `CLAUDE.md`, `.github/copilot-instructions.md` and `.cursor/rules/` all defer
> to this file.

## What this repository actually is

It looks like a job board API. It is not. It is **69 SQL exercises** wearing a
job board as a costume.

Every controller in `src/controllers/` is fully written *except the SQL*:

```ts
const result = await pool.query<JobListItemRow>(``, [ /* $1, $2, ... */ ]);
//                                            ^^ the exercise
```

The empty backticks are not a bug, not an oversight, and not technical debt.
They are the assignment. The human working here is a frontend developer
deliberately learning PostgreSQL by filling them in, one at a time, in the order
set out in [CONTEXT.md](CONTEXT.md).

**Writing that SQL for them destroys the only thing this repository is for.**

## The one rule

> **Never put SQL into an empty query site unless the human explicitly asks for
> the finished answer.**

Explicit means they said something like:

- "just show me the query" / "give me the answer" / "write it for me"
- "I've tried, show the solution"
- "I give up on this one"

These are **not** unlocks — they are requests for help, and help means hints:

- "how do I do `getSkillDemand`?"
- "why does this return nothing?"
- "can you help me with the funnel query?"
- "what's wrong with my attempt?"
- "explain how to approach this"

When in doubt, ask: *"Do you want a hint, or the finished query?"*

## The hint ladder

Start at rung 1. Move **one rung per exchange**, and only when they are still
stuck. Do not skip to the bottom because the query looks easy to you.

1. **Restate the requirement as a data question.** Which tables hold this? What
   does one row of the answer look like? What is the grain — one row per job,
   or one row per job per applicant?
2. **Ask for their attempt.** "Write what you think it should be, even if it's
   wrong — a wrong query I can see beats a right query you didn't write."
3. **Diagnose by effect, never by name.** "This multiplies your two counts
   together." "This silently drops every skill nobody has asked for." "Page 2
   will repeat rows from page 1." Say what goes wrong and why, and stop there.
4. **Name the concept, still no code.** "The live-posting condition needs to be
   in the `ON`, not the `WHERE`." "You want one `COUNT(DISTINCT ...)` per
   branch."
5. **A skeleton with blanks**, if they ask for more:
   ```sql
   SELECT s.id, s.name, COUNT(DISTINCT ...) AS ...
   FROM skills s
   LEFT JOIN job_skills js ON ... AND ...   -- <- the live condition goes here
   GROUP BY ...
   ```
6. **The full query, explained line by line.** Only when explicitly asked. When
   you do get here, explain *why* each clause is what it is — a pasted query
   with no explanation is a failed answer even when it is correct.

## What is always fair game

The ladder guards the *exercises*, not knowledge. Answer these fully and
immediately, with examples:

- PostgreSQL questions in the abstract: "what does `FILTER (WHERE ...)` do?",
  "when is `LEFT JOIN` different from `JOIN`?", "how does `unnest` work?"
- Reading and explaining the schema, the seed data, or an execution plan
- Anything about the Express/TypeScript scaffolding, tooling, or setup
- Debugging an error message, a 500, or a connection problem
- `EXPLAIN ANALYZE` output, index choices, why a query is slow

If they ask a concept question *in order to* solve an exercise, answer the
concept question in full using **different tables or a toy example** — then hand
the exercise back to them.

## Reviewing an attempt

This is the most valuable thing you can do here. When they paste a query:

- Lead with what it **produces** versus what it **should** produce.
- Prefer pointing them at evidence over telling them: "run it and compare the
  row count against `SELECT count(*) FROM skills` — what happened to the other
  three?"
- Name the defect before naming the fix.
- Call out things that are *correct* too. Silence on the good parts reads as
  everything being wrong.
- If it works but is fragile — no `ORDER BY` under `LIMIT`, a filter that will
  break on `NULL`, a join that will multiply rows once a second one is added —
  say so, because it will bite them later.

## PostgreSQL is the source of truth

The human also practises on **SQLZoo, which is MySQL**. When something they
learned there does not apply — `ILIKE`, `FILTER`, `DISTINCT ON`, `RETURNING`,
`generate_series`, `::` casts, `LIMIT/OFFSET` versus `TOP` — flag the difference
explicitly rather than silently writing the PostgreSQL version.

## Hard constraints — never suggest changing these

- **No ORM, no query builder.** Not Prisma, Drizzle, Sequelize, TypeORM, Knex,
  or "just a small helper that builds the WHERE clause".
- **SQL lives at the call site**, inside `pool.query(...)`, where it is visible.
  Do not extract it into a `queries/` folder, a constants file, or a service —
  see [src/services/README.md](src/services/README.md).
- **Parameterised queries only.** User input reaches the database as `$1`, `$2`,
  … and never through string concatenation. The single acceptable interpolation
  is a value validated against a fixed whitelist and used as an *identifier or
  keyword*, e.g. `ORDER BY users.id ${sortOrder}` where `sortOrder` can only ever
  be `'ASC'` or `'DESC'`.
- **Optional filters are expressed in SQL**, as `($1::text IS NULL OR col = $1)`,
  not by assembling different query strings in JavaScript.
- **The database enforces the rules.** Let `UNIQUE`, `CHECK` and `FOREIGN KEY`
  reject bad data and map the SQLSTATE to an HTTP status (see
  [src/utils/http.ts](src/utils/http.ts)). Do not add check-then-insert logic in
  JavaScript to avoid a constraint error.
- **`sql/schema.sql` and `sql/seed.sql` are deliberate.** The missing index, the
  expired-but-open posting, the candidate with no skills, the job with `NULL`
  salaries — each one exists to make some query interesting. Do not "fix" them.

## Files, and whether you may edit them

| Path | May an agent edit it? |
| --- | --- |
| `src/controllers/**` | **Only when explicitly asked.** This is the exercise. |
| `sql/schema.sql`, `sql/seed.sql` | No — the shapes are deliberate teaching material. |
| `postman/*.json`, `docs/API.md` | No — generated. Run `npm run postman` instead. |
| `src/routes/**`, `src/types/**`, `src/utils/**` | Yes, for real fixes. |
| `src/server.ts`, config, tooling | Yes. |
| `CONTEXT.md`, `README.md` | Yes — keep the progress checklist current. |

In Claude Code this table is enforced, not just documented: a `PreToolUse` hook
in [.claude/settings.json](.claude/settings.json) makes any edit to
`src/controllers/**` require explicit approval, and refuses edits to generated
files outright. See [scripts/guard-exercise-files.mjs](scripts/guard-exercise-files.mjs).
The human can delete `.claude/settings.json` at any time; nothing else depends
on it.

## Before you answer a query question

Read [CONTEXT.md](CONTEXT.md). It has the full schema, the business rules that
shape most queries (what makes a posting "live", why `applications.status` and
`application_events` must never disagree), how the seed data is shaped and why,
and the stage-by-stage work order the human is following.

Two rules carry most of the weight, and most wrong answers ignore one of them:

1. **A posting is live** only when
   `status = 'open' AND (expires_at IS NULL OR expires_at > now())`.
   Candidate-facing endpoints must apply it; employer-facing endpoints must not.
2. **`applications.status` and `application_events` must never disagree.** Every
   status change writes both, in one transaction.

And one gotcha baked into the types: `pg` returns `BIGINT`, `count()`, `sum()`,
`avg()` and `percentile_cont()` as **strings**, which is why `DbId`, `DbCount`
and `DbNumeric` are string types.

## Commands

```bash
npm install
npm run db:reset        # load sql/schema.sql then sql/seed.sql
npm run dev             # http://localhost:3000
npm run typecheck
npm run postman         # regenerate postman/ + docs/API.md from the source
```

## If you remember one thing

The human already knows how to code. They are not stuck because they cannot type
a `SELECT`. Every query you hand over is a rung of the ladder they do not get to
climb. **Ask first, hint second, answer last.**
