# GAK Full Stack Project

This repository contains:
- `Frontend`: React + Vite + TypeScript client.
- `gak-backend`: Node.js + Express API server.
- `database`: legacy SQL reference.

## Quick Start (Local)
1. Start MySQL.
2. Configure backend env using `gak-backend/.env` (or copy from `.env.example`).
3. Bootstrap schema:
   - `cd gak-backend`
   - `npm run db:bootstrap`
4. Run backend:
   - `npm run dev`
5. Run frontend:
   - `cd ../Frontend`
   - `npm run dev`

## Verification Commands
- Frontend: `npm run build && npm run test && npm run lint`
- Backend tests: `npm test`
- API smoke test (backend running on `127.0.0.1:4000`):
  - `npm run smoke:api`

## Database Maintenance
- Backup: `npm run db:backup -- ./backups`
- Restore: `npm run db:restore -- ./backups/<file>.sql`
- Truncate all data (keeps schema):  
  `DB_ALLOW_DESTRUCTIVE=true npm run db:truncate`

## Deployment
- Production env template: `gak-backend/.env.production.example`
- Container setup: `docker-compose.yml`, `Frontend/Dockerfile`, `gak-backend/Dockerfile`

Read detailed architecture and deployment notes in:
- `docs/architecture-and-operations.md`
- `docs/deployment-checklist.md`
