import {
  pgTable, text, timestamp, integer, primaryKey,
  real, jsonb, date, boolean, unique,
} from "drizzle-orm/pg-core"
import type { AdapterAccountType } from "next-auth/adapters"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

// ─── Auth.js tables (required) ───────────────────────────────────────────────

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
})

export const accounts = pgTable(
  "account",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })]
)

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
)

// ─── FIT files ────────────────────────────────────────────────────────────────
// Immutable raw FIT file storage. UNIQUE(user_id, sha256) prevents duplicate
// uploads of the same activity from the same athlete.

// parseStatus lifecycle:
//   pending  — blob stored, not yet parsed
//   parsed   — parsed + workout_log persisted
//   failed   — parser threw; parseError holds the message
//   workout_save_failed — parsed ok but workout_log insert failed; reprocessable
export const fitFiles = pgTable(
  "fit_file",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sha256: text("sha256").notNull(),
    fileName: text("file_name"),
    fileSizeBytes: integer("file_size_bytes"),
    blobUrl: text("blob_url"),
    parserVersion: text("parser_version").notNull(),
    parseStatus: text("parse_status").notNull().default("pending"),
    parseError: text("parse_error"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [unique().on(t.userId, t.sha256)]
)

// ─── Workout log ──────────────────────────────────────────────────────────────
// One row per uploaded FIT file. All session-level fields are stored as typed
// columns for easy querying. Laps and per-second records are stored as JSONB
// so no detail is lost for future analysis.

export const workoutLogs = pgTable("workout_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fitFileName: text("fit_file_name"),

  // ── Phase 1: nullable FK to fit_files (populated from Phase 2 onward) ──
  fitFileId: text("fit_file_id").references(() => fitFiles.id, { onDelete: "set null" }),

  // ── Observed session kind (populated by analytics engine, Phase 4+) ──
  observedSessionKind: text("observed_session_kind"),

  // ── Athlete local timezone (IANA tz name, e.g. "America/New_York") ──
  athleteTimezone: text("athlete_timezone"),

  // ── Timing ──
  startTime: timestamp("start_time").notNull(),
  totalElapsedSecs: real("total_elapsed_secs"),
  totalTimerSecs: real("total_timer_secs"),

  // ── Sport ──
  sport: text("sport"),
  subSport: text("sub_sport"),

  // ── Distance ──
  totalDistanceM: real("total_distance_m"),

  // ── Heart rate ──
  avgHr: integer("avg_hr"),
  maxHr: integer("max_hr"),

  // ── Speed (m/s — convert to pace in the UI) ──
  avgSpeedMps: real("avg_speed_mps"),
  maxSpeedMps: real("max_speed_mps"),

  // ── Cadence (steps per minute) ──
  avgCadence: integer("avg_cadence"),
  maxCadence: integer("max_cadence"),

  // ── Elevation ──
  totalAscentM: real("total_ascent_m"),
  totalDescentM: real("total_descent_m"),
  avgAltitudeM: real("avg_altitude_m"),
  maxAltitudeM: real("max_altitude_m"),
  minAltitudeM: real("min_altitude_m"),

  // ── Calories ──
  totalCalories: integer("total_calories"),

  // ── Temperature ──
  avgTemperatureC: real("avg_temperature_c"),
  maxTemperatureC: real("max_temperature_c"),

  // ── Running dynamics (Garmin-specific) ──
  avgVerticalOscillationMm: real("avg_vertical_oscillation_mm"),
  avgStanceTimeMs: real("avg_stance_time_ms"),
  avgStanceTimePct: real("avg_stance_time_pct"),
  avgVerticalRatio: real("avg_vertical_ratio"),
  avgStrideLengthM: real("avg_stride_length_m"),

  // ── Training load / effect ──
  trainingLoad: real("training_load"),
  aerobicTrainingEffect: real("aerobic_training_effect"),
  anaerobicTrainingEffect: real("anaerobic_training_effect"),
  aerobicTeMessage: text("aerobic_te_message"),
  anaerobicTeMessage: text("anaerobic_te_message"),

  // ── Physiology (newer Garmin devices) ──
  avgRespirationRate: real("avg_respiration_rate"),
  maxRespirationRate: real("max_respiration_rate"),
  vo2Max: real("vo2_max"),

  // ── GPS bounding box ──
  necLat: real("nec_lat"),
  necLong: real("nec_long"),
  swcLat: real("swc_lat"),
  swcLong: real("swc_long"),

  // ── Derived: HR analysis (computed at upload time from record data) ──
  firstHalfAvgHr: integer("first_half_avg_hr"),
  secondHalfAvgHr: integer("second_half_avg_hr"),
  hrDriftBpm: real("hr_drift_bpm"),

  // ── Derived: run-walk splits (computed from event/record data) ──
  runOnlyDistanceM: real("run_only_distance_m"),
  runOnlyDurationSecs: real("run_only_duration_secs"),
  runOnlyAvgSpeedMps: real("run_only_avg_speed_mps"),
  runOnlyAvgHr: integer("run_only_avg_hr"),
  walkDurationSecs: real("walk_duration_secs"),

  // ── Raw JSON payloads (full fidelity, used for future deep analysis) ──
  laps: jsonb("laps"),
  records: jsonb("records"),
  events: jsonb("events"),
  deviceInfo: jsonb("device_info"),

  // ── User annotations ──
  notes: text("notes"),
  perceivedEffort: integer("perceived_effort"),

  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Training plan ────────────────────────────────────────────────────────────
// Stores the uploaded .md plan and the anchor information needed for legacy
// rotation-based display. Retained for backward compatibility; plan_json
// (structured schedule) lives in training_plan_versions.

export const trainingPlans = pgTable("training_plan", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  content: text("content").notNull(),
  startDate: date("start_date").notNull(),
  startWeek: text("start_week").notNull(),
  // IANA timezone name (e.g. "America/Los_Angeles"). Used to resolve the
  // athlete's local calendar date so "today" is correct across timezones.
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Training plan versions ───────────────────────────────────────────────────
// Versioned structured plan. plan_json follows the PlanJson schema in
// src/lib/plan/types.ts. Never silently change a structural training plan —
// always insert a new version row.

export const trainingPlanVersions = pgTable("training_plan_version", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  effectiveFrom: date("effective_from"),
  effectiveUntil: date("effective_until"),
  planJson: jsonb("plan_json").notNull(),
  cycleStartDate: date("cycle_start_date").notNull(),
  cycleStartWeekId: text("cycle_start_week_id").notNull(),
  changeReason: text("change_reason"),
  changeAuthor: text("change_author"),
  // Self-referential FK — lazy reference required by Drizzle
  priorVersionId: text("prior_version_id").references(
    (): AnyPgColumn => trainingPlanVersions.id,
    { onDelete: "set null" }
  ),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Planned workout days ─────────────────────────────────────────────────────
// One row per calendar date that has been scheduled from a plan version.
// UNIQUE(user_id, scheduled_date, plan_version_id) prevents double-scheduling.

export const plannedWorkoutDays = pgTable(
  "planned_workout_day",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    planVersionId: text("plan_version_id").notNull().references(() => trainingPlanVersions.id, { onDelete: "cascade" }),
    scheduledDate: date("scheduled_date").notNull(),
    weekday: text("weekday").notNull(),
    cycleWeekId: text("cycle_week_id").notNull(),
    isRestDay: boolean("is_rest_day").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [unique().on(t.userId, t.scheduledDate, t.planVersionId)]
)

// ─── Planned sessions ─────────────────────────────────────────────────────────
// One row per session within a planned day. Each session tracks its own status
// independently (a double-day can have one completed and one skipped).

export const plannedSessions = pgTable("planned_session", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  plannedDayId: text("planned_day_id").notNull().references(() => plannedWorkoutDays.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planVersionId: text("plan_version_id").references(() => trainingPlanVersions.id, { onDelete: "set null" }),
  sessionKind: text("session_kind").notNull(),
  customType: text("custom_type"),
  label: text("label").notNull(),
  prescription: text("prescription").notNull(),
  isRunSession: boolean("is_run_session").notNull(),
  isStrengthSession: boolean("is_strength_session").notNull(),
  sequenceInDay: integer("sequence_in_day").notNull(),
  targetDistanceM: real("target_distance_m"),
  targetDurationSecs: real("target_duration_secs"),
  targetHrMin: integer("target_hr_min"),
  targetHrMax: integer("target_hr_max"),
  targetPaceMinPerKm: real("target_pace_min_per_km"),
  intervalsJson: jsonb("intervals_json"),
  status: text("status").notNull().default("planned"),
  adjustmentReason: text("adjustment_reason"),
  adjustmentSource: text("adjustment_source"),
  // Self-referential FK for rescheduled sessions
  rescheduledFromId: text("rescheduled_from_id").references(
    (): AnyPgColumn => plannedSessions.id,
    { onDelete: "set null" }
  ),
  originalPrescription: text("original_prescription"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// ─── Session completions ──────────────────────────────────────────────────────
// Explicit link from a planned session to its completion. workout_log_id is
// nullable so non-FIT activities (strength, cross-training) can be marked done.
// UNIQUE(planned_session_id) enforces one completion per planned session.

export const sessionCompletions = pgTable(
  "session_completion",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    plannedSessionId: text("planned_session_id").notNull().references(() => plannedSessions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workoutLogId: text("workout_log_id").references(() => workoutLogs.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [unique().on(t.plannedSessionId)]
)

// ─── Athlete context ──────────────────────────────────────────────────────────
// Subjective workout context (how the athlete felt, conditions, lifestyle
// factors). One-to-one with workout_log enforced by UNIQUE(workout_log_id).

export const athleteContexts = pgTable(
  "athlete_context",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workoutLogId: text("workout_log_id").notNull().references(() => workoutLogs.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    feel: text("feel"),
    rpe: integer("rpe"),
    outsideTempC: real("outside_temp_c"),
    humidityPct: real("humidity_pct"),
    sleepQuality: integer("sleep_quality"),
    travel: boolean("travel"),
    massage: boolean("massage"),
    illness: boolean("illness"),
    nutritionNotes: text("nutrition_notes"),
    freeText: text("free_text"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [unique().on(t.workoutLogId)]
)

// ─── Pain observations ────────────────────────────────────────────────────────
// Event-level observations: one row per body location per workout. This model
// supports queries like "does left knee pain recur after threshold sessions?"
// workout_log_id is nullable so pain can be logged without an associated FIT.

export const painObservations = pgTable("pain_observation", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workoutLogId: text("workout_log_id").references(() => workoutLogs.id, { onDelete: "set null" }),
  observationDate: date("observation_date").notNull(),
  location: text("location").notNull(),
  side: text("side"),
  level0to10: integer("level_0_to_10").notNull(),
  character: text("character"),
  walkingScore: integer("walking_score"),
  runningScore: integer("running_score"),
  gaitChange: boolean("gait_change"),
  onset: text("onset"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Pain flags ───────────────────────────────────────────────────────────────
// Persistent longitudinal state across sessions. Updated (not replaced) when
// pain is re-observed. resolved_at is set when the flag is cleared.

export const painFlags = pgTable("pain_flag", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  location: text("location").notNull(),
  side: text("side"),
  level: text("level").notNull(),
  firstNotedDate: date("first_noted_date").notNull(),
  lastNotedDate: date("last_noted_date").notNull(),
  resolvedAt: timestamp("resolved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Training state ───────────────────────────────────────────────────────────
// One row per user. current_cycle_week_id is a generic string (e.g. "A", "base",
// "peak") — never hard-coded as an ABCD union. UNIQUE(user_id) enforced.

export const trainingStates = pgTable(
  "training_state",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    activePlanVersionId: text("active_plan_version_id").references(() => trainingPlanVersions.id, { onDelete: "set null" }),
    currentBlock: text("current_block"),
    currentCycleWeekId: text("current_cycle_week_id"),
    weekStartDate: date("week_start_date"),
    mileageBandMinMi: real("mileage_band_min_mi"),
    mileageBandMaxMi: real("mileage_band_max_mi"),
    longRunIndex: integer("long_run_index"),
    thresholdIndex: integer("threshold_index"),
    lthrBpm: integer("lthr_bpm"),
    vo2maxTrend: real("vo2max_trend"),
    missedWorkoutsThisWeek: integer("missed_workouts_this_week").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique().on(t.userId)]
)

// ─── Coaching analyses ────────────────────────────────────────────────────────
// Each row is one LLM coaching response. The canonical pattern is:
// DATA → COACH INTERPRETATION → DECISION.
// Nebius interprets supplied evidence; it never calculates canonical metrics.

export const coachingAnalyses = pgTable("coaching_analysis", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workoutLogId: text("workout_log_id").references(() => workoutLogs.id, { onDelete: "set null" }),
  analysisType: text("analysis_type"),
  provider: text("provider"),
  model: text("model"),
  analyticsVersion: text("analytics_version"),
  promptText: text("prompt_text"),
  contextSnapshot: jsonb("context_snapshot"),
  responseRaw: text("response_raw"),
  responseParsed: jsonb("response_parsed"),
  headline: text("headline"),
  decision: text("decision"),
  grade: text("grade"),
  flags: jsonb("flags"),
  followUpQuestions: jsonb("follow_up_questions"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Jobs ─────────────────────────────────────────────────────────────────────
// Background processing queue backed by the database. Used for async FIT
// parsing, coaching analysis, schedule generation, and similar tasks.

export const jobs = pgTable("job", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})
