"use server"

import { auth } from "@/auth"
import { upsertUserPreferences, type UnitsSystem } from "@/lib/services/userPreferences.service"
import { revalidatePath } from "next/cache"

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
