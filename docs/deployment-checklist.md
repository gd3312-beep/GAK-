# Deployment

## Local development (Docker)

```sh
# 1. Clone and copy the env template
cp gak-backend/.env.example gak-backend/.env
# Fill in DB credentials, JWT secrets, and Google OAuth fields

# 2. Start the stack
docker compose up -d --build

# 3. Bootstrap the database (run once, or after db:truncate)
docker compose exec backend npm run db:bootstrap

# 4. Check it's alive
curl http://localhost:4000/health
```

Frontend is served at `http://localhost:8080`.
Backend API at `http://localhost:4000`.

## Running without Docker

```sh
# Backend
cd gak-backend
npm install
npm run db:bootstrap   # needs a running MySQL at DB_HOST
npm run dev            # nodemon

# Frontend
cd Frontend
npm install
npm run dev            # vite dev server at :5173
```

## Tests

```sh
cd gak-backend
npm test               # jest unit tests
npm run smoke:api      # end-to-end smoke against a running backend
```

## Playwright requirement

The academia scraper uses Playwright. First run installs the browser:

```sh
npx playwright install chromium
```

Or in Docker — the Dockerfile handles this during build.

## Production deployment

1. Set real values for all required env vars from `.env.production.example`
2. Rotate: `JWT_SECRET`, `GOOGLE_TOKEN_SECRET`, `TOKEN_ENCRYPTION_KEYS`, `OAUTH_STATE_SECRET`
3. Set `ENFORCE_HTTPS=true`, `NODE_ENV=production`
4. `docker compose up -d --build`
5. `docker compose exec backend npm run db:bootstrap`

The `JOBS_ADMIN_TOKEN` variable gates `/api/jobs/*` endpoints. Set it to a
strong random string and keep it out of public repos.
