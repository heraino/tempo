-- ─── Training goals + plan change proposals ─────────────────────────────────
-- Safe to run against an existing database: all statements are idempotent.

CREATE TABLE IF NOT EXISTS "training_goal" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "goal_type" text NOT NULL,
    "title" text,
    "target_date" date,
    "target_distance_m" real,
    "target_duration_secs" real,
    "target_pace_min_per_km" real,
    "target_runs_per_week" integer,
    "status" text DEFAULT 'active' NOT NULL,
    "notes" text,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE "training_goal"
        ADD CONSTRAINT "training_goal_user_id_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "training_goal_user_status_idx"
    ON "training_goal" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "plan_change_proposal" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "coaching_analysis_id" text,
    "change_op" text NOT NULL,
    "change_params" jsonb,
    "title" text NOT NULL,
    "rationale" text NOT NULL,
    "evidence" text,
    "severity" text DEFAULT 'medium' NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "resulting_plan_version_id" text,
    "decided_at" timestamp,
    "created_at" timestamp DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE "plan_change_proposal"
        ADD CONSTRAINT "plan_change_proposal_user_id_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "plan_change_proposal"
        ADD CONSTRAINT "plan_change_proposal_coaching_analysis_id_fk"
        FOREIGN KEY ("coaching_analysis_id") REFERENCES "public"."coaching_analysis"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "plan_change_proposal"
        ADD CONSTRAINT "plan_change_proposal_resulting_plan_version_id_fk"
        FOREIGN KEY ("resulting_plan_version_id") REFERENCES "public"."training_plan_version"("id")
        ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "plan_change_proposal_user_status_idx"
    ON "plan_change_proposal" ("user_id", "status");
