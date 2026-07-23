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
  ADD CONSTRAINT "daily_wellness_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;
