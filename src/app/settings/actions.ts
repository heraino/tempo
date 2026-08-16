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

export async function savePreferences(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const unitsSystem = formData.get("unitsSystem") as UnitsSystem | null
  const timezone = formData.get("timezone") as string | null
  const maxHrRaw = formData.get("maxHr") as string | null
  const maxHrParsed = maxHrRaw ? parseInt(maxHrRaw, 10) : NaN
  const maxHr = Number.isFinite(maxHrParsed) && maxHrParsed > 0 ? maxHrParsed : null

  try {
    await upsertUserPreferences(session.user.id, {
      ...(unitsSystem ? { unitsSystem } : {}),
      ...(timezone ? { timezone } : {}),
      maxHr,
    })
  } catch {
    // A form action's return value is only visible to a client caller — the
    // plain <form action={...}> wrapper this feeds today discards it, so this
    // still surfaces as "nothing happened" rather than a message. That's
    // still a large improvement over an uncaught exception crashing the page.
    return { ok: false, error: "Could not save settings. Try again shortly." }
  }

  revalidatePath("/dashboard")
  revalidatePath("/settings")
  return { ok: true }
}
