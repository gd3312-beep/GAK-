# Engineering Notes

Running log of decisions, findings, and things that were harder than expected.

---

## Auth: why HttpOnly cookies instead of localStorage

Most Express + JWT tutorials put the token in localStorage and attach it
as a Bearer header. That works until you think about XSS — any injected
script can read localStorage and exfiltrate the token.

HttpOnly cookies are invisible to JavaScript. Combined with `SameSite=Lax`
they also resist most CSRF attacks, though a separate CSRF token is still
used for state-mutating endpoints.

The refresh token rotation pattern came from the OWASP Session Management
Cheat Sheet: if a refresh token is presented after it has already been
rotated, the entire session family is invalidated. This means a stolen
refresh token is only usable until the legitimate user makes any request.

---

## The Academia scraper

SRM's academia portal is a Zoho-hosted SPA. First attempt used `axios` +
`cheerio` — failed immediately because the page is rendered client-side
and the login flow redirects through Zoho's auth before loading the SPA.

Second attempt: Playwright. Works but takes 10–15 seconds per user sync
because the browser has to actually navigate and wait for the SPA to settle.
`ACADEMIA_SPA_SETTLE_MS` controls how long to wait; the default (15s) is
conservative.

Edge cases that took time to handle:
- "Session limit exceeded" — Zoho limits concurrent sessions. The
  `ACADEMIA_TERMINATE_SESSIONS_ON_LIMIT` env var controls whether to
  auto-terminate existing sessions or surface an error.
- CAPTCHA — doesn't appear on repeated logins with a stored session state.
  `scripts/academia-capture-state.js` captures an authenticated browser
  state that can be restored on subsequent scrapes.

---

## Database: why no ORM

Sequelize and TypeORM both work fine for simple CRUD. The attendance queries
here are more complex — joining attendance_record to subject, filtering by
date ranges, computing percentages via a view, and the `views.sql` file has
window functions. Debugging what an ORM generates for that is slower than
writing the SQL directly.

`mysql2` with prepared statement placeholders (`?`) handles injection
prevention. Models are just files with async functions that call `pool.query`.

---

## Load testing findings

Used `scripts/smoke-api.js` for functional checks and wrote a simple
concurrent load script against the authenticated endpoints.

**Environment:** local Docker on macOS (4 cores, 16 GB RAM)

| Endpoint | Concurrent | p50 | p95 | Notes |
|---|---:|---:|---:|---|
| `GET /health` | 1000 | ~80 ms | ~2.7 s | No DB, no auth — just a status string |
| `GET /api/users/me` | 25 | ~180 ms | ~1.4 s | DB lookup + session validation |
| `GET /api/users/me` | 100 | ~1.1 s | ~11.2 s | Pool exhausted, queuing visible |

At 100 concurrent authenticated requests the MySQL connection pool
exhausts and requests start queuing. Each auth request does two DB
round-trips: one for the session lookup, one for the audit log insert.

The obvious fix — caching active sessions in Redis to skip the DB
lookup on the hot auth path — is not yet implemented. The pool size
(`DB_POOL_SIZE`) is configurable if needed in the meantime.

---

## Things to improve

- Session caching in Redis (avoid the auth DB round-trip)
- Playwright browser pool (currently spawns a new browser per sync request;
  reusing a pool would reduce per-sync overhead from ~15s to ~5s)
- Integration test suite (currently only unit tests for auth and jobs)
