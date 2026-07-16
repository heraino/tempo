"use server"

import { auth } from "@/auth"
import { getUserPreferences, upsertUserPreferences, type UnitsSystem } from "@/lib/services/userPreferences.service"
import { revalidatePath } from "next/cache"

/**
 * Called from TimezoneSync on every page load.
 * Only writes to DB if the detected timezone differs from what's stored,
 * and only triggers a page refresh when it actually changed.
 */
export async function syncTimezone(timezone: string): Promise<{ changed: boolean }> {
  const session = await auth()
  if (!session?.user?.id) return { changed: false }

  try {
    const prefs = await getUserPreferences(session.user.id)
    if (prefs.timezone === timezone) return { changed: false }

    await upsertUserPreferences(session.user.id, { timezone })
    revalidatePath("/dashboard")
    return { changed: true }
  } catch {
    return { changed: false }
  }
}

export async function savePreferences(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in" }

  const unitsSystem = formData.get("unitsSystem") as UnitsSystem | null
  const timezone = formData.get("timezone") as string | null

  await upsertUserPreferences(session.user.id, {
    ...(unitsSystem ? { unitsSystem } : {}),
    ...(timezone ? { timezone } : {}),
  })

  revalidatePath("/dashboard")
  revalidatePath("/settings")
  return { ok: true }
}
