CREATE TABLE IF NOT EXISTS "import_chunk" (
  "upload_id" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "user_id" text NOT NULL,
  "total_chunks" integer NOT NULL,
  "chunk_data" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  PRIMARY KEY ("upload_id", "chunk_index")
);

ALTER TABLE "import_chunk"
  ADD CONSTRAINT "import_chunk_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;
