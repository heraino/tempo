import type { Config } from "drizzle-kit"

// Used by `npm run db:push` to sync the schema to your Neon database.
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
