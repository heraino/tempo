import { db } from "@/lib/db"
import { userPreferences } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

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

const DEFAULT_PREFS: UserPrefs = {
  unitsSystem: "imperial",
  timezone: null,
  trainingMode: "goal_program",
  runnerLevel: null,
  daysPerWeek: null,
  longRunDay: null,
  maxHr: null,
}

export async function getUserPreferences(userId: string): Promise<UserPrefs> {
  try {
    const rows = await db
      .select({
        unitsSystem: userPreferences.unitsSystem,
        timezone: userPreferences.timezone,
        trainingMode: userPreferences.trainingMode,
        runnerLevel: userPreferences.runnerLevel,
        daysPerWeek: userPreferences.daysPerWeek,
        longRunDay: userPreferences.longRunDay,
        maxHr: userPreferences.maxHr,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
    if (!rows[0]) return DEFAULT_PREFS
    return {
      unitsSystem: (rows[0].unitsSystem ?? "imperial") as UnitsSystem,
      timezone: rows[0].timezone ?? null,
      trainingMode: (rows[0].trainingMode ?? "goal_program") as TrainingMode,
      runnerLevel: (rows[0].runnerLevel ?? null) as RunnerLevel | null,
      daysPerWeek: rows[0].daysPerWeek ?? null,
      longRunDay: rows[0].longRunDay ?? null,
      maxHr: rows[0].maxHr ?? null,
    }
  } catch {
    // max_hr may not exist yet on databases that have not run migration 0009
    try {
      const rows = await db
        .select({
          unitsSystem: userPreferences.unitsSystem,
          timezone: userPreferences.timezone,
          trainingMode: userPreferences.trainingMode,
          runnerLevel: userPreferences.runnerLevel,
          daysPerWeek: userPreferences.daysPerWeek,
          longRunDay: userPreferences.longRunDay,
        })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1)
      if (!rows[0]) return DEFAULT_PREFS
      return {
        ...DEFAULT_PREFS,
        unitsSystem: (rows[0].unitsSystem ?? "imperial") as UnitsSystem,
        timezone: rows[0].timezone ?? null,
        trainingMode: (rows[0].trainingMode ?? "goal_program") as TrainingMode,
        runnerLevel: (rows[0].runnerLevel ?? null) as RunnerLevel | null,
        daysPerWeek: rows[0].daysPerWeek ?? null,
        longRunDay: rows[0].longRunDay ?? null,
      }
    } catch {
      // Columns may not exist yet on databases that have not run migration 0008
      try {
        const rows = await db
          .select({
            unitsSystem: userPreferences.unitsSystem,
            timezone: userPreferences.timezone,
          })
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1)
        if (!rows[0]) return DEFAULT_PREFS
        return {
          ...DEFAULT_PREFS,
          unitsSystem: (rows[0].unitsSystem ?? "imperial") as UnitsSystem,
          timezone: rows[0].timezone ?? null,
        }
      } catch {
        return DEFAULT_PREFS
      }
    }
  }
}

export async function upsertUserPreferences(
  userId: string,
  prefs: Partial<UserPrefs>,
): Promise<void> {
  const baseValues = {
    id: crypto.randomUUID(),
    userId,
    unitsSystem: prefs.unitsSystem ?? "imperial",
    timezone: prefs.timezone ?? null,
    trainingMode: prefs.trainingMode ?? "goal_program",
    runnerLevel: prefs.runnerLevel ?? null,
    daysPerWeek: prefs.daysPerWeek ?? null,
    longRunDay: prefs.longRunDay ?? null,
  }
  const baseSet = {
    ...(prefs.unitsSystem != null ? { unitsSystem: prefs.unitsSystem } : {}),
    ...(prefs.timezone !== undefined ? { timezone: prefs.timezone } : {}),
    ...(prefs.trainingMode != null ? { trainingMode: prefs.trainingMode } : {}),
    ...(prefs.runnerLevel !== undefined ? { runnerLevel: prefs.runnerLevel } : {}),
    ...(prefs.daysPerWeek !== undefined ? { daysPerWeek: prefs.daysPerWeek } : {}),
    ...(prefs.longRunDay !== undefined ? { longRunDay: prefs.longRunDay } : {}),
    updatedAt: new Date(),
  }

  try {
    await db
      .insert(userPreferences)
      .values({ ...baseValues, maxHr: prefs.maxHr ?? null })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { ...baseSet, ...(prefs.maxHr !== undefined ? { maxHr: prefs.maxHr } : {}) },
      })
  } catch {
    // max_hr may not exist yet on databases that have not run migration 0009 —
    // retry without it so the rest of the save still succeeds rather than
    // failing the whole preferences write over one missing column. If this
    // retry also fails, the real error propagates from here instead.
    await db
      .insert(userPreferences)
      .values(baseValues)
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: baseSet,
      })
  }
}
