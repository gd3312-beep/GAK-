# Architecture And Operations

## System Overview
- Frontend (`Frontend`) is a SPA that talks to backend REST APIs.
- Backend (`gak-backend`) handles auth, analytics, integrations, and data persistence.
- MySQL stores user, academic, fitness, nutrition, integration, and analytics data.

## Backend Structure
- `src/routes`: route-to-controller mapping.
- `src/controllers`: HTTP request/response handling and input validation.
- `src/services`: business logic and orchestration.
- `src/models`: SQL queries and persistence primitives.
- `src/utils`: shared helpers (security, JWT, scraper parsing, encryption).

## Frontend Structure
- `src/pages`: page-level route components.
- `src/components`: reusable UI and domain widgets.
- `src/lib`: API client, shared utilities, and date/pdf helpers.
- `src/hooks`: custom React hooks.

## Scraper Flow (Academia)
1. Credentials/session state are read from integration records.
2. Scraper runs in configured mode (Playwright/HTTP-based paths).
3. Raw attendance/marks/timetable data is parsed and normalized.
4. Processed rows are upserted into academic tables.
5. Sync status/error metadata is written for user-facing status and retries.

## Data Storage Model
- Core user identity: `app_user`.
- Academic domain: timetable, attendance, marks, deadlines.
- Fitness and nutrition domain: workouts, food logs, body/activity metrics.
- Integrations: Google accounts/tokens, email events, calendar links, Academia sync state.

## Analytics Concepts Used
- Deadline intelligence and prioritization scoring.
- Cycle- and stress-aware recommendation weighting.
- Time-window/session planning under constrained study capacity.
- Risk indicators for attendance/performance trend summaries.

## Deployment Notes
- Do not store real secrets in tracked files. Use environment variables at deploy time.
- Backend enforces production security checks (`ENFORCE_HTTPS`, strict origins, strong secrets).
- Set `VITE_API_URL` in frontend build for production.
- Use `gak-backend/.env.production.example` as a baseline.
- Optional containerized deployment is provided via `docker-compose.yml`.

## Operational Safety
- Use smoke checks before destructive DB actions:
  - backend tests
  - frontend build/test/lint
  - `npm run smoke:api`
- Use explicit destructive guard for truncation:
  - `DB_ALLOW_DESTRUCTIVE=true npm run db:truncate`
