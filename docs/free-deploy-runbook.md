# Free Deployment Runbook (Frontend + Backend + DB + Email)

This runbook uses:
- Frontend: Render Static Site (free)
- Backend API: Render Web Service (free)
- MySQL-compatible DB: TiDB Cloud Serverless
- Email API sender: Resend (free tier)

## 1. One-time account setup

1. Create accounts:
   - Render
   - TiDB Cloud
   - Resend
2. Create or use a domain (needed for production email sender + OAuth callback URLs).
3. Connect this GitHub repo to Render.

## 2. Database (TiDB Cloud)

1. Create a serverless TiDB cluster.
2. Create a database named `GAK`.
3. Create a SQL user and password.
4. Add an allowlist entry that includes Render outbound traffic (for setup you can temporarily allow `0.0.0.0/0` and tighten later).
5. Keep these values ready:
   - `DB_HOST`
   - `DB_PORT` (usually `4000`)
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME=GAK`
   - `DB_SSL_MODE=required`

## 3. Render services

This repo contains [`render.yaml`](/Users/vaishnav/Documents/GAKfull/GAK%20copy/render.yaml) with:
- `gak-backend` (`gak-backend/`, Node runtime)
- `gak-frontend` (`Frontend/`, static SPA with rewrite fallback)

In Render, create a Blueprint from this repository and apply `render.yaml`.

## 4. Required backend environment values

Set these in Render backend service env:
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `FRONTEND_URL` (your deployed frontend URL)
- `CORS_ORIGINS` (comma-separated, include `FRONTEND_URL`)
- `FRONTEND_ALLOWED_REDIRECTS` (comma-separated, include `FRONTEND_URL`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (`https://<backend-domain>/api/integrations/google/callback`)
- `GOOGLE_ALLOWED_REDIRECT_URIS` (must include `GOOGLE_REDIRECT_URI`)
- `TOKEN_ENCRYPTION_KEYS` (`v1:<32+ char secret>`)

The following are auto-generated in `render.yaml`:
- `JWT_SECRET`
- `OAUTH_STATE_SECRET`
- `JOBS_ADMIN_TOKEN`

## 5. Required frontend environment values

Set in Render frontend service env:
- `VITE_API_URL=https://<backend-domain>`

## 6. Bootstrap schema and health check

After backend starts:
1. Open Render backend shell.
2. Run:
   - `npm run db:bootstrap`
3. Verify:
   - `GET https://<backend-domain>/health` returns `{ ok: true, ... }`

## 7. Email API sender (Resend)

1. In Resend, verify your domain.
2. Add DNS records shown by Resend (SPF/DKIM).
3. Create an API key.
4. Create sender identity (for example `noreply@yourdomain.com`).

If you later add backend transactional email endpoints, store:
- `RESEND_API_KEY`
- `MAIL_FROM=noreply@yourdomain.com`

## 8. Testing -> staging -> production flow

1. Open PR to `develop`:
   - CI runs (frontend build/test/lint + backend tests + smoke API).
2. Merge to `develop`:
   - `.github/workflows/deploy-render.yml` can trigger staging deploy hooks.
3. Validate staging manually:
   - auth flow
   - key API endpoints
   - one DB write/read flow
4. Merge `develop` -> `main`:
   - same workflow can trigger production deploy hooks.
5. Re-run post-deploy checks in production.

## 9. GitHub secrets for deploy hooks

Add these repo secrets:
- `RENDER_STAGING_BACKEND_DEPLOY_HOOK`
- `RENDER_STAGING_FRONTEND_DEPLOY_HOOK`
- `RENDER_PROD_BACKEND_DEPLOY_HOOK`
- `RENDER_PROD_FRONTEND_DEPLOY_HOOK`

Hooks are available in each Render service under Settings -> Deploy Hook.
