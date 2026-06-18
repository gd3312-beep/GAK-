# Architecture Notes

Notes on how the system is structured and why certain decisions were made.
Updated as things change.

---

## Stack

| Layer | Technology | Why |
|---|---|---|
| Backend API | Express (Node.js) | Fast to iterate, familiar ecosystem, good SQL library support |
| Database | MySQL 8.4 | Relational fits the schema well — attendance records, timetables, and session tokens all have FK relationships |
| Auth | JWT + HttpOnly cookies | Access token in memory (short-lived), refresh token in HttpOnly cookie. Refresh token rotation with family invalidation on replay — found this in the OWASP session management cheat sheet |
| Frontend | React + Vite + Tailwind | Vite's dev server is fast; shadcn/ui for the component library |
| Scraper | Playwright (headless) | The SRM Academia portal is a Zoho SPA with dynamic redirects — anything simpler than a real browser failed |

---

## Backend Structure

```
gak-backend/src/
  app.js              — Express app, middleware chain, route mounting
  server.js           — process entry point, starts scheduler if ENABLE_JOBS=true
  config/             — DB pool, Google OAuth client
  controllers/        — HTTP request/response + input validation
  services/           — business logic, external API calls
  models/             — SQL queries (raw mysql2 — no ORM)
  middleware/         — auth, audit logging, rate limiting
  utils/              — JWT, encryption, ID generation, scraper parsing
  jobs/               — background task implementations (cron-based)
```

Models use raw SQL with mysql2's prepared statement syntax (`?` placeholders).
No ORM — it was easier to write the SQL directly than to debug what an ORM
was generating, especially for the more complex attendance queries.

---

## Auth Flow

```
POST /api/users/login
  → validate credentials, create session record
  → set refresh token in HttpOnly cookie (7-day expiry)
  → return short-lived JWT in response body

POST /api/users/refresh
  → read cookie, look up session, verify token hash
  → issue new JWT + new refresh token, delete old session row
  → if old token is replayed after rotation: delete all sessions for that family
```

The session table stores a SHA-256 hash of the refresh token, not the token
itself. The token is only ever readable in the response header/cookie.

---

## Background Jobs

`server.js` conditionally starts `bootstrapScheduler()` when `ENABLE_JOBS=true`.
The scheduler uses `node-cron` to trigger jobs from `job.service.js`:

- Token refresh (Google OAuth access tokens expire every hour)
- Gmail sync (parses academic emails for calendar events)
- Calendar sync
- Google Fit sync
- Academia marks + attendance sync
- Analytics recompute

All jobs are run sequentially per user. No queue, no workers — just cron +
async/await. Failed jobs are logged and don't crash the process.

---

## Frontend Structure

```
Frontend/src/
  pages/          — route-level components (Gyaan, Ahara, Karma, etc.)
  components/     — shared UI widgets
  components/ui/  — shadcn component library (generated, mostly untouched)
  lib/            — API client (lib/api.ts), date utils, PDF export
  hooks/          — useSwipeNavigation, useMobile
```

The API client (`lib/api.ts`) handles auth state — attaches the JWT from
memory, refreshes on 401, and redirects to `/auth` on persistent failure.

---

## Database Schema

Schema files live in `gak-backend/sql/` numbered in apply order:

| File | Tables |
|---|---|
| `01_schema.sql` | core tables: app_user, session, subject, attendance_record, marks_record, workout_session, meal_log, integration |
| `02_constraints.sql` | FK constraints, indexes |
| `05_advanced_features.sql` | workout_plan, recommendation, behavior tables |
| `07_academia_integration.sql` | academia_credential, academia_sync_log |
| `08_fit_daily_metric.sql` | Google Fit aggregates |
| `09_workout_plan_details.sql` | workout_plan_exercise junction |
| `10_academic_sources.sql` | academic_event, academic_deadline |
| `11_schema_normalization.sql` | normalization of earlier tables |
| `12_academia_sync_metadata.sql` | sync state tracking |
| `12_profile_photo.sql` | profile_image_url on app_user |
| `13_reliability_observability.sql` | oauth_state_nonce for CSRF |
| `14_session_security.sql` | session family tracking |
| `views.sql` | attendance_summary, subject_performance |

Run in order via `npm run db:bootstrap`.
