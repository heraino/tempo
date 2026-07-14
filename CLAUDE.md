# CLAUDE.md — 7:20 AI Running Coach

## Existing application

This repository already contains a working Next.js 16 app deployed to Vercel with Auth.js v5 email magic-link authentication, Neon Postgres, and a working front end. Nebius is the chosen LLM API.

Extend this application. Do not replace the auth/database foundation without a documented reason.

## Non-negotiable boundaries

1. Raw workout files are immutable.
2. Deterministic code calculates metrics.
3. The database owns training state.
4. Nebius interprets evidence.
5. Plan changes are versioned.
6. Coaching follows DATA → COACH INTERPRETATION → DECISION.
7. Never infer when data exists.
8. Never silently change the rotation.
9. Store data-quality and confidence metadata.
10. Test analytics before using them in coaching.

## Stack

- Next.js 16 App Router
- TypeScript strict mode
- Auth.js v5
- Neon Postgres
- Drizzle ORM recommended
- Zod
- Vercel
- Nebius AI API
- Vercel Blob or S3-compatible storage
- Vercel Cron plus DB-backed jobs
- Recharts

## Conventions

- Keep data access in repositories/services.
- Keep FIT parsing behind an adapter.
- Keep analytics pure and deterministic where practical.
- Store canonical units in SI.
- Convert at the display boundary.
- Version parser, analytics, prompts, and plans.
- Use migrations for schema changes.
- Never send raw time-series records directly to Nebius.
- Build compact structured context.
- Validate every Nebius response with Zod.
- Persist the exact context snapshot used for every coaching analysis.

## Build discipline

For each phase:
1. inspect the repository;
2. write a concise implementation plan;
3. identify files to modify;
4. implement only the current phase;
5. add migrations and tests;
6. run lint, typecheck, unit, integration, and relevant e2e tests;
7. demonstrate exit criteria;
8. stop before the next phase.

## Safety

This is not a medical device. Do not diagnose injury. Persist pain flags and use conservative training-management language.

## Editable Scheduling Rule

Do not encode product assumptions such as `Wednesday = quality` or `Sunday = long run` in application logic. Those are seed-plan values only. Generate schedules from active `training_plan_versions.plan_json`. Athlete edits to recurring structure create new plan versions. The app may create traceable day-level workout adjustments and may propose structural changes; structural proposals require athlete acceptance by default.
