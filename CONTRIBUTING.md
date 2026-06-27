# Contributing

## Setup

```sh
git clone <repo-url>
cd GAK-Gyaan-Ahara-Karma

cp gak-backend/.env.example gak-backend/.env
# Fill in at minimum: DB_*, JWT_SECRET

docker compose up -d --build
docker compose exec backend npm run db:bootstrap
```

Frontend runs at `http://localhost:8080`, API at `http://localhost:4000`.

## Workflow

1. Branch from `develop`:
   ```sh
   git checkout develop
   git checkout -b feature/your-feature
   ```
2. Make small, focused commits with descriptive messages.
3. Run tests before opening a PR:
   ```sh
   cd gak-backend && npm test
   ```
4. Open a PR against `develop`, not `main`.

`main` only receives merges from `develop` after integration testing.

## Playwright setup (for scraper work)

The academia scraper requires a Chromium browser:

```sh
npx playwright install chromium
```

In Docker this is handled automatically by the Dockerfile.

## Commit message format

Use imperative mood in the subject line:
- `Add attendance caching`
- `Fix session invalidation on token replay`
- `Remove unused migration script`

Not: `Added`, `Fixes`, `Removing`.

Keep the subject under 72 characters. Add a body if the change needs
explaining (the *why*, not the *what*).
