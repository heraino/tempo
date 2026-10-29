CREATE TABLE IF NOT EXISTS "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fit_file" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sha256" text NOT NULL,
	"file_name" text,
	"file_size_bytes" integer,
	"blob_url" text,
	"parser_version" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "fit_file_user_id_sha256_unique" UNIQUE("user_id","sha256")
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planned_workout_day" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_version_id" text NOT NULL,
	"scheduled_date" date NOT NULL,
	"weekday" text NOT NULL,
	"cycle_week_id" text NOT NULL,
	"is_rest_day" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "planned_workout_day_user_id_scheduled_date_plan_version_id_unique" UNIQUE("user_id","scheduled_date","plan_version_id")
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"start_date" date NOT NULL,
	"start_week" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workout_log" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"fit_file_name" text,
	"fit_file_id" text,
	"observed_session_kind" text,
	"athlete_timezone" text,
	"start_time" timestamp NOT NULL,
	"total_elapsed_secs" real,
	"total_timer_secs" real,
	"sport" text,
	"sub_sport" text,
	"total_distance_m" real,
	"avg_hr" integer,
	"max_hr" integer,
	"avg_speed_mps" real,
	"max_speed_mps" real,
	"avg_cadence" integer,
	"max_cadence" integer,
	"total_ascent_m" real,
	"total_descent_m" real,
	"avg_altitude_m" real,
	"max_altitude_m" real,
	"min_altitude_m" real,
	"total_calories" integer,
	"avg_temperature_c" real,
	"max_temperature_c" real,
	"avg_vertical_oscillation_mm" real,
	"avg_stance_time_ms" real,
	"avg_stance_time_pct" real,
	"avg_vertical_ratio" real,
	"avg_stride_length_m" real,
	"training_load" real,
	"aerobic_training_effect" real,
	"anaerobic_training_effect" real,
	"aerobic_te_message" text,
	"anaerobic_te_message" text,
	"avg_respiration_rate" real,
	"max_respiration_rate" real,
	"vo2_max" real,
	"nec_lat" real,
	"nec_long" real,
	"swc_lat" real,
	"swc_long" real,
	"first_half_avg_hr" integer,
	"second_half_avg_hr" integer,
	"hr_drift_bpm" real,
	"run_only_distance_m" real,
	"run_only_duration_secs" real,
	"run_only_avg_speed_mps" real,
	"run_only_avg_hr" integer,
	"walk_duration_secs" real,
	"laps" jsonb,
	"records" jsonb,
	"events" jsonb,
	"device_info" jsonb,
	"notes" text,
	"perceived_effort" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "athlete_context" ADD CONSTRAINT "athlete_context_workout_log_id_workout_log_id_fk" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_log"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "athlete_context" ADD CONSTRAINT "athlete_context_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coaching_analysis" ADD CONSTRAINT "coaching_analysis_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coaching_analysis" ADD CONSTRAINT "coaching_analysis_workout_log_id_workout_log_id_fk" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_log"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fit_file" ADD CONSTRAINT "fit_file_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job" ADD CONSTRAINT "job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pain_flag" ADD CONSTRAINT "pain_flag_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pain_observation" ADD CONSTRAINT "pain_observation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pain_observation" ADD CONSTRAINT "pain_observation_workout_log_id_workout_log_id_fk" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_log"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planned_session" ADD CONSTRAINT "planned_session_planned_day_id_planned_workout_day_id_fk" FOREIGN KEY ("planned_day_id") REFERENCES "public"."planned_workout_day"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planned_session" ADD CONSTRAINT "planned_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planned_session" ADD CONSTRAINT "planned_session_plan_version_id_training_plan_version_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."training_plan_version"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planned_session" ADD CONSTRAINT "planned_session_rescheduled_from_id_planned_session_id_fk" FOREIGN KEY ("rescheduled_from_id") REFERENCES "public"."planned_session"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planned_workout_day" ADD CONSTRAINT "planned_workout_day_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planned_workout_day" ADD CONSTRAINT "planned_workout_day_plan_version_id_training_plan_version_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."training_plan_version"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_completion" ADD CONSTRAINT "session_completion_planned_session_id_planned_session_id_fk" FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_session"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_completion" ADD CONSTRAINT "session_completion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_completion" ADD CONSTRAINT "session_completion_workout_log_id_workout_log_id_fk" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_log"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_plan_version" ADD CONSTRAINT "training_plan_version_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_plan_version" ADD CONSTRAINT "training_plan_version_prior_version_id_training_plan_version_id_fk" FOREIGN KEY ("prior_version_id") REFERENCES "public"."training_plan_version"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_plan" ADD CONSTRAINT "training_plan_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_state" ADD CONSTRAINT "training_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_state" ADD CONSTRAINT "training_state_active_plan_version_id_training_plan_version_id_fk" FOREIGN KEY ("active_plan_version_id") REFERENCES "public"."training_plan_version"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_log" ADD CONSTRAINT "workout_log_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_log" ADD CONSTRAINT "workout_log_fit_file_id_fit_file_id_fk" FOREIGN KEY ("fit_file_id") REFERENCES "public"."fit_file"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;