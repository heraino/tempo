import { db } from "@/lib/db"
import { userPreferences } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export type UnitsSystem = "imperial" | "metric"

export interface UserPrefs {
  unitsSystem: UnitsSystem
  timezone: string | null
}

const DEFAULT_PREFS: UserPrefs = { unitsSystem: "imperial", timezone: null }

export async function getUserPreferences(userId: string): Promise<UserPrefs> {
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
      unitsSystem: (rows[0].unitsSystem ?? "imperial") as UnitsSystem,
      timezone: rows[0].timezone ?? null,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export async function upsertUserPreferences(
  userId: string,
  prefs: Partial<UserPrefs>,
): Promise<void> {
  await db
    .insert(userPreferences)
    .values({
      id: crypto.randomUUID(),
      userId,
      unitsSystem: prefs.unitsSystem ?? "imperial",
      timezone: prefs.timezone ?? null,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        ...(prefs.unitsSystem != null ? { unitsSystem: prefs.unitsSystem } : {}),
        ...(prefs.timezone !== undefined ? { timezone: prefs.timezone } : {}),
        updatedAt: new Date(),
      },
    })
}
