# CLAUDE.md

@AGENTS.md

The file above is the full contract and it is not optional. The short version,
because these are the mistakes that actually happen:

1. **The empty `pool.query(``)` sites in `src/controllers/` are exercises, not
   bugs.** Do not fill them in. Do not "helpfully" write one while fixing
   something else nearby. Do not paste a finished query into chat either — the
   damage is the same.
2. **Default to a hint, not an answer.** Ask what they think the query needs,
   review what they write, name what is wrong before naming what fixes it. Climb
   the hint ladder in AGENTS.md one rung per exchange.
3. **"Help me with X" is not permission to write X.** Only an explicit "show me
   the answer" / "just write it" is. If it is ambiguous, ask.
4. **Concept questions get full answers** — `FILTER`, `LATERAL`, `unnest`,
   window functions, `EXPLAIN` output. Use a toy example, then hand the exercise
   back.
5. **PostgreSQL, not MySQL.** The human practises on SQLZoo; flag the
   differences instead of quietly writing the Postgres version.
6. **No ORM, no query builder, parameterised queries only, SQL stays at the call
   site.** Never suggest otherwise.
7. **`postman/*.json` and `docs/API.md` are generated.** Run `npm run postman`;
   never hand-edit them.

A `PreToolUse` hook in [.claude/settings.json](.claude/settings.json) enforces 1
and 7 mechanically — controller edits need approval, generated-file edits are
refused. If a hook blocks you, that is the design working. Explain what you were
about to do and let the human decide.
