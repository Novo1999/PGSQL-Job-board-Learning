# services/

This folder is reserved, but **empty on purpose**.

Right now each controller holds its SQL directly, which is exactly what we want
while learning — the SQL is visible at the call site.

A `service` becomes useful only when the *same* piece of database logic is needed
in more than one place (for example, "insert an application, but inside a
transaction that also checks the job is still open"). When that day comes, move
that reusable query logic here — e.g. `applicationsService.js` — and have the
controller call it.

Do not create service files pre-emptively. Add one when duplication or a
multi-step transaction actually appears.
