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
  const coreValues = {
    id: crypto.randomUUID(),
    userId,
    unitsSystem: prefs.unitsSystem ?? "imperial",
    timezone: prefs.timezone ?? null,
  }
  const coreSet = {
    ...(prefs.unitsSystem != null ? { unitsSystem: prefs.unitsSystem } : {}),
    ...(prefs.timezone !== undefined ? { timezone: prefs.timezone } : {}),
    updatedAt: new Date(),
  }

  const modeValues = {
    trainingMode: prefs.trainingMode ?? "goal_program",
    runnerLevel: prefs.runnerLevel ?? null,
    daysPerWeek: prefs.daysPerWeek ?? null,
    longRunDay: prefs.longRunDay ?? null,
  }
  const modeSet = {
    ...(prefs.trainingMode != null ? { trainingMode: prefs.trainingMode } : {}),
    ...(prefs.runnerLevel !== undefined ? { runnerLevel: prefs.runnerLevel } : {}),
    ...(prefs.daysPerWeek !== undefined ? { daysPerWeek: prefs.daysPerWeek } : {}),
    ...(prefs.longRunDay !== undefined ? { longRunDay: prefs.longRunDay } : {}),
  }

  const hrValues = { maxHr: prefs.maxHr ?? null }
  const hrSet = { ...(prefs.maxHr !== undefined ? { maxHr: prefs.maxHr } : {}) }

  // Try the full write (0009), then progressively drop the newest tier of
  // columns that might not exist yet, mirroring getUserPreferences' read-side
  // fallback. A database missing migration 0008 as well as 0009 still saves
  // whatever it can rather than failing the whole write. The final attempt
  // is allowed to throw for real — at that point it's not a missing column.
  try {
    await db
      .insert(userPreferences)
      .values({ ...coreValues, ...modeValues, ...hrValues })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { ...coreSet, ...modeSet, ...hrSet },
      })
    return
  } catch {}

  try {
    await db
      .insert(userPreferences)
      .values({ ...coreValues, ...modeValues })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { ...coreSet, ...modeSet },
      })
    return
  } catch {}

  await db
    .insert(userPreferences)
    .values(coreValues)
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: coreSet,
    })
}
