# Codebase Audit — Tempo AI Running Coach

Audited: 2026-07-14  
Branch: `claude/tempo-landing-skeleton-8t5abb`  
Commit: `0d818a2`

---

## 1. Stack inventory

| Layer | Technology | Version | Status |
|---|---|---|---|
| Framework | Next.js App Router | 16.2.9 | ✅ Deployed |
| Language | TypeScript strict | 5.9.3 | ✅ Clean typecheck |
| Auth | Auth.js v5 (next-auth) | 5.0.0-beta.31 | ✅ Working |
| Auth provider | Resend magic-link | via next-auth | ✅ Wired |
| Auth adapter | @auth/drizzle-adapter | 1.11.2 | ✅ Wired |
| Database | Neon Postgres (serverless/HTTP) | 1.1.0 | ✅ Connected |
| ORM | Drizzle ORM | 0.45.2 | ✅ In use |
| ORM migrations | drizzle-kit push only | 0.31.10 | ⚠️ No migration files |
| FIT parsing | fit-file-parser (CommonJS) | 3.0.2 | ✅ Works; lint errors |
| Styling | Tailwind CSS v4 (CSS config) | 4.3.1 | ✅ Working |
| Markdown render | react-markdown | 10.1.0 | ✅ In use |
| Validation | zod | (transitive only) | ⚠️ Not in package.json |
| Hosting | Vercel | — | ✅ Deployed |
| LLM | Nebius AI API | — | ❌ Not installed |
| File storage | Vercel Blob / S3 | — | ❌ Not installed |
| Charts | Recharts | — | ❌ Not installed |
| Testing | — | — | ❌ No test files |
| Job queue | Vercel Cron + DB | — | ❌ Not implemented |

---

## 2. File map

```
src/
  app/
    api/auth/[...nextauth]/route.ts   Auth.js catch-all handler
    dashboard/page.tsx                 Server component; today + next-7 + recent workouts
    log/page.tsx                       Client form; FIT upload
    log/actions.ts                     Server action: uploadWorkout
    onboarding/page.tsx                Client form; plan upload
    onboarding/actions.ts              Server actions: savePlan, signOutAction
    plan/today/page.tsx                Redirect → /plan/[week]/[day]
    plan/[week]/[day]/page.tsx         Plan day detail with WorkoutMarkdown
    workout/[id]/page.tsx              Workout detail, all session metrics, lap table
    sign-in/page.tsx                   Magic-link email form
    page.tsx                           Landing page
    layout.tsx                         Root layout with NavBar
    globals.css                        Tailwind v4 CSS import
  components/
    NavBar.tsx                         Fixed bottom tab bar (client)
    WorkoutMarkdown.tsx                react-markdown wrapper (client)
  lib/
    auth/.gitkeep                      Placeholder
    coaching/.gitkeep                  Placeholder
    db/
      index.ts                         Neon HTTP connection + Drizzle instance
      schema.ts                        All table definitions
    fit/
      parser.ts                        parseFitBuffer(); derives HR drift, run-walk splits
    payments/.gitkeep                  Placeholder
    fmt.ts                             Display formatters (pace, distance, duration, etc.)
    rotation.ts                        A/B/C/D week rotation + extractWorkout()
  middleware.ts                        Auth.js edge middleware; protects app routes
```

---

## 3. Database schema — current state

### Auth.js tables (singular names — must not change)
```sql
"user"              id, name, email, emailVerified, image
"account"           userId → user.id, provider, providerAccountId, tokens…
"session"           sessionToken PK, userId → user.id, expires
"verificationToken" identifier + token PK, expires
```

### Application tables
```sql
"training_plan"  id, userId → user.id, title, content (markdown TEXT), 
                 start_date, start_week, created_at

"workout_log"    id, userId → user.id, fit_file_name,
                 -- timing: start_time, total_elapsed_secs, total_timer_secs
                 -- sport: sport, sub_sport
                 -- distance, HR, speed, cadence, elevation, calories, temperature
                 -- running dynamics: vertical_oscillation, stance_time, vertical_ratio, stride_length
                 -- training load: training_load, aerobic/anaerobic TE, TE messages
                 -- physiology: avg/max respiration_rate, vo2_max
                 -- GPS bounds: nec_lat/long, swc_lat/long
                 -- derived HR: first_half_avg_hr, second_half_avg_hr, hr_drift_bpm
                 -- derived run-walk: run_only_distance_m, run_only_duration_secs,
                 --                   run_only_avg_speed_mps, run_only_avg_hr, walk_duration_secs
                 -- JSONB: laps, records, events, device_info
                 -- annotations: notes, perceived_effort
                 created_at
```

### Schema gaps vs PRD requirements

| Required table/column | Missing |
|---|---|
| Raw FIT file storage (blob URL + SHA-256) | ❌ FIT bytes are parsed and discarded |
| `fit_files` with `UNIQUE(user_id, sha256)` | ❌ SHA-256 uniqueness scoped to user |
| `parser_version` metadata | ❌ |
| `planned_workout_type` / `observed_workout_type` | ❌ |
| `athlete_context` (temp, sleep, travel — one-to-one with workout_log) | ❌ (only RPE + notes exist; one-to-one not enforced) |
| `pain_observations` (per-location per-workout; supports longitudinal recurrence queries) | ❌ |
| `pain_flags` (persistent carry-across-sessions state) | ❌ |
| `coaching_analyses` (prompt, context, response, model, version) | ❌ |
| `training_plan_versions` with generic `plan_json` (arbitrary cycle length, user-defined week IDs) | ❌ |
| `planned_workouts` with `sessions_json` (multi-session days) and `cycle_week_id` | ❌ |
| `training_state` with `current_cycle_week_id` (not a fixed ABCD field) | ❌ |
| `jobs` (background processing queue) | ❌ |
| `comparator_selections` (which workouts were compared) | ❌ |

---

## 4. Lint / typecheck baseline

**TypeScript:** `npx tsc --noEmit` → **0 errors**

**ESLint:** `npm run lint` → **22 errors, 2 warnings** — all in `src/lib/fit/parser.ts`

| Category | Count | Location |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 20 errors | parser.ts — all FIT data typed as `any` |
| `@typescript-eslint/no-unused-vars` | 2 warnings | `fileName` param (line 188), `_` destructure (line 221) |

**No tests exist.** Zero test files in the repository.

---

## 5. What to preserve (do not break)

| Item | Disposition | Reason |
|---|---|---|
| `src/auth.ts` | Preserve permanently | Auth.js config is correct and working |
| `src/lib/db/index.ts` | Preserve permanently | Neon HTTP driver; correct pattern for serverless |
| Auth table names in schema.ts | Preserve permanently | Singular names required by DrizzleAdapter |
| `src/middleware.ts` | Preserve; extend | Edge auth protection; add new routes but don't restructure |
| `src/lib/rotation.ts` | **Legacy — preserve until Phase 3 migration complete** | Provides `getRotationWeek`, `extractWorkout` used by current dashboard and plan pages. The canonical scheduling engine (Phase 3) reads `plan_json` and does not call these. Once all callers are migrated, this file is deleted. |
| `src/lib/fmt.ts` | Preserve permanently | Display formatters are correct |
| `next.config.ts` DATABASE_URL fallback | Preserve permanently | Enables `next build` without real credentials |
| `next.config.ts` serverExternalPackages | Preserve permanently | Required for CommonJS fit-file-parser |
| `.env.example` | Extend | Documents all required env vars |
| `.gitignore` env patterns | Preserve permanently | Explicit patterns; must not be replaced with broad `*.env*` glob |

---

## 6. Missing dependencies

These are required by the PRD but not in `package.json`.

| Package | Purpose | Notes |
|---|---|---|
| `zod` | Schema validation for server actions and Nebius responses | Transitive today; must be made explicit |
| `recharts` | Trend charts on dashboard | Install when chart work begins |
| `@vercel/blob` | Immutable raw FIT file storage | Install before Phase 2 file storage |
| Nebius SDK | LLM coaching analysis | Use `openai` npm pkg pointed at Nebius base URL (OpenAI-compatible API) |
| Test framework | Unit tests for analytics | `vitest` recommended (works with Next.js TS project without Jest transform issues) |

---

## 7. Architectural concerns and risks

### R1 — No raw FIT file storage (critical)
PRD principle: "Raw workout files are immutable." Currently FIT bytes are parsed in-memory in a server action and discarded. If the parser changes or a bug is found, workouts cannot be re-parsed. Vercel Blob must be added before production use.

### R2 — `drizzle-kit push` not suitable for production
`npm run db:push` applies schema directly. No migration history, no rollback. The PRD says "use migrations." Switch to `drizzle-kit generate` + `migrate` before any schema changes that touch existing data.

### R3 — FIT parser uses `any` throughout
22 lint errors block CI. The FIT data shape from `fit-file-parser` is untyped, so `any` is pragmatic — but lint must pass. Suppress with targeted `// eslint-disable-next-line` on each line rather than blanket `any` suppression; or define a minimal `FitRawRecord` interface matching the actual shape.

### R4 — No Zod validation on server actions
`uploadWorkout` and `savePlan` accept raw `FormData` with no schema validation. Any structural mismatch reaches the DB. Zod must be added before the action surface grows.

### R5 — Training plan stored as raw markdown; plan model was hard-coded to ABCD
The PRD requires `plan_json` — a structured schedule from which the scheduling engine generates future workouts. The current `content` column stores raw markdown. Additionally, the original plan design fixed `rotationLength: 4` and `rotationLabels: ["A","B","C","D"]` as TypeScript literals, which encodes the seed plan as a product assumption. The revised model uses a generic `cycleWeeks: CycleWeek[]` array with user-defined IDs and labels. Phase 1 defines the `PlanJson` types (generic). Phase 3 seeds the first version from existing markdown and migrates the scheduling engine. Both representations coexist during the transition; markdown `content` is retained for display.

### R6 — No data service layer
CLAUDE.md: "Keep data access in repositories/services." Currently all DB queries are inline in Next.js page server components and server actions. This will become unmaintainable when coaching analyses, comparators, and training state are added.

### R7 — FIT ZIP support missing
PRD requires `.zip` containing a `.fit` file. The current `uploadWorkout` action rejects non-`.fit` files. ZIP extraction must be added.

### R8 — Duplicate FIT detection missing
PRD: "compute SHA-256; reject exact duplicates; detect likely duplicate activities." Neither exists.

### R9 — No athlete timezone handling
`rotation.ts` uses `new Date()` which returns the server's UTC time. The PRD says "The app reads athlete timezone." For users in non-UTC timezones, `getTodayInfo` will return the wrong day after midnight UTC. This needs timezone-aware date handling.

### R10 — `vo2Max` field mapped incorrectly
In `parser.ts` line 274: `vo2Max: n(session.enhanced_avg_respiration_rate) ?? n(session.vo2_max_data)` — `enhanced_avg_respiration_rate` is not VO2max. Fix in Phase 1: use `n(session.vo2_max_data)` only.

### R11 — `pain_observations` absent; pain fields in wrong table
Pain capture (location, level, character, onset) belongs in a normalized `pain_observations` table (one row per body part per workout), not flattened into `athlete_context`. Without a separate model, queries such as "does left knee pain recur after threshold sessions?" cannot be answered correctly. `athlete_context` retains only subjective workout context (feel, RPE, sleep, travel, illness, nutrition).

### R12 — Scheduling engine cannot exist without a structured plan model
The PRD requires `"Generate schedules from active training_plan_versions.plan_json."` No structured plan exists yet. Until Phase 3 seeds the first `training_plan_version`, the dashboard, today's workout, and planned_workouts all depend on `rotation.ts` + markdown extraction — both of which are legacy adapter logic that must be retired.

---

## 8. FIT parser: TypeScript-only vs worker

**Recommendation: Stay TypeScript-only.**

`fit-file-parser` with `mode: "cascade"` is fast enough for single-file synchronous parsing (< 1 second for a typical 1-hour run). Moving it to a worker or separate service adds infrastructure complexity without a performance reason at this scale. The `serverExternalPackages` config already handles the CommonJS module correctly. If parse times exceed 5 seconds on very large files, revisit using a Web Worker or Route Handler with streaming — but only then.

---

## 9. Environment variables — current vs required

| Variable | Current | Required by PRD |
|---|---|---|
| `DATABASE_URL` | ✅ In use | ✅ |
| `AUTH_SECRET` | ✅ In use | ✅ |
| `AUTH_RESEND_KEY` | ✅ In use | ✅ |
| `AUTH_GOOGLE_ID/SECRET` | In .env.example only | Optional (Resend is working) |
| `BLOB_READ_WRITE_TOKEN` | ❌ Missing | Required for Vercel Blob |
| `NEBIUS_API_KEY` | ❌ Missing | Required for coaching analysis |
| `NEBIUS_BASE_URL` | ❌ Missing | Required (OpenAI-compat endpoint) |
| `NEBIUS_MODEL` | ❌ Missing | Configurable model name |
| `ANALYTICS_VERSION` | ❌ Missing | For versioning deterministic analytics |
