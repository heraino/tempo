ALTER TABLE "fit_file" ADD COLUMN IF NOT EXISTS "parse_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "fit_file" ADD COLUMN IF NOT EXISTS "parse_error" text;