"use server"

import { auth, signOut } from "@/auth"
import { z } from "zod"
import { upsertUserPreferences } from "@/lib/services/userPreferences.service"

export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}

const timezoneSchema = z.string().min(1).max(100)

/**
 * Silently persist the browser-detected timezone. Fired once on mount from
 * the onboarding wizard for both paths, so "today" resolves correctly without
 * asking the athlete a question they can't answer better than their device.
 */
export async function saveDetectedTimezone(tz: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return

  const parsed = timezoneSchema.safeParse(tz)
  if (!parsed.success) return

  await upsertUserPreferences(session.user.id, { timezone: parsed.data })
}

const justRunSchema = z.object({
  runnerLevel: z.enum(["beginner", "intermediate"]),
  daysPerWeek: z.number().int().min(1).max(7),
})

/**
 * Finish onboarding for an athlete who just wants to run — no plan is
 * generated. Setting trainingMode="just_run" is what keeps the dashboard from
 * routing them back here for having no schedule.
 */
export async function completeJustRunOnboarding(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const parsed = justRunSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  await upsertUserPreferences(session.user.id, {
    trainingMode: "just_run",
    runnerLevel: parsed.data.runnerLevel,
    daysPerWeek: parsed.data.daysPerWeek,
  })

  return { ok: true }
}
