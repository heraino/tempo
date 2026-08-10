-- ─── Training mode and athlete availability ─────────────────────────────────
-- Idempotent: safe to run against an existing database.
--
-- Existing athletes all reached the app through plan-based onboarding, so
-- goal_program is the correct default for them. New athletes choose during
-- onboarding, and "just run" athletes can switch later from Settings.

ALTER TABLE "user_preferences"
    ADD COLUMN IF NOT EXISTS "training_mode" text DEFAULT 'goal_program' NOT NULL;

ALTER TABLE "user_preferences"
    ADD COLUMN IF NOT EXISTS "runner_level" text;

ALTER TABLE "user_preferences"
    ADD COLUMN IF NOT EXISTS "days_per_week" integer;

ALTER TABLE "user_preferences"
    ADD COLUMN IF NOT EXISTS "long_run_day" text;
