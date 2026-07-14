ALTER TABLE "fit_file" ADD COLUMN "parse_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "fit_file" ADD COLUMN "parse_error" text;