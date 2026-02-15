# Privacy Policy (Draft)

Last updated: February 15, 2026

## Data We Process
- Account data: name, email, password hash.
- Academic data: attendance, marks, timetable, deadlines.
- Fitness/nutrition data: workouts, food logs, health-like metrics.
- Integrations: encrypted Google tokens and encrypted SRM credentials.

## Why We Process It
- Provide personalized academic/fitness/nutrition views.
- Sync user-approved integrations (Google Calendar, Gmail, Fit, SRM).
- Generate recommendations and historical analytics.

## Storage and Security
- Passwords are hashed (`bcrypt`).
- Integration tokens and SRM passwords are encrypted at rest.
- Access is user-scoped using JWT-authenticated APIs.
- Security controls include rate limits, CORS allowlists, and HTTPS enforcement in production.

## User Rights
- Data export: `GET /api/users/me/export`
- Delete account and related data: `DELETE /api/users/me` (password required)

## Retention
- Data is retained until deletion by user request or administrative policy.

## Contact
- Project owner should provide an official support email before public launch.
