-- ─── Athlete max heart rate ──────────────────────────────────────────────────
-- Idempotent: safe to run against an existing database.
--
-- Basis for the %-of-max heart-rate zones shown on planned sessions. Nullable
-- and optional — until an athlete sets it, sessions simply show no HR target
-- rather than a guessed one.

ALTER TABLE "user_preferences"
    ADD COLUMN IF NOT EXISTS "max_hr" integer;
