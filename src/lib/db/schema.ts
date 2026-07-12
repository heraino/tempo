import {
  pgTable, text, timestamp, integer, primaryKey,
  real, jsonb, date,
} from "drizzle-orm/pg-core"
import type { AdapterAccountType } from "next-auth/adapters"

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

// ─── Training plan ────────────────────────────────────────────────────────────
// Stores the uploaded .md plan and the anchor information needed to calculate
// which week of the A/B/C/D rotation the user is on for any given date.

export const trainingPlans = pgTable("training_plan", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  content: text("content").notNull(),      // full markdown text
  startDate: date("start_date").notNull(), // Monday of the first week in the cycle
  startWeek: text("start_week").notNull(), // which rotation week that Monday was: A/B/C/D
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Workout log ──────────────────────────────────────────────────────────────
// One row per uploaded FIT file. All session-level fields are stored as typed
// columns for easy querying. Laps and per-second records are stored as JSONB
// so no detail is lost for future analysis.

export const workoutLogs = pgTable("workout_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fitFileName: text("fit_file_name"),

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
  hrDriftBpm: real("hr_drift_bpm"), // positive = HR rose over the run

  // ── Derived: run-walk splits (computed from event/record data) ──
  runOnlyDistanceM: real("run_only_distance_m"),
  runOnlyDurationSecs: real("run_only_duration_secs"),
  runOnlyAvgSpeedMps: real("run_only_avg_speed_mps"),
  runOnlyAvgHr: integer("run_only_avg_hr"),
  walkDurationSecs: real("walk_duration_secs"),

  // ── Raw JSON payloads (full fidelity, used for future deep analysis) ──
  laps: jsonb("laps"),        // LapMessage[] — lap-by-lap breakdown
  records: jsonb("records"),  // RecordMessage[] — per-second GPS/HR/pace/cadence
  events: jsonb("events"),    // EventMessage[] — start/stop/pause/lap triggers
  deviceInfo: jsonb("device_info"), // device model, firmware

  // ── User annotations ──
  notes: text("notes"),
  perceivedEffort: integer("perceived_effort"), // 1–5

  createdAt: timestamp("created_at").defaultNow(),
})
