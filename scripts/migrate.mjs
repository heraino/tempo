// Applies pending database migrations as the first step of the production build.
//
// Runs ONLY when VERCEL_ENV is "production". Vercel gives preview builds the same
// DATABASE_URL as production, so an ungated migrate step would let any branch
// migrate the production database.
//
// A failure exits non-zero, which fails the build: Vercel keeps serving the
// previous deployment instead of shipping code against a schema it can't use.
//
// Plain JavaScript on purpose — Node runs it directly on Vercel, with no
// TypeScript runner as a build dependency.

import path from "node:path"
import { fileURLToPath } from "node:url"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { migrate } from "drizzle-orm/neon-http/migrator"

// Must match drizzle.config.ts. drizzle-orm's migrate() defaults to the
// "drizzle" schema, which would create a second, empty migrations table and
// replay every migration from 0000.
export const MIGRATIONS_CONFIG = {
  migrationsFolder: fileURLToPath(new URL("../drizzle/migrations", import.meta.url)),
  migrationsTable: "__drizzle_migrations",
  migrationsSchema: "public",
}

/** @param {Record<string, string | undefined>} env */
export function shouldRunMigrations(env) {
  return env.VERCEL_ENV === "production"
}

/** @param {ReturnType<typeof neon>} sql */
async function appliedCount(sql) {
  const [{ present }] = await sql`
    SELECT to_regclass('public.__drizzle_migrations') IS NOT NULL AS present`
  if (!present) return 0
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM public.__drizzle_migrations`
  return n
}

async function main() {
  if (!shouldRunMigrations(process.env)) {
    console.log(
      `[migrate] skipped: VERCEL_ENV is ${process.env.VERCEL_ENV ?? "unset"}, ` +
        "migrations only run on production deploys",
    )
    return
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set for this production build")

  const sql = neon(url)
  const before = await appliedCount(sql)
  await migrate(drizzle(sql), MIGRATIONS_CONFIG)
  const applied = (await appliedCount(sql)) - before
  console.log(
    applied > 0
      ? `[migrate] applied ${applied} migration${applied === 1 ? "" : "s"}`
      : "[migrate] database already up to date",
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[migrate] FAILED — aborting the build; the previous deployment keeps serving.")
    console.error(err)
    process.exit(1)
  })
}
