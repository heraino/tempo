-- ─── Neon Safe Additions — Phase 1 ───────────────────────────────────────────
--
-- This file contains ONLY the new tables and columns added in Phase 1.
-- It is safe to run on the existing Neon database without any data loss.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- Apply path for EXISTING Neon databases:
--   1. Run this file in the Neon SQL console or via psql.
--   2. Mark migration 0000_abnormal_pride as already applied so drizzle-kit
--      migrate skips it on future runs:
--        INSERT INTO public.__drizzle_migrations (id, hash, created_at)
--        SELECT
--          gen_random_uuid()::text,
--          '0000_abnormal_pride',
--          extract(epoch from now()) * 1000
--        WHERE NOT EXISTS (
--          SELECT 1 FROM public.__drizzle_migrations
--          WHERE hash = '0000_abnormal_pride'
--        );
--      (Adjust schema and table name if your Neon project differs.)
--
-- Apply path for NEW databases:
--   Run: npm run db:migrate
--   This applies migration 0000 from scratch, creating all tables.
--
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. fit_file must be created before workout_log references it
CREATE TABLE IF NOT EXISTS "fit_file" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "sha256" text NOT NULL,
    "file_name" text,
    "file_size_bytes" integer,
    "blob_url" text,
    "parser_version" text NOT NULL,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "fit_file_user_id_sha256_unique" UNIQUE("user_id", "sha256")
);

ALTER TABLE "fit_file"
    ADD CONSTRAINT IF NOT EXISTS "fit_file_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- 2. New nullable columns on existing workout_log
ALTER TABLE "workout_log"
    ADD COLUMN IF NOT EXISTS "fit_file_id" text,
    ADD COLUMN IF NOT EXISTS "observed_session_kind" text,
    ADD COLUMN IF NOT EXISTS "athlete_timezone" text;

-- FK for fit_file_id (add separately in case it already exists)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'workout_log_fit_file_id_fit_file_id_fk'
    ) THEN
        ALTER TABLE "workout_log"
            ADD CONSTRAINT "workout_log_fit_file_id_fit_file_id_fk"
            FOREIGN KEY ("fit_file_id") REFERENCES "public"."fit_file"("id") ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Remaining Phase 1 tables

CREATE TABLE IF NOT EXISTS "training_plan_version" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "version_number" integer NOT NULL,
    "effective_from" date,
    "effective_until" date,
    "plan_json" jsonb NOT NULL,
    "cycle_start_date" date NOT NULL,
    "cycle_start_week_id" text NOT NULL,
    "change_reason" text,
    "change_author" text,
    "prior_version_id" text,
    "created_at" timestamp DEFAULT now()
);

ALTER TABLE "training_plan_version"
    ADD CONSTRAINT IF NOT EXISTS "training_plan_version_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'training_plan_version_prior_version_id_training_plan_version_id_fk'
    ) THEN
        ALTER TABLE "training_plan_version"
            ADD CONSTRAINT "training_plan_version_prior_version_id_training_plan_version_id_fk"
            FOREIGN KEY ("prior_version_id") REFERENCES "public"."training_plan_version"("id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "planned_workout_day" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "plan_version_id" text NOT NULL,
    "scheduled_date" date NOT NULL,
    "weekday" text NOT NULL,
    "cycle_week_id" text NOT NULL,
    "is_rest_day" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "planned_workout_day_user_id_scheduled_date_plan_version_id_unique"
        UNIQUE("user_id", "scheduled_date", "plan_version_id")
);

ALTER TABLE "planned_workout_day"
    ADD CONSTRAINT IF NOT EXISTS "planned_workout_day_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

ALTER TABLE "planned_workout_day"
    ADD CONSTRAINT IF NOT EXISTS "planned_workout_day_plan_version_id_training_plan_version_id_fk"
    FOREIGN KEY ("plan_version_id") REFERENCES "public"."training_plan_version"("id") ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS "planned_session" (
    "id" text PRIMARY KEY NOT NULL,
    "planned_day_id" text NOT NULL,
    "user_id" text NOT NULL,
    "plan_version_id" text,
    "session_kind" text NOT NULL,
    "custom_type" text,
    "label" text NOT NULL,
    "prescription" text NOT NULL,
    "is_run_session" boolean NOT NULL,
    "is_strength_session" boolean NOT NULL,
    "sequence_in_day" integer NOT NULL,
    "target_distance_m" real,
    "target_duration_secs" real,
    "target_hr_min" integer,
    "target_hr_max" integer,
    "target_pace_min_per_km" real,
    "intervals_json" jsonb,
    "status" text DEFAULT 'planned' NOT NULL,
    "adjustment_reason" text,
    "adjustment_source" text,
    "rescheduled_from_id" text,
    "original_prescription" text,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

ALTER TABLE "planned_session"
    ADD CONSTRAINT IF NOT EXISTS "planned_session_planned_day_id_planned_workout_day_id_fk"
    FOREIGN KEY ("planned_day_id") REFERENCES "public"."planned_workout_day"("id") ON DELETE CASCADE;

ALTER TABLE "planned_session"
    ADD CONSTRAINT IF NOT EXISTS "planned_session_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

ALTER TABLE "planned_session"
    ADD CONSTRAINT IF NOT EXISTS "planned_session_plan_version_id_training_plan_version_id_fk"
    FOREIGN KEY ("plan_version_id") REFERENCES "public"."training_plan_version"("id") ON DELETE SET NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'planned_session_rescheduled_from_id_planned_session_id_fk'
    ) THEN
        ALTER TABLE "planned_session"
            ADD CONSTRAINT "planned_session_rescheduled_from_id_planned_session_id_fk"
            FOREIGN KEY ("rescheduled_from_id") REFERENCES "public"."planned_session"("id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "session_completion" (
    "id" text PRIMARY KEY NOT NULL,
    "planned_session_id" text NOT NULL,
    "user_id" text NOT NULL,
    "workout_log_id" text,
    "completed_at" timestamp NOT NULL,
    "notes" text,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "session_completion_planned_session_id_unique" UNIQUE("planned_session_id")
);

ALTER TABLE "session_completion"
    ADD CONSTRAINT IF NOT EXISTS "session_completion_planned_session_id_planned_session_id_fk"
    FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_session"("id") ON DELETE CASCADE;

ALTER TABLE "session_completion"
    ADD CONSTRAINT IF NOT EXISTS "session_completion_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

ALTER TABLE "session_completion"
    ADD CONSTRAINT IF NOT EXISTS "session_completion_workout_log_id_workout_log_id_fk"
    FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_log"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "athlete_context" (
    "id" text PRIMARY KEY NOT NULL,
    "workout_log_id" text NOT NULL,
    "user_id" text NOT NULL,
    "feel" text,
    "rpe" integer,
    "outside_temp_c" real,
    "humidity_pct" real,
    "sleep_quality" integer,
    "travel" boolean,
    "massage" boolean,
    "illness" boolean,
    "nutrition_notes" text,
    "free_text" text,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "athlete_context_workout_log_id_unique" UNIQUE("workout_log_id")
);

ALTER TABLE "athlete_context"
    ADD CONSTRAINT IF NOT EXISTS "athlete_context_workout_log_id_workout_log_id_fk"
    FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_log"("id") ON DELETE CASCADE;

ALTER TABLE "athlete_context"
    ADD CONSTRAINT IF NOT EXISTS "athlete_context_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS "pain_observation" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "workout_log_id" text,
    "observation_date" date NOT NULL,
    "location" text NOT NULL,
    "side" text,
    "level_0_to_10" integer NOT NULL,
    "character" text,
    "walking_score" integer,
    "running_score" integer,
    "gait_change" boolean,
    "onset" text,
    "notes" text,
    "created_at" timestamp DEFAULT now()
);

ALTER TABLE "pain_observation"
    ADD CONSTRAINT IF NOT EXISTS "pain_observation_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

ALTER TABLE "pain_observation"
    ADD CONSTRAINT IF NOT EXISTS "pain_observation_workout_log_id_workout_log_id_fk"
    FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_log"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "pain_flag" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "location" text NOT NULL,
    "side" text,
    "level" text NOT NULL,
    "first_noted_date" date NOT NULL,
    "last_noted_date" date NOT NULL,
    "resolved_at" timestamp,
    "notes" text,
    "created_at" timestamp DEFAULT now()
);

ALTER TABLE "pain_flag"
    ADD CONSTRAINT IF NOT EXISTS "pain_flag_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS "training_state" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "active_plan_version_id" text,
    "current_block" text,
    "current_cycle_week_id" text,
    "week_start_date" date,
    "mileage_band_min_mi" real,
    "mileage_band_max_mi" real,
    "long_run_index" integer,
    "threshold_index" integer,
    "lthr_bpm" integer,
    "vo2max_trend" real,
    "missed_workouts_this_week" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "training_state_user_id_unique" UNIQUE("user_id")
);

ALTER TABLE "training_state"
    ADD CONSTRAINT IF NOT EXISTS "training_state_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

ALTER TABLE "training_state"
    ADD CONSTRAINT IF NOT EXISTS "training_state_active_plan_version_id_training_plan_version_id_fk"
    FOREIGN KEY ("active_plan_version_id") REFERENCES "public"."training_plan_version"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "coaching_analysis" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "workout_log_id" text,
    "analysis_type" text,
    "provider" text,
    "model" text,
    "analytics_version" text,
    "prompt_text" text,
    "context_snapshot" jsonb,
    "response_raw" text,
    "response_parsed" jsonb,
    "headline" text,
    "decision" text,
    "grade" text,
    "flags" jsonb,
    "follow_up_questions" jsonb,
    "created_at" timestamp DEFAULT now()
);

ALTER TABLE "coaching_analysis"
    ADD CONSTRAINT IF NOT EXISTS "coaching_analysis_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

ALTER TABLE "coaching_analysis"
    ADD CONSTRAINT IF NOT EXISTS "coaching_analysis_workout_log_id_workout_log_id_fk"
    FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_log"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "job" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text,
    "type" text NOT NULL,
    "payload" jsonb,
    "status" text DEFAULT 'pending' NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" text,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

ALTER TABLE "job"
    ADD CONSTRAINT IF NOT EXISTS "job_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- 0005: Daily wellness (HRV, sleep, steps, body battery, stress)
CREATE TABLE IF NOT EXISTS "daily_wellness" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "calendar_date" date NOT NULL,
  "source" text NOT NULL DEFAULT 'garmin',
  "total_steps" integer,
  "total_distance_meters" real,
  "active_calories" integer,
  "total_calories" integer,
  "avg_stress_level" integer,
  "max_stress_level" integer,
  "body_battery_high" integer,
  "body_battery_low" integer,
  "body_battery_latest" integer,
  "resting_hr" integer,
  "avg_waking_hr" integer,
  "min_hr" integer,
  "max_hr" integer,
  "hrv_last_night_avg" real,
  "hrv_5min_high" real,
  "hrv_weekly_avg" real,
  "hrv_status" text,
  "sleep_duration_secs" integer,
  "sleep_deep_secs" integer,
  "sleep_light_secs" integer,
  "sleep_rem_secs" integer,
  "sleep_score" integer,
  "sleep_window_start" timestamp,
  "sleep_window_end" timestamp,
  "avg_spo2" real,
  "avg_respiration" real,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "daily_wellness_user_id_calendar_date_unique" UNIQUE("user_id", "calendar_date")
);

ALTER TABLE "daily_wellness"
    ADD CONSTRAINT IF NOT EXISTS "daily_wellness_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;
