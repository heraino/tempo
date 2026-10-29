/**
 * Which recently added columns the connected database actually has.
 *
 * Migrations run on every production deploy (scripts/migrate.mjs), so normally
 * every column exists and this costs one cached query per process. It is the
 * backstop for when they don't — a deploy whose build skipped the migrate step,
 * or a database restored from an older backup. A missing column is detected
 * once, logged with the migration that adds it, and refused on write, instead
 * of being silently dropped from every read and write.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

/** Columns added after their table was created, and the migration that adds each. */
export const OPTIONAL_COLUMNS = {
  "user_preferences.training_mode": "0008_training_mode",
  "user_preferences.runner_level": "0008_training_mode",
  "user_preferences.days_per_week": "0008_training_mode",
  "user_preferences.long_run_day": "0008_training_mode",
  "user_preferences.max_hr": "0009_athlete_max_hr",
} as const

export type OptionalColumn = keyof typeof OPTIONAL_COLUMNS

const ALL_OPTIONAL = Object.keys(OPTIONAL_COLUMNS) as OptionalColumn[]
const PROBED_TABLES = [...new Set(ALL_OPTIONAL.map((c) => c.split(".")[0]))]

/** The probe query: every column of every table that has an optional column. */
export function probeQuery() {
  return sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (${sql.join(PROBED_TABLES.map((t) => sql`${t}`), sql`, `)})`
}

// A complete result is cached for the life of the process. An incomplete one is
// re-checked after a minute, so a migration applied by hand takes effect
// without waiting for the next deploy.
const RECHECK_MS = 60_000
let cached: { missing: ReadonlySet<OptionalColumn>; at: number } | null = null

/** Optional columns this database lacks. Empty in normal operation. */
export async function missingColumns(): Promise<ReadonlySet<OptionalColumn>> {
  if (cached && (cached.missing.size === 0 || Date.now() - cached.at < RECHECK_MS)) {
    return cached.missing
  }

  const result = await db.execute<{ table_name: string; column_name: string }>(probeQuery())
  const present = new Set(result.rows.map((r) => `${r.table_name}.${r.column_name}`))
  const missing: ReadonlySet<OptionalColumn> = new Set(ALL_OPTIONAL.filter((c) => !present.has(c)))

  if (missing.size > 0) {
    console.error(
      `[schema] database is missing ${[...missing].join(", ")} ` +
        `(migration ${migrationsFor(missing).join(", ")}). Writes to these columns are refused ` +
        "until it is applied; migrations run during production builds, so check the latest " +
        "deployment's build log for its [migrate] line.",
    )
  }
  cached = { missing, at: Date.now() }
  return missing
}

/** The migrations that add the given columns, deduplicated and in order. */
export function migrationsFor(columns: Iterable<OptionalColumn>): string[] {
  return [...new Set([...columns].map((c) => OPTIONAL_COLUMNS[c]))].sort()
}

/** A write needed a column this database doesn't have yet. */
export class SchemaDriftError extends Error {
  constructor(
    readonly migrations: string[],
    what: string,
  ) {
    super(
      `${what} can't be saved: the app's database is missing migration ${migrations.join(" and ")}.`,
    )
    this.name = "SchemaDriftError"
  }
}

/** Test hook: forget the cached probe result. */
export function resetSchemaCapabilitiesCache() {
  cached = null
}
