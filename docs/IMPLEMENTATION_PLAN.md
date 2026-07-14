# Implementation Plan — Tempo AI Running Coach

Updated: 2026-07-14 (rev 2 — incorporating architecture review decisions)
PRD: `PRD.md` v1.1
Governing rules: `CLAUDE.md`

---

## Architecture decisions (standing)

1. **Generic cycle model.** A/B/C/D is seed data only. The plan schema supports an arbitrary number of weeks with user-defined IDs and labels. No TypeScript union or fixed `rotationLength` encodes the four-week assumption.
2. **Sessions, not booleans.** A day holds zero-to-many `SessionTemplate` objects. Tuesday with a recovery run and pull strength = two session entries. A rest day = zero sessions. No `isRunDay`/`isStrengthDay` flags.
3. **`rotation.ts` is legacy adapter logic.** It is preserved for compatibility during the transition and tested in Phase 1. The canonical scheduling engine introduced in Phase 3 reads `plan_json` only. Once Phase 3 is live and all callers are migrated, `rotation.ts` is removed.
4. **Structured plan before training state.** Training state (Phase 5) must operate against a real seeded `PlanJson`, not markdown or hard-coded rotation logic. Phase 3 seeds the structured plan and generates the schedule; Phase 5 consumes it.
5. **Pain observations are separate from context.** `athlete_context` captures subjective workout context (feel, RPE, sleep, travel). `pain_observations` is a normalized model tied to a workout or date that supports longitudinal recurrence queries. `pain_flags` remains the persistent carry-across-sessions state.
6. **SHA-256 uniqueness is per user.** `UNIQUE(user_id, sha256)` — two athletes can upload the same FIT file without conflict.
7. **`athlete_context` is one-to-one.** Enforced by `UNIQUE(workout_log_id)`.
8. **FIT parser stays TypeScript.** No worker or microservice. CommonJS module loaded via `serverExternalPackages`. Reassess only if parse times routinely exceed 10 seconds.
9. **Vercel Blob for raw storage.** Generic `blob_url` column means storage provider is swappable.
10. **Nebius via OpenAI-compatible SDK.** `openai` npm package, `baseURL` pointed at Nebius. Zod validates every response before persistence.

---

## Phase overview

| Phase | Goal | Key deliverable |
|---|---|---|
| **1** | Foundation | Migration system, full schema, lint clean, Zod explicit, service layer, unit tests |
| **2** | FIT ingestion v2 | Blob storage, SHA-256 dedup, ZIP support, athlete context, pain observation capture |
| **3** | Structured plan + scheduling engine | `PlanJson` types, seed from existing plan, `generatePlannedWorkouts`, retire `rotation.ts` callers |
| **4** | Deterministic analytics | Aerobic efficiency, threshold, running economy; versioned, tested |
| **5** | Training state | Block/mileage/cycle-week tracking operating against Phase 3 structured plan |
| **6** | Nebius coaching | Context package, LLM call, response persistence, post-workout display |
| **7** | Dashboard v2 | Mileage vs target, trend charts, weekly review, flags |
| **8** | Plan editor UI | Schedule editor, version diff, proposal/acceptance flow |
| **9** | Conversational coach | Query-specific retrieval, chat interface |

Each phase: inspect → plan → implement → migrate → test → lint/typecheck → exit criteria → stop.

---

## `PlanJson` TypeScript interfaces

Stored in `src/lib/plan/types.ts`. The `training_plan_versions.plan_json` column holds a `PlanJson` object. The scheduling engine reads only this; it never reads `training_plan.content` or calls `rotation.ts`.

```typescript
// ─── Version discriminator ────────────────────────────────────────────────────
// Increment when the shape breaks backward compatibility.
type PlanJsonVersion = 1

// ─── Root ─────────────────────────────────────────────────────────────────────
interface PlanJson {
  version: PlanJsonVersion
  cycleWeeks: CycleWeek[]       // ordered; the cycle repeats in this sequence
  mileageBands?: MileageBand[]  // optional per-cycle-week mileage targets
}

// ─── Cycle week ───────────────────────────────────────────────────────────────
// One week in the repeating cycle. The length of cycleWeeks is the cycle length.
// "A/B/C/D" is one possible set of ids — the model does not require it.
interface CycleWeek {
  id: string      // unique within this plan: "A", "B", "base", "peak", "cutback", etc.
  label: string   // display label: "Threshold", "Tempo", "Base Build", "Cutback", etc.
  days: DayTemplate[]  // zero-to-seven entries; days not listed are unstructured
}

// ─── Day ──────────────────────────────────────────────────────────────────────
// Zero sessions = rest or unstructured day.
// One session = single-discipline day.
// Two or more = doubles or mixed-discipline day (e.g. run + strength).
interface DayTemplate {
  weekday: Weekday
  sessions: SessionTemplate[]
}

// ─── Session ──────────────────────────────────────────────────────────────────
// One training session within a day.
// sessionType is a free string — not an enum — so user-defined types are valid.
interface SessionTemplate {
  sessionType: string   // "easy" | "recovery" | "long" | "threshold" | "tempo" |
                        // "progression" | "easy+strides" | "strength_push" |
                        // "strength_pull" | "elastic" | "race" | "run_walk" |
                        // "fartlek" | "other" — or any user-defined string
  label: string         // short display name: "Easy aerobic", "Pull strength", "Elastic work"
  prescription: string  // full human-readable prescription
  isRunSession: boolean
  isStrengthSession: boolean
  targetDistanceM?: number
  targetDurationSecs?: number
  targetHrMin?: number
  targetHrMax?: number
  targetPaceMinPerKm?: number   // for sessions with explicit pace targets
  intervals?: IntervalBlock[]   // present on structured interval sessions
}

// ─── Interval block ───────────────────────────────────────────────────────────
// Describes one set of repetitions within a session.
interface IntervalBlock {
  reps: number
  workDurationSecs?: number
  workDistanceM?: number
  recDurationSecs?: number
  recDistanceM?: number
  label?: string          // e.g. "3:00 threshold", "2:00 easy recovery"
  targetHrMin?: number
  targetHrMax?: number
}

// ─── Mileage band ─────────────────────────────────────────────────────────────
interface MileageBand {
  cycleWeekId: string   // matches a CycleWeek.id in the same PlanJson
  minMi: number
  maxMi: number
}

// ─── Weekday ──────────────────────────────────────────────────────────────────
type Weekday =
  | "Monday" | "Tuesday" | "Wednesday" | "Thursday"
  | "Friday" | "Saturday" | "Sunday"
```

### Seed example — current 4-week plan expressed as PlanJson

This is the object that Phase 3 generates from the existing markdown and inserts as the first `training_plan_version` row. It is seed data. A user with a 3-week or 6-week cycle would produce a different `cycleWeeks` array.

```typescript
const seedPlan: PlanJson = {
  version: 1,
  cycleWeeks: [
    {
      id: "A", label: "Threshold",
      days: [
        { weekday: "Monday",    sessions: [{ sessionType: "easy",           label: "Easy aerobic", prescription: "Easy aerobic run + elastic work", isRunSession: true,  isStrengthSession: false }, { sessionType: "elastic", label: "Elastic work", prescription: "Elastic/drills work", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Tuesday",   sessions: [{ sessionType: "recovery",       label: "Recovery run", prescription: "Easy recovery run", isRunSession: true, isStrengthSession: false }, { sessionType: "strength_pull", label: "Pull strength", prescription: "Pull strength session", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Wednesday", sessions: [{ sessionType: "threshold",      label: "Threshold intervals", prescription: "6 × 3:00 threshold, 2:00 easy recovery", isRunSession: true, isStrengthSession: false, intervals: [{ reps: 6, workDurationSecs: 180, recDurationSecs: 120, label: "3:00 threshold / 2:00 easy" }] }] },
        { weekday: "Thursday",  sessions: [{ sessionType: "strength_push",  label: "Push strength", prescription: "Push strength session", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Friday",    sessions: [] },
        { weekday: "Saturday",  sessions: [{ sessionType: "easy+strides",   label: "Easy + strides", prescription: "40–45 min easy + 4–6 × 20 sec strides", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Sunday",    sessions: [{ sessionType: "long",           label: "Long run", prescription: "Long run", isRunSession: true, isStrengthSession: false }] },
      ],
    },
    {
      id: "B", label: "Tempo",
      days: [
        { weekday: "Monday",    sessions: [{ sessionType: "easy", label: "Easy aerobic", prescription: "Easy aerobic run + elastic work", isRunSession: true, isStrengthSession: false }, { sessionType: "elastic", label: "Elastic work", prescription: "Elastic/drills work", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Tuesday",   sessions: [{ sessionType: "recovery", label: "Recovery run", prescription: "Easy recovery run", isRunSession: true, isStrengthSession: false }, { sessionType: "strength_pull", label: "Pull strength", prescription: "Pull strength session", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Wednesday", sessions: [{ sessionType: "tempo", label: "Tempo run", prescription: "10–12 min warm-up + 20 min continuous tempo + 10 min cooldown", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Thursday",  sessions: [{ sessionType: "strength_push", label: "Push strength", prescription: "Push strength session", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Friday",    sessions: [] },
        { weekday: "Saturday",  sessions: [{ sessionType: "progression", label: "Progression run", prescription: "45–50 min progression run", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Sunday",    sessions: [{ sessionType: "long", label: "Long run", prescription: "Long run", isRunSession: true, isStrengthSession: false }] },
      ],
    },
    {
      id: "C", label: "Progression",
      days: [
        { weekday: "Monday",    sessions: [{ sessionType: "easy", label: "Easy aerobic", prescription: "Easy aerobic run + elastic work", isRunSession: true, isStrengthSession: false }, { sessionType: "elastic", label: "Elastic work", prescription: "Elastic/drills work", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Tuesday",   sessions: [{ sessionType: "recovery", label: "Recovery run", prescription: "Easy recovery run", isRunSession: true, isStrengthSession: false }, { sessionType: "strength_pull", label: "Pull strength", prescription: "Pull strength session", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Wednesday", sessions: [{ sessionType: "progression", label: "Progression run", prescription: "45–50 min progression run", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Thursday",  sessions: [{ sessionType: "strength_push", label: "Push strength", prescription: "Push strength session", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Friday",    sessions: [] },
        { weekday: "Saturday",  sessions: [{ sessionType: "easy", label: "Easy aerobic", prescription: "40–45 min easy aerobic", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Sunday",    sessions: [{ sessionType: "long", label: "Long run", prescription: "Long run", isRunSession: true, isStrengthSession: false }] },
      ],
    },
    {
      id: "D", label: "Cutback",
      days: [
        { weekday: "Monday",    sessions: [{ sessionType: "easy", label: "Easy aerobic", prescription: "Easy aerobic run + reduced elastic work (~80%)", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Tuesday",   sessions: [{ sessionType: "strength_pull", label: "Pull strength", prescription: "Pull strength (~80%)", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Wednesday", sessions: [] },
        { weekday: "Thursday",  sessions: [{ sessionType: "strength_push", label: "Push strength", prescription: "Push strength (~80%)", isRunSession: false, isStrengthSession: true }] },
        { weekday: "Friday",    sessions: [] },
        { weekday: "Saturday",  sessions: [{ sessionType: "easy", label: "Easy aerobic", prescription: "Easy aerobic run", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Sunday",    sessions: [{ sessionType: "long", label: "Cutback long run", prescription: "Cutback long run", isRunSession: true, isStrengthSession: false }] },
      ],
    },
  ],
  mileageBands: [
    { cycleWeekId: "A", minMi: 20, maxMi: 22 },
    { cycleWeekId: "B", minMi: 22, maxMi: 24 },
    { cycleWeekId: "C", minMi: 24, maxMi: 26 },
    { cycleWeekId: "D", minMi: 15, maxMi: 17 },
  ],
}
```

---

## Data model — full target schema

### Tables unchanged from current schema

`user`, `account`, `session`, `verificationToken` — Auth.js; must not change.

`training_plan` — retained as-is; markdown `content` column stays for display during migration. `start_week` column remains (legacy seed value used to derive `training_plan_version.cycleStartWeekId` in Phase 3 seed script).

`workout_log` — core columns unchanged. New columns added as nullable (see below).

---

### New and revised tables

**`fit_files`** — immutable raw file record
```
id               text PK
user_id          → user.id CASCADE
sha256           text NOT NULL
file_name        text
file_size_bytes  integer
blob_url         text               -- Vercel Blob URL; null until uploaded
parser_version   text NOT NULL      -- e.g. "fit-file-parser@3.0.2/v1"
created_at       timestamp defaultNow

UNIQUE(user_id, sha256)             -- dedup scoped to user
```

**`athlete_context`** — per-workout subjective context; one-to-one with `workout_log`
```
id               text PK
workout_log_id   → workout_log.id CASCADE
user_id          → user.id CASCADE
feel             text               -- athlete free text about overall feel
rpe              integer            -- 1–10 subjective exertion
outside_temp_c   real               -- athlete-reported; distinct from device temperature
humidity_pct     real
sleep_quality    integer            -- 1–5
travel           boolean
massage          boolean
illness          boolean
nutrition_notes  text
free_text        text               -- unstructured catch-all
created_at       timestamp defaultNow

UNIQUE(workout_log_id)              -- one-to-one enforced at DB level
```

**`pain_observations`** — point-in-time pain record per body location per workout or date
```
id               text PK
user_id          → user.id CASCADE
workout_log_id   → workout_log.id (nullable — can be recorded on a rest day)
observation_date date NOT NULL      -- date of workout or rest day
location         text NOT NULL      -- "left knee", "right hip", "both achilles", etc.
side             text               -- left / right / bilateral / none
level_0_to_10    integer NOT NULL   -- numeric; enables trend queries and threshold logic
character        text               -- ache / sharp / tight / burning / fatigue / other
walking_score    integer            -- 0–10 pain on walking
running_score    integer            -- 0–10 pain on running
gait_change      boolean
onset            text               -- during_warmup / mid_run / post_run / at_rest / other
notes            text
created_at       timestamp defaultNow
```

**`pain_flags`** — persistent carry-across-sessions state; derived/updated from `pain_observations`
```
id               text PK
user_id          → user.id CASCADE
location         text NOT NULL
side             text
level            text NOT NULL      -- green / yellow / orange / red
first_noted_date date NOT NULL
last_noted_date  date NOT NULL
resolved_at      date
notes            text
created_at       timestamp defaultNow
```

**`training_plan_versions`** — versioned structured plan
```
id               text PK
user_id          → user.id CASCADE
version_number   integer NOT NULL
effective_from   date NOT NULL
effective_until  date               -- null = current active version
plan_json        jsonb NOT NULL     -- PlanJson (see interfaces above)
cycle_start_date date NOT NULL      -- the Monday that started cycleWeeks[0]
cycle_start_week_id text NOT NULL   -- which CycleWeek.id was active on cycle_start_date
change_reason    text
change_author    text               -- "athlete" | "system"
prior_version_id text → training_plan_versions.id
created_at       timestamp defaultNow
```

**`planned_workouts`** — one row per day, generated by the scheduling engine from the active plan version
```
id               text PK
user_id          → user.id CASCADE
plan_version_id  → training_plan_versions.id
scheduled_date   date NOT NULL
weekday          text NOT NULL      -- "Monday" | "Tuesday" | etc.
cycle_week_id    text NOT NULL      -- CycleWeek.id ("A", "B", "base", etc.)
sessions_json    jsonb NOT NULL     -- SessionTemplate[] from DayTemplate.sessions
is_rest_day      boolean NOT NULL   -- true when sessions_json is empty
completed        boolean default false
workout_log_ids  jsonb              -- text[] of linked workout_log.id (supports doubles)
adjustment_reason text
adjustment_source text              -- "athlete" | "system"
adjustment_date  timestamp
created_at       timestamp defaultNow
```

**`training_state`** — one row per user, updated deterministically
```
id                      text PK
user_id                 → user.id CASCADE UNIQUE
active_plan_version_id  → training_plan_versions.id
current_block           integer
current_cycle_week_id   text           -- matches CycleWeek.id; NOT a fixed "A"/"B"/"C"/"D"
week_start_date         date
mileage_band_min_mi     real
mileage_band_max_mi     real
long_run_index          integer
threshold_index         integer
lthr_bpm                integer
vo2max_trend            real
missed_workouts_this_week integer default 0
updated_at              timestamp defaultNow
```

**`coaching_analyses`** — full audit trail for every LLM call
```
id                text PK
user_id           → user.id CASCADE
workout_log_id    → workout_log.id (nullable; weekly review has no single log)
analysis_type     text NOT NULL      -- "post_workout" | "weekly_review" | "query"
provider          text NOT NULL      -- "nebius"
model             text NOT NULL
analytics_version text NOT NULL
prompt_text       text NOT NULL
context_snapshot  jsonb NOT NULL     -- exact package sent to LLM
response_raw      text NOT NULL
response_parsed   jsonb
headline          text
decision          text
grade             text
flags             jsonb
follow_up_questions jsonb
created_at        timestamp defaultNow
```

**`jobs`** — background processing queue for Vercel Cron
```
id          text PK
user_id     → user.id CASCADE
type        text NOT NULL      -- "fit_reparse" | "coaching_analysis" | "weekly_review"
payload     jsonb NOT NULL
status      text NOT NULL default 'pending'  -- "pending" | "running" | "done" | "failed"
attempts    integer default 0
last_error  text
created_at  timestamp defaultNow
updated_at  timestamp defaultNow
```

**New nullable columns on `workout_log`** (existing rows unaffected):
```
fit_file_id            → fit_files.id (nullable)
planned_workout_id     → planned_workouts.id (nullable)
planned_workout_type   text       -- prescribed session type
observed_workout_type  text       -- classified at parse time
athlete_timezone       text       -- IANA tz string, captured at upload
```

---

## Phase 1 — Foundation

**Goal:** Clean baseline. No user-visible changes.

**Exit criteria:**
- `npm run lint` → 0 errors, 0 warnings
- `npx tsc --noEmit` → 0 errors
- `npm run test` → all tests pass
- Migration files generated; `drizzle-kit push` no longer used
- Schema contains all Phase 1 tables
- `parseFitBuffer` returns `sha256` and `parserVersion`
- `rotation.ts` tests passing; function marked legacy in JSDoc

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

**Why vitest:** Works with ESM and `bundler` module resolution already in tsconfig without `ts-jest` transforms.

---

#### 1.2 — Switch to drizzle-kit migrations

**File:** `drizzle.config.ts`
```typescript
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  migrations: { table: "__drizzle_migrations", schema: "public" },
} satisfies Config
```

**File:** `package.json` — replace `db:push` with:
```json
"db:generate": "drizzle-kit generate",
"db:migrate":  "drizzle-kit migrate",
"db:studio":   "drizzle-kit studio"
```

**New directory:** `drizzle/migrations/` — generate migration 0001 from existing schema, then migration 0002 for Phase 1 additions.

---

#### 1.3 — Expand schema

**File:** `src/lib/db/schema.ts` — add all new tables above. Existing tables unchanged.

Key constraints to verify:
- `fit_files`: `unique("fit_files_user_sha256").on(t.userId, t.sha256)`
- `athlete_context`: `unique("athlete_context_workout_log_id").on(t.workoutLogId)`
- All FKs on new columns in `workout_log` are nullable

---

#### 1.4 — Fix FIT parser lint errors

**File:** `src/lib/fit/parser.ts`

Define minimal interfaces:
```typescript
interface FitRecord {
  timestamp: string
  heart_rate?: number
  speed?: number
  distance?: number
  [key: string]: unknown
}
interface FitEvent { event: string; event_type: string; timestamp: string }
interface FitLap { records?: FitRecord[]; [key: string]: unknown }
interface FitSession { laps?: FitLap[]; start_time: string; [key: string]: unknown }
interface FitData {
  activity?: {
    sessions?: FitSession[]
    events?: FitEvent[]
    device_infos?: unknown[]
  }
}
```

- Replace all `any` with these types or `unknown`.
- Remove `fileName` parameter (unused).
- Add `sha256` and `parserVersion` to `ParsedWorkout`:
  ```typescript
  const PARSER_VERSION = "fit-file-parser@3.0.2/v1"
  // compute at top of parseFitBuffer:
  import { createHash } from "crypto"
  const sha256 = createHash("sha256").update(buffer).digest("hex")
  ```
- Fix `vo2Max` mapping bug (line 274): `enhanced_avg_respiration_rate` is not VO2max. Use `n(session.vo2_max_data)` only.

---

#### 1.5 — New file: `src/lib/plan/types.ts`

Contains the `PlanJson`, `CycleWeek`, `DayTemplate`, `SessionTemplate`, `IntervalBlock`, `MileageBand`, and `Weekday` types exactly as specified in the interfaces section above. No logic — types only.

---

#### 1.6 — Create data service layer

**New directory:** `src/lib/services/`

Stub files with typed signatures. Implementations begin in Phase 2.

**`workout.service.ts`** — `getWorkoutById`, `getRecentWorkouts`, `createWorkout`, `getComparableWorkouts`
**`plan.service.ts`** — `getActivePlan`, `getActivePlanVersion`, `savePlanMarkdown`
**`trainingState.service.ts`** — `getTrainingState`, `updateTrainingState`

Dashboard and workout detail pages migrate to use these services (lift-and-shift of existing inline queries).

---

#### 1.7 — Add Zod schemas for existing server actions

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
  // startWeek remains a free string here — the legacy onboarding form
  // accepts any value; Phase 3 seed script reads it to set cycle_start_week_id
  startWeek: z.string().min(1).max(50),
})
```

---

#### 1.8 — Mark rotation.ts as legacy; add timezone-aware variant

**File:** `src/lib/rotation.ts`

Add JSDoc to module and each exported function:
```typescript
/**
 * @legacy Seed/adapter logic for the markdown-based training plan.
 * The canonical scheduling engine (Phase 3) reads plan_json from
 * training_plan_versions and does not call these functions.
 * This file is preserved for compatibility until all callers are migrated.
 */
```

Add timezone-aware `getTodayInfo` overload (non-breaking — existing callers unchanged):
```typescript
export function getTodayInfo(anchorDate: Date, anchorWeek: RotationWeek, tz?: string) {
  const today = tz ? getLocalDate(tz) : new Date()
  // ... rest unchanged
}

function getLocalDate(tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === "year")!.value
  const m = parts.find(p => p.type === "month")!.value
  const d = parts.find(p => p.type === "day")!.value
  return new Date(`${y}-${m}-${d}T00:00:00`)
}
```

---

#### 1.9 — Unit tests

**`src/lib/rotation.test.ts`**
- `getRotationWeek` across week boundaries, negative offsets, all four starting weeks
- `extractWorkout` with various markdown structures; missing week; missing day
- `getTodayInfo` with a known timezone (assert day name is correct)

**`src/lib/fmt.test.ts`**
- Each formatter with null, zero, and typical values
- `fmtPace` edge cases (zero speed, very fast, very slow)

---

#### 1.10 — Update `.env.example`

```
# Vercel Blob — immutable raw FIT file storage
BLOB_READ_WRITE_TOKEN=""

# Nebius AI — coaching analysis (OpenAI-compatible endpoint)
NEBIUS_API_KEY=""
NEBIUS_BASE_URL="https://api.studio.nebius.ai/v1/"
NEBIUS_MODEL="meta-llama/Meta-Llama-3.1-70B-Instruct"

# Analytics versioning — increment when deterministic metric logic changes
ANALYTICS_VERSION="1"
```

---

### Phase 1 — Dependency changes

```
npm install zod
npm install --save-dev vitest @vitejs/plugin-react
```

No new runtime dependencies in Phase 1. Blob and openai are Phase 2 and Phase 6 respectively.

---

## Phase 2 — FIT ingestion v2 (preview)

- `src/app/log/page.tsx` — add athlete context form fields (outside temp, sleep, travel, humidity, illness, nutrition notes); add pain observation fields (location, level, character, onset) repeatable per body part
- `src/app/log/actions.ts` — store raw bytes to Vercel Blob; compute SHA-256; check `UNIQUE(user_id, sha256)`; insert `fit_files`; insert `athlete_context` (UNIQUE on workout_log_id enforced); insert `pain_observations` rows (one per body part reported); link `workout_log.fit_file_id`
- `src/lib/fit/parser.ts` — add ZIP extraction (Node `zlib` or `unzipper`); single FIT inside ZIP only for MVP
- `next.config.ts` — add `@vercel/blob` to `serverExternalPackages` if needed

---

## Phase 3 — Structured plan + scheduling engine (preview)

**Goal:** The app generates planned workouts from `plan_json`, not from `rotation.ts` or markdown. After this phase, `training_state` can operate against real structured data.

- **`src/lib/plan/types.ts`** — already created in Phase 1
- **`src/lib/plan/scheduler.ts`** — `generatePlannedWorkouts(planVersion, fromDate, days)`:
  - Reads `plan_json.cycleWeeks` array
  - Computes which cycle week falls on each calendar date using `cycle_start_date` and `cycle_start_week_id`
  - Looks up the `DayTemplate` for each weekday
  - Inserts rows into `planned_workouts`
  - No reference to `rotation.ts`
- **`src/lib/plan/seed.ts`** — one-time migration script:
  - Reads existing `training_plan` rows
  - Constructs a `PlanJson` from the seed template (using `start_week` as `cycle_start_week_id`)
  - Inserts the first `training_plan_version`
  - Runs `generatePlannedWorkouts` for the next 90 days
- **`src/lib/services/plan.service.ts`** — add `getActivePlanVersion`, `getTodaysPlannedWorkouts`, `getPlannedWorkoutsRange`
- **`src/app/dashboard/page.tsx`** — replace `extractWorkout()` + `rotation.ts` calls with `getPlannedWorkoutsRange(userId, today, 7)` from service
- **`src/app/plan/[week]/[day]/page.tsx`** — retire this route; replace with `/plan/[date]` (keyed by calendar date, reads from `planned_workouts`)
- **`src/lib/rotation.ts`** — callers removed; file retained but JSDoc updated to "all callers migrated, safe to remove in next cleanup"

---

## Architecture decisions

### FIT parser: TypeScript-only
Parses a typical run in < 500ms. `serverExternalPackages` handles CommonJS correctly. No worker needed at this scale.

### Vercel Blob over S3
Zero-config on Vercel, one env var, `blob_url` column is provider-agnostic. Swap the upload call if needed.

### Nebius via OpenAI-compatible SDK
`openai` npm package, `baseURL` = Nebius endpoint. Identical usage pattern to standard OpenAI.

### Zod everywhere
All server actions validate FormData before DB writes. All Nebius JSON responses validated before persistence. `PlanJson` is validated when loaded from the DB.

### Services layer
Pages and actions call `src/lib/services/*.service.ts`. Services call `db` directly. No extra repository abstraction.

### `rotation.ts` lifecycle
- Phase 1: tested, marked legacy, timezone fix added
- Phase 3: callers migrated to scheduling engine
- Phase 3 cleanup: file deleted

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Migration on live Neon DB | Generate SQL, review, apply in transaction; Neon point-in-time snapshot before applying |
| `training_plan.content` markdown vs `plan_json` diverge | Keep both indefinitely for display; scheduling engine reads only `plan_json` |
| Existing `workout_log` rows have null `fit_file_id` | All new FK columns nullable; existing rows unaffected; no backfill |
| Vercel Blob not available in dev | Guard on `BLOB_READ_WRITE_TOKEN`; skip blob upload, still write parse results to DB |
| Timezone bug in existing dashboard | Phase 1 adds opt-in fix; callers pass `athlete_timezone` once captured in Phase 2 |
| `pain_observations` — multiple rows per workout | Expected and correct; queries filter by `workout_log_id` or `observation_date` |
| Phase 3 replaces `/plan/[week]/[day]` route | Keep old route as redirect to new `/plan/[date]` until all links updated |
