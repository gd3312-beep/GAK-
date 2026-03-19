# Deployment Checklist

## 1. Pre-Deploy Validation
- Backend tests:
  - `cd gak-backend && npm test`
- Frontend quality gate:
  - `cd Frontend && npm run build && npm run test && npm run lint`
- API smoke test (backend running at `http://127.0.0.1:4000`):
  - `cd gak-backend && npm run smoke:api`

## 2. Environment Setup
- Backend production env:
  - Copy `gak-backend/.env.production.example` to your deployment secret manager.
  - Set real values for DB, JWT, OAuth, CORS, and job token variables.
  - For managed MySQL with TLS (for example TiDB), set `DB_SSL_MODE=required`.
- Frontend production env:
  - Set `VITE_API_URL` to your backend public URL.

## 3. Database Preparation
- Create/verify `GAK` database on production MySQL.
- Apply schema:
  - `cd gak-backend && npm run db:bootstrap`
- Optional destructive reset (non-production only):
  - `DB_ALLOW_DESTRUCTIVE=true npm run db:truncate`

## 4. Deploy (Container Option)
- Build and start:
  - `docker compose up -d --build`
- Verify health:
  - `curl http://127.0.0.1:4000/health`

## 5. Deploy (Non-Container Option)
- Backend:
  - `cd gak-backend && npm ci && NODE_ENV=production npm start`
- Frontend:
  - `cd Frontend && npm ci && npm run build`
  - Serve `Frontend/dist` behind Nginx/Apache with SPA fallback to `index.html`.

## 6. Post-Deploy Checks
- Authenticate in UI and hit core journeys:
  - login/register
  - planner/timetable
  - marks and attendance views
  - integrations status pages
- Watch backend logs for:
  - CORS rejections
  - auth failures
  - scheduler errors

## 7. Security Guardrails
- Never commit real `.env` values.
- Keep `.env.local` / `.env.production.local` untracked.
- Rotate JWT/OAuth/token encryption secrets on any suspected exposure.
