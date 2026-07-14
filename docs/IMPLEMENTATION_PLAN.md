# Implementation Plan — Tempo AI Running Coach

Updated: 2026-07-14  
PRD: `PRD.md` v1.1  
Governing rules: `CLAUDE.md`

---

## Phase overview

| Phase | Goal | Key deliverable |
|---|---|---|
| **1** | Foundation | Schema migration, raw file storage, lint clean, Zod, data service layer skeleton |
| **2** | FIT ingestion v2 | ZIP support, SHA-256 dedup, parser version tracking, athlete context capture |
| **3** | Deterministic analytics | Aerobic efficiency, threshold, running economy; stored with version metadata |
| **4** | Training state engine | Block/mileage/rotation tracking, pain flags, training state table |
| **5** | Nebius coaching layer | Context package, Nebius call, response persistence, coaching display |
| **6** | Dashboard v2 | Metrics trends, weekly review, mileage vs target, flags |
| **7** | Plan management | plan_json structure, plan versioning, schedule editor, planned workouts |
| **8** | Conversational coach | Query-specific retrieval, chat interface |

Each phase: inspect → plan → implement → migrate → test → lint/typecheck → exit criteria → stop.

---

## Phase 1 — Foundation

**Goal:** Clean baseline. Add migration system, expand schema for the full data model, add raw file storage plumbing, fix all lint errors, make Zod explicit, and introduce the data service layer. No new product features visible to the user.

**Exit criteria:**
- `npm run lint` → 0 errors, 0 warnings
- `npx tsc --noEmit` → 0 errors
- `npm run test` → all tests pass (unit tests for rotation.ts and fmt.ts)
- Migration files generated and applied; `drizzle-kit push` no longer used
- Schema contains all Phase 1 tables
- `parseFitBuffer` stores SHA-256 and parser version in returned object
- Vercel Blob env var documented in `.env.example`
- No user-visible behavior changes

---

### Phase 1 file-change list

#### 1.1 — Add Zod and Vitest to package.json

**File:** `package.json`

Add to `dependencies`:
```json
"zod": "^3.24.0"
```

Add to `devDependencies`:
```json
"vitest": "^3.0.0",
"@vitejs/plugin-react": "^4.0.0"
```

Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Why vitest not Jest:** Vitest works with ESM and the bundler module resolution already configured in tsconfig.json without needing `ts-jest` transforms. Jest requires additional config for Next.js ESM.

---

#### 1.2 — Switch to drizzle-kit migrations

**File:** `drizzle.config.ts` — change `out` directory and remove push-only workflow

```typescript
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  migrations: { table: "__drizzle_migrations", schema: "public" },
} satisfies Config
```

**File:** `package.json` — update scripts:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```
Remove `"db:push"`.

**New directory:** `drizzle/migrations/` — generate the initial migration from the current schema, then generate a second migration for the new Phase 1 tables.

---

#### 1.3 — Expand schema

**File:** `src/lib/db/schema.ts` — add the following tables. Existing tables are unchanged.

**`fit_files`** — immutable raw file record
```
id          text PK
user_id     → user.id CASCADE
sha256      text UNIQUE NOT NULL       -- deduplication key
blob_url    text                       -- Vercel Blob URL (null until stored)
file_name   text
file_size_bytes integer
parser_version text NOT NULL           -- e.g. "fit-file-parser@3.0.2/v1"
created_at  timestamp defaultNow
```

**`athlete_context`** — per-workout subjective context
```
id               text PK
workout_log_id   → workout_log.id CASCADE
user_id          → user.id CASCADE
feel             text                  -- athlete free text
rpe              integer               -- 1–10
outside_temp_c   real                  -- athlete-reported (distinct from device)
humidity_pct     real
pain_location    text
pain_side        text                  -- left/right/bilateral/none
pain_walking     integer               -- 0–10
pain_running     integer               -- 0–10
pain_character   text
gait_change      boolean
sleep_quality    integer               -- 1–5
travel           boolean
massage          boolean
illness          boolean
nutrition_notes  text
created_at       timestamp defaultNow
```

**`pain_flags`** — persisted pain state across sessions
```
id            text PK
user_id       → user.id CASCADE
location      text NOT NULL
side          text
level         text NOT NULL            -- green/yellow/orange/red
first_noted   timestamp NOT NULL
last_noted    timestamp NOT NULL
resolved_at   timestamp
notes         text
created_at    timestamp defaultNow
```

**`coaching_analyses`** — one row per LLM call; full audit trail
```
id               text PK
user_id          → user.id CASCADE
workout_log_id   → workout_log.id (nullable; weekly review has no single log)
analysis_type    text NOT NULL         -- post_workout / weekly_review / query
provider         text NOT NULL         -- nebius
model            text NOT NULL
analytics_version text NOT NULL
prompt_text      text NOT NULL
context_snapshot jsonb NOT NULL        -- exact package sent to LLM
response_raw     text NOT NULL
response_parsed  jsonb
headline         text
decision         text
grade            text
flags            jsonb
follow_up_questions jsonb
created_at       timestamp defaultNow
```

**`training_plan_versions`** — versioned structured plan (alongside existing markdown)
```
id             text PK
user_id        → user.id CASCADE
version_number integer NOT NULL
effective_from date NOT NULL
effective_until date                   -- null = current version
plan_json      jsonb NOT NULL          -- structured schedule (see plan_json spec below)
change_reason  text
change_author  text                    -- athlete / system
prior_version_id text → training_plan_versions.id
created_at     timestamp defaultNow
```

**`training_state`** — single-row per user, updated deterministically
```
id                    text PK
user_id               → user.id CASCADE UNIQUE
active_plan_version_id → training_plan_versions.id
current_block         integer
current_rotation_week text              -- A/B/C/D
week_start_date       date
mileage_band_min_mi   real
mileage_band_max_mi   real
long_run_index        integer
threshold_index       integer
lthr_bpm              integer
vo2max_trend          real
missed_workouts_this_week integer default 0
updated_at            timestamp defaultNow
```

**`planned_workouts`** — generated schedule from active plan version
```
id                text PK
user_id           → user.id CASCADE
plan_version_id   → training_plan_versions.id
scheduled_date    date NOT NULL
weekday           text NOT NULL          -- Monday / Tuesday / etc.
rotation_week     text NOT NULL          -- A/B/C/D
workout_type      text NOT NULL          -- easy / quality / long / etc.
prescription      text                   -- human-readable description
target_distance_m real
target_duration_secs real
target_hr_min     integer
target_hr_max     integer
completed         boolean default false
workout_log_id    → workout_log.id (nullable; set when completed)
adjustment_reason text                   -- if day-level adjusted
created_at        timestamp defaultNow
```

**`jobs`** — background processing queue for Vercel Cron
```
id            text PK
user_id       → user.id CASCADE
type          text NOT NULL              -- fit_reparse / coaching_analysis / weekly_review
payload       jsonb NOT NULL
status        text NOT NULL default 'pending'  -- pending/running/done/failed
attempts      integer default 0
last_error    text
created_at    timestamp defaultNow
updated_at    timestamp defaultNow
```

**Additions to `workout_log`:**
```
fit_file_id         → fit_files.id (nullable; null for existing rows)
planned_workout_id  → planned_workouts.id (nullable)
planned_workout_type text              -- what was prescribed
observed_workout_type text            -- what was actually done (classified at parse time)
athlete_timezone    text              -- IANA tz string, captured at upload
```

---

#### 1.4 — Fix FIT parser lint errors

**File:** `src/lib/fit/parser.ts`

- Define minimal interfaces for raw FIT data shapes:
  ```typescript
  interface FitRecord { timestamp: string; heart_rate?: number; speed?: number; distance?: number; [key: string]: unknown }
  interface FitEvent { event: string; event_type: string; timestamp: string }
  interface FitLap { records?: FitRecord[]; [key: string]: unknown }
  interface FitSession { laps?: FitLap[]; start_time: string; [key: string]: unknown }
  interface FitData { activity?: { sessions?: FitSession[]; events?: FitEvent[]; device_infos?: unknown[] } }
  ```
- Replace all `any` with these types or `unknown` where the shape is truly variable.
- Remove `fileName` parameter (unused) from `parseFitBuffer` signature.
- Update `log/actions.ts` to not pass filename to `parseFitBuffer`.
- Add `sha256` and `parserVersion` fields to `ParsedWorkout` return type.

**Compute SHA-256 in parseFitBuffer:**
```typescript
import { createHash } from "crypto"
// At start of parseFitBuffer:
const sha256 = createHash("sha256").update(buffer).digest("hex")
// Return it in ParsedWorkout
```

Add `parserVersion` constant at top of file:
```typescript
const PARSER_VERSION = "fit-file-parser@3.0.2/v1"
```

---

#### 1.5 — Create data service layer

**New directory:** `src/lib/services/`

Create stub service files — typed signatures only, implementations come in subsequent phases:

**`src/lib/services/workout.service.ts`**
```typescript
// getWorkoutById(userId, id): Promise<WorkoutLog | null>
// getRecentWorkouts(userId, limit): Promise<WorkoutLog[]>
// createWorkout(userId, data): Promise<WorkoutLog>
// getComparableWorkouts(userId, type, duration, temp): Promise<WorkoutLog[]>
```

**`src/lib/services/plan.service.ts`**
```typescript
// getActivePlan(userId): Promise<TrainingPlan | null>
// getActivePlanVersion(userId): Promise<TrainingPlanVersion | null>
// savePlanMarkdown(userId, content, title, startDate, startWeek): Promise<void>
```

**`src/lib/services/trainingState.service.ts`**
```typescript
// getTrainingState(userId): Promise<TrainingState | null>
// updateTrainingState(userId, patch): Promise<void>
```

Services are thin wrappers over Drizzle queries. Pages import services, not `db` directly. Dashboard and workout detail pages are migrated to use services in Phase 1 (straightforward lift-and-shift).

---

#### 1.6 — Add Zod schemas for existing server actions

**New file:** `src/lib/validation/actions.ts`

```typescript
import { z } from "zod"

export const uploadWorkoutSchema = z.object({
  perceivedEffort: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
})

export const savePlanSchema = z.object({
  title: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startWeek: z.enum(["A", "B", "C", "D"]),
})
```

Update `src/app/log/actions.ts` and `src/app/onboarding/actions.ts` to parse non-file FormData fields through these schemas before DB writes.

---

#### 1.7 — Unit tests for pure functions

**New file:** `src/lib/rotation.test.ts`
- Tests for `getRotationWeek` across week boundaries, negative offset (dates before anchor), and all four starting weeks
- Tests for `extractWorkout` with various markdown structures
- Tests for edge cases: missing week section, missing day section

**New file:** `src/lib/fmt.test.ts`
- Tests for each formatter with null, zero, and typical values
- Tests for `fmtPace` with edge case speeds

---

#### 1.8 — Update .env.example

Add new variables:
```
# Vercel Blob — for immutable raw FIT file storage
BLOB_READ_WRITE_TOKEN=""

# Nebius AI — coaching analysis
NEBIUS_API_KEY=""
NEBIUS_BASE_URL="https://api.studio.nebius.ai/v1/"
NEBIUS_MODEL="meta-llama/Meta-Llama-3.1-70B-Instruct"

# Analytics versioning
ANALYTICS_VERSION="1"
```

---

#### 1.9 — Timezone-aware today calculation

**File:** `src/lib/rotation.ts` — update `getTodayInfo` to accept an optional timezone string:

```typescript
export function getTodayInfo(anchorDate: Date, anchorWeek: RotationWeek, tz?: string) {
  // Use Intl.DateTimeFormat to get the current date in the athlete's timezone
  // rather than the server's UTC date
  const today = tz ? toLocalDate(tz) : new Date()
  // ...
}
```

This is a non-breaking change (default stays UTC). Callers can opt in once `athlete_timezone` is captured.

---

### Phase 1 — Dependency changes summary

```
npm install zod
npm install --save-dev vitest @vitejs/plugin-react
```

No new runtime dependencies needed in Phase 1 — raw file storage (Vercel Blob) is in Phase 2.

---

## plan_json structure specification

The `training_plan_versions.plan_json` column stores the structured schedule. This is what the scheduling engine reads; the existing `training_plan.content` markdown is retained for display.

```typescript
interface PlanJson {
  version: 1
  rotationLength: 4             // A/B/C/D
  rotationLabels: ["A","B","C","D"]
  mileageBands: Array<{
    rotationWeek: "A"|"B"|"C"|"D"
    minMi: number
    maxMi: number
  }>
  weekTemplates: {
    [rotationWeek: string]: WeekTemplate  // "A" | "B" | "C" | "D"
  }
}

interface WeekTemplate {
  rotationWeek: "A"|"B"|"C"|"D"
  label: string                 // "Threshold" / "Tempo" / "Progression" / "Cutback"
  days: DayTemplate[]
}

interface DayTemplate {
  weekday: "Monday"|"Tuesday"|"Wednesday"|"Thursday"|"Friday"|"Saturday"|"Sunday"
  workoutType: WorkoutType
  prescription: string          // human-readable description
  targetDistanceM?: number
  targetDurationSecs?: number
  targetHrMin?: number
  targetHrMax?: number
  isRunDay: boolean
  isStrengthDay: boolean
  isRestDay: boolean
}

type WorkoutType =
  | "easy" | "recovery" | "long" | "threshold" | "tempo"
  | "progression" | "easy+strides" | "cutback_long"
  | "strength_push" | "strength_pull" | "elastic"
  | "rest" | "other"
```

Phase 7 adds the UI editor. Phase 1 only defines the type; the `training_plan_versions` table is created but no rows are inserted yet.

---

## Architecture decisions

### FIT parser: TypeScript-only (no separate service)
`fit-file-parser` parses a typical 1-hour run in < 500ms in the Next.js server action context. The `serverExternalPackages` config loads it at runtime correctly. A separate worker or microservice adds deployment complexity with no measurable benefit at this scale. Reassess if files routinely exceed 50MB or parse times exceed 10 seconds.

### Vercel Blob over S3 for raw storage
`@vercel/blob` is zero-config on Vercel, uses the same edge network, and requires only one environment variable. S3-compatible storage can be substituted later by swapping the upload call — the schema stores a generic `blob_url`. No lock-in.

### Nebius via OpenAI-compatible SDK
Nebius exposes an OpenAI-compatible REST API. Use the `openai` npm package with `baseURL` and `apiKey` pointed at Nebius. This is the pattern Nebius documents, avoids a custom SDK, and means the Nebius calls look identical to standard OpenAI usage — easy to understand and test.

### Zod for all server-action inputs and all Nebius responses
Every server action validates its FormData before touching the DB. Every Nebius JSON response is validated against a Zod schema before being persisted. This enforces the PRD requirement: "Validate every Nebius response with Zod."

### Data services layer
Pages and server actions call `src/lib/services/*.service.ts` functions. Services call `db` directly (no repository abstraction on top of Drizzle — that would be redundant). This gives one place to add caching, logging, or observability later.

---

## Phase 2 preview (FIT ingestion v2)

Files to change:
- `src/app/log/page.tsx` — add athlete context fields (temperature, pain, sleep, travel, humidity)
- `src/app/log/actions.ts` — store raw FIT to Vercel Blob, compute SHA-256, check for duplicates, insert `fit_files` row, insert `athlete_context` row, link to `workout_log`
- `src/lib/fit/parser.ts` — add ZIP extraction (using Node's built-in `zlib` or `unzipper`), return `parserVersion` and `sha256`
- `src/lib/validation/actions.ts` — add Zod schema for athlete context fields
- `next.config.ts` — add `@vercel/blob` to `serverExternalPackages` if needed

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Migration on live Neon DB corrupts existing data | Generate migration SQL, review it, apply in a transaction; take Neon point-in-time snapshot before applying |
| `training_plan` markdown vs `plan_json` mismatch | Keep both; `plan_json` is null until Phase 7 editor is built; display still uses markdown `content` |
| `workout_log` foreign keys to new tables fail for existing rows | Add `fit_file_id` and `planned_workout_id` as nullable; existing rows keep null; no backfill needed |
| Vercel Blob not available in dev | Check for `BLOB_READ_WRITE_TOKEN` and skip blob upload in dev, still save parse results to DB |
| Timezone bug in existing rotation logic | Add timezone support as opt-in; existing behavior unchanged until `athlete_timezone` is captured |
