-- ─── Program generation jobs ─────────────────────────────────────────────────
-- Idempotent: safe to run against an existing database.
--
-- Decouples program generation from the HTTP request that triggers it — a
-- Nebius call can legitimately take longer than a serverless function's
-- realistic execution ceiling. The client polls this table for completion
-- instead of holding one request open for the whole generation.

CREATE TABLE IF NOT EXISTS "program_generation_job" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "status" text NOT NULL DEFAULT 'pending',
    "inputs_json" jsonb NOT NULL,
    "feedback" text,
    "result_json" jsonb,
    "error_message" text,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);
