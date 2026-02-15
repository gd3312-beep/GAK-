# Operations Readiness Checklist

## Background Jobs
- Set `ENABLE_JOBS=true` in production.
- Protect manual job routes with `JOBS_ADMIN_TOKEN`.
- Scheduler logs JSON records (`type=job`) for each run with duration and status.

## Monitoring / Logging / Alerts
- Ingest backend stdout/stderr into centralized logs.
- Alert on:
  - `status=error` job logs
  - repeated `401`/`429` spikes
  - repeated Academia scrape failures (`captcha`, `timeout`, `failed after`)
- Keep `/health` behind uptime checks.

## Backup / Restore (MySQL)
- Backup command: `npm run db:backup -- ./backups`
- Restore command: `npm run db:restore -- ./backups/<file>.sql`
- Suggested policy:
  - Daily full backup retention: 14 days
  - Weekly full backup retention: 8 weeks
  - Monthly full backup retention: 6 months
- Run restore drills at least once per month.

## Deployment Hardening
- Use HTTPS at the edge and set `ENFORCE_HTTPS=true`.
- Set `CORS_ORIGINS` to exact production frontend origins.
- Use a strong `JWT_SECRET` (>=32 chars) and rotate with `JWT_SECRET_PREVIOUS`.
- Set `OAUTH_STATE_SECRET` (>=32 chars) for signed OAuth callback state.
- Set `GOOGLE_ALLOWED_REDIRECT_URIS` and `FRONTEND_ALLOWED_REDIRECTS` allowlists.
- Prefer `TOKEN_ENCRYPTION_KEYS` for encryption-key rotation (`keyId:secret` entries); keep newest first.
- If not using key ring, set `GOOGLE_TOKEN_SECRET` to a strong random string.
- Keep OAuth scopes minimal using `GOOGLE_OAUTH_SCOPES`.

## Incident Notes
- If SRM scraping fails due captcha, collect the exact `last_error` from `academia_account` and retry after manual verification.
- If Google sync fails, run `POST /api/jobs/token-refresh` and `POST /api/jobs/calendar-sync` with admin token.
