import { db } from "@/lib/db"
import { userPreferences } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import {
  missingColumns,
  migrationsFor,
  SchemaDriftError,
  type OptionalColumn,
} from "@/lib/db/schemaCapabilities"

export type UnitsSystem = "imperial" | "metric"
export type TrainingMode = "just_run" | "goal_program"
export type RunnerLevel = "beginner" | "intermediate"

export interface UserPrefs {
  unitsSystem: UnitsSystem
  timezone: string | null
  trainingMode: TrainingMode
  runnerLevel: RunnerLevel | null
  daysPerWeek: number | null
  longRunDay: string | null
  maxHr: number | null
}

export const DEFAULT_PREFS: UserPrefs = {
  unitsSystem: "imperial",
  timezone: null,
  trainingMode: "goal_program",
  runnerLevel: null,
  daysPerWeek: null,
  longRunDay: null,
  maxHr: null,
}

/** Each preference's column, the optional column it depends on, and its display name. */
const FIELDS: Record<keyof UserPrefs, { column: AnyPgColumn; requires?: OptionalColumn; label: string }> = {
  unitsSystem: { column: userPreferences.unitsSystem, label: "Units" },
  timezone: { column: userPreferences.timezone, label: "Timezone" },
  trainingMode: { column: userPreferences.trainingMode, requires: "user_preferences.training_mode", label: "Training mode" },
  runnerLevel: { column: userPreferences.runnerLevel, requires: "user_preferences.runner_level", label: "Runner level" },
  daysPerWeek: { column: userPreferences.daysPerWeek, requires: "user_preferences.days_per_week", label: "Days per week" },
  longRunDay: { column: userPreferences.longRunDay, requires: "user_preferences.long_run_day", label: "Long run day" },
  maxHr: { column: userPreferences.maxHr, requires: "user_preferences.max_hr", label: "Max heart rate" },
}

const PREF_KEYS = Object.keys(FIELDS) as (keyof UserPrefs)[]

function isMissing(key: keyof UserPrefs, missing: ReadonlySet<OptionalColumn>): boolean {
  const requires = FIELDS[key].requires
  return requires != null && missing.has(requires)
}

/**
 * One query, selecting only the columns this database has. A preference whose
 * column is missing reads as its default; schemaCapabilities logs which
 * migration is missing. Genuine database errors propagate.
 */
export async function getUserPreferences(userId: string): Promise<UserPrefs> {
  const missing = await missingColumns()
  const selected = Object.fromEntries(
    PREF_KEYS.filter((k) => !isMissing(k, missing)).map((k) => [k, FIELDS[k].column]),
  )
  const [row] = await db
    .select(selected)
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
  if (!row) return DEFAULT_PREFS

  const r = row as Partial<Record<keyof UserPrefs, unknown>>
  return {
    unitsSystem: (r.unitsSystem ?? DEFAULT_PREFS.unitsSystem) as UnitsSystem,
    timezone: (r.timezone ?? null) as string | null,
    trainingMode: (r.trainingMode ?? DEFAULT_PREFS.trainingMode) as TrainingMode,
    runnerLevel: (r.runnerLevel ?? null) as RunnerLevel | null,
    daysPerWeek: (r.daysPerWeek ?? null) as number | null,
    longRunDay: (r.longRunDay ?? null) as string | null,
    maxHr: (r.maxHr ?? null) as number | null,
  }
}

/**
 * Write the given preferences, or throw SchemaDriftError naming the missing
 * migration — never report success for a field the database can't store.
 */
export async function upsertUserPreferences(
  userId: string,
  prefs: Partial<UserPrefs>,
): Promise<void> {
  const keys = PREF_KEYS.filter((k) => prefs[k] !== undefined)
  const missing = await missingColumns()

  const blocked = keys.filter((k) => isMissing(k, missing))
  if (blocked.length > 0) {
    throw new SchemaDriftError(
      migrationsFor(blocked.map((k) => FIELDS[k].requires!)),
      blocked.map((k) => FIELDS[k].label).join(", "),
    )
  }

  const set: Partial<typeof userPreferences.$inferInsert> = { updatedAt: new Date() }
  for (const k of keys) (set as Record<string, unknown>)[k] = prefs[k]

  if (missing.size > 0) {
    // drizzle's INSERT names every column in the schema, so while any column
    // is absent only an UPDATE of an existing row can succeed.
    const updated = await db
      .update(userPreferences)
      .set(set)
      .where(eq(userPreferences.userId, userId))
      .returning({ id: userPreferences.id })
    if (updated.length === 0) throw new SchemaDriftError(migrationsFor(missing), "Your preferences")
    return
  }

  await db
    .insert(userPreferences)
    .values({ id: crypto.randomUUID(), userId, ...set })
    .onConflictDoUpdate({ target: userPreferences.userId, set })
}

/** A message safe to show the athlete for a failed preferences write. */
export function prefsWriteErrorMessage(err: unknown): string {
  if (err instanceof SchemaDriftError) return err.message
  console.error("[prefs] write failed:", err)
  return "Couldn't save your preferences. Try again shortly."
}
