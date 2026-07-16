CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "units_system" text NOT NULL DEFAULT 'imperial',
  "timezone" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
