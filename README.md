# GAK - Gyaan Ahara Karma
GAK is a multimodal behavioral intelligence platform that aggregates academic, fitness, nutritional, and scheduling signals to model student behavior and enable  predictive analytics, and context-aware planning.

It is built around three pillars:

- **Gyaan** - attendance, timetable, marks, academic risk, and study planning.
- **Karma** - workout plans, daily fitness actions, Google Fit data, and discipline tracking.
- **Ahara** - meal logging, calories, macros, nutrition history, and food-analysis workflows.

The idea is simple: a student's day is shaped by classes, marks, deadlines, workouts, meals, and habits together. GAK connects those signals so the student can understand what needs attention today and how they are progressing over time.

## What It Does

### Academics: Gyaan

- Tracks subject-wise attendance, marks, timetable, and day order.
- Shows below-75 attendance risk and subject performance summaries.
- Includes an attendance prediction tool for future missed classes.
- Supports SRM Academia sync for attendance, marks, timetable, and reports.
- Provides academic history with CGPA, attendance trends, and insights.

### Fitness: Karma

- Uploads and parses workout plan PDFs.
- Shows today's workout from the uploaded plan.
- Lets users mark workouts as done or skipped.
- Logs workout sessions and actions.
- Syncs Google Fit activity, calories, body metrics, and related fitness data.
- Provides workout history and progress insights.

### Nutrition: Ahara

- Supports manual meal logging.
- Includes a food image logging flow with editable detected items.
- Tracks daily calories, protein, carbs, and fats.
- Shows meal history and nutrition trends.
- Includes a dummy food-analysis endpoint for future AI vision integration.

### Planner, Dashboard, and Integrations

- Combines deadlines, calendar events, workouts, recommendations, and schedule data into a daily plan.
- Shows overall consistency and pillar-wise scorecards.
- Generates warnings, insights, and recommendations from behavior data.
- Connects with Google OAuth, Calendar, Gmail, Tasks, Docs, Google Fit, and SRM Academia.

## How It Works

```text
React Frontend
      |
      | REST API with JWT
      v
Express Backend
      |
      | controllers -> services -> models
      v
MySQL Database
```

The backend also includes integration services and optional scheduled jobs for token refresh, Gmail sync, Calendar sync, Fit sync, Academia sync, cleanup, and metrics recomputation.

## Tech Stack

**Frontend**

- React 18
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui
- Radix UI
- Framer Motion
- Recharts

**Backend**

- Node.js
- Express
- MySQL 8
- JWT authentication
- bcrypt
- Helmet, CORS, rate limiting
- Google APIs
- Multer
- pdf-parse
- Playwright / Puppeteer support for Academia flows
- node-cron

**Infrastructure**

- Docker
- Docker Compose
- Nginx
- GitHub Actions CI
- MySQL backup and restore scripts

## Project Structure

```text
GAK-Gyaan-Ahara-Karma/
|-- Frontend/                 # React + Vite app
|   |-- src/pages/            # Main screens
|   |-- src/components/       # Shared UI and domain components
|   |-- src/lib/              # API client and helpers
|   `-- src/hooks/            # Custom hooks
|
|-- gak-backend/              # Express API server
|   |-- src/routes/           # API routes
|   |-- src/controllers/      # Request handling
|   |-- src/services/         # Business logic
|   |-- src/models/           # MySQL queries
|   |-- src/jobs/             # Scheduled jobs
|   |-- src/utils/            # Auth, encryption, scraping, parsing helpers
|   |-- sql/                  # Schema and migrations
|   `-- scripts/              # DB and smoke-test scripts
|
|-- docs/                     # Architecture and deployment notes
`-- docker-compose.yml
```

## Main Routes

- `/home` - dashboard
- `/gyaan` - academics
- `/karma` - fitness
- `/ahara` - nutrition
- `/planner` - daily plan and calendar
- `/profile` - account and integrations
- `/history/academic` - academic history
- `/history/workout` - workout history
- `/history/nutrition` - nutrition history

## API Areas

- `/api/users` - auth, profile, export, account deletion
- `/api/academic` - attendance, marks, timetable, performance
- `/api/fitness` - workout plans, sessions, Google Fit metrics
- `/api/nutrition` - meals, macros, food logging
- `/api/integrations` - Google services and Academia sync
- `/api/advanced-analytics` - behavior summaries and recommendations
- `/api/history` - academic, fitness, and nutrition history
- `/api/jobs` - manual job triggers

Most app endpoints require:

```http
Authorization: Bearer <jwt-token>
```

## Setup

### Requirements

- Node.js 20+
- npm
- MySQL 8.x
- Google OAuth credentials, optional for live integrations
- Docker, optional

### Backend

```sh
cd gak-backend
cp .env.example .env
npm install
npm run db:bootstrap
npm run dev
```

Backend runs on:

```text
http://127.0.0.1:4000
```

Health check:

```sh
curl http://127.0.0.1:4000/health
```

### Frontend

```sh
cd Frontend
npm install
npm run dev
```

Frontend usually runs on:

```text
http://localhost:5173
```

If needed:

```env
VITE_API_URL=http://127.0.0.1:4000
```

## Docker

```sh
docker compose up -d --build
```

Services:

- Frontend: `http://localhost:8080`
- Backend: `http://127.0.0.1:4000`
- MySQL: `3306`

## Useful Commands

```sh
# Backend
cd gak-backend
npm test
npm run smoke:api
npm run db:backup -- ./backups
npm run db:restore -- ./backups/<file>.sql

# Frontend
cd Frontend
npm run build
npm run test
npm run lint
```

## Security Notes

GAK includes:

- bcrypt password hashing
- JWT authentication
- CORS allowlisting
- Helmet security headers
- rate limiting
- OAuth state validation
- AES-256-GCM encryption for stored integration tokens
- user data export and account deletion

Do not commit real `.env` files or secrets.

## Current Limitations

- Nutrition image analysis is currently a dummy future-scope flow.
- History export downloads an HTML report even where the UI uses PDF wording.
- Academia sync depends on the external portal and may require manual handling for captcha, MFA, or session limits.
- Google integrations require proper OAuth credentials and scopes.
- Background jobs are disabled by default in local development.

## Future Direction

- Replace dummy nutrition analysis with real food-image recognition.
- Add broader controller, service, and frontend tests.
- Expand planner intelligence using more academic, fitness, and nutrition signals.
- Add notifications for deadlines, attendance risk, workouts, and meal goals.
- Improve mobile/PWA support.

## Documentation

- `docs/architecture-and-operations.md`
- `docs/deployment-checklist.md`
- `gak-backend/docs/OPERATIONS_READINESS.md`
- `gak-backend/docs/PRIVACY_POLICY.md`
- `gak-backend/docs/TERMS_OF_SERVICE.md`
