"use server"

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { setActiveGoal, setGoalStatus } from "@/lib/services/goal.service"
import {
  GOAL_TYPES,
  parseDurationToSecs,
  parsePaceToMinPerKm,
  resolveDistanceMeters,
  suggestPlanTitle,
} from "@/lib/goals/goal"

const goalFormSchema = z.object({
  goalType: z.enum(GOAL_TYPES),
  title: z.string().trim().max(120).optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Target date must be a calendar date")
    .optional(),
  targetDistanceM: z.number().positive().max(500_000).optional(),
  targetDurationSecs: z.number().positive().max(24 * 60 * 60).optional(),
  targetPaceMinPerKm: z.number().positive().max(30).optional(),
  targetRunsPerWeek: z.number().int().min(1).max(14).optional(),
  notes: z.string().trim().max(1000).optional(),
})

function str(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key)
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  return trimmed === "" ? undefined : trimmed
}

export async function saveGoal(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const units = str(formData, "units") === "metric" ? "metric" : "imperial"
  const goalType = str(formData, "goalType")

  // Distance arrives as meters from a preset, or as a custom value in display units
  const distanceKey = str(formData, "targetDistanceM") ?? ""
  const customDistance = str(formData, "customDistance") ?? ""
  const targetDistanceM = resolveDistanceMeters(distanceKey, customDistance, units) ?? undefined

  const durationRaw = str(formData, "targetDuration")
  const targetDurationSecs = durationRaw ? parseDurationToSecs(durationRaw) : null
  if (durationRaw && targetDurationSecs == null) {
    return { ok: false, error: "Target time must look like 1:45:00 or 45:00" }
  }

  const paceRaw = str(formData, "targetPace")
  const targetPaceMinPerKm = paceRaw ? parsePaceToMinPerKm(paceRaw, units) : null
  if (paceRaw && targetPaceMinPerKm == null) {
    return { ok: false, error: "Target pace must look like 8:30" }
  }

  const runsRaw = str(formData, "targetRunsPerWeek")
  const targetRunsPerWeek = runsRaw ? parseInt(runsRaw, 10) : undefined

  const parsed = goalFormSchema.safeParse({
    goalType,
    title: str(formData, "title"),
    targetDate: str(formData, "targetDate"),
    targetDistanceM,
    targetDurationSecs: targetDurationSecs ?? undefined,
    targetPaceMinPerKm: targetPaceMinPerKm ?? undefined,
    targetRunsPerWeek: Number.isNaN(targetRunsPerWeek) ? undefined : targetRunsPerWeek,
    notes: str(formData, "notes"),
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid goal" }
  }

  const data = parsed.data

  // Goals that describe a target need at least one target value to be actionable
  const hasTarget =
    data.targetDistanceM != null ||
    data.targetDurationSecs != null ||
    data.targetPaceMinPerKm != null ||
    data.targetRunsPerWeek != null
  if (!hasTarget) {
    return { ok: false, error: "Set at least one target for this goal" }
  }

  if (data.goalType === "habit" && data.targetRunsPerWeek == null) {
    return { ok: false, error: "Choose how many runs per week you're aiming for" }
  }

  await setActiveGoal(session.user.id, {
    ...data,
    title: data.title ?? suggestPlanTitle(data, units),
  })

  revalidatePath("/goal")
  revalidatePath("/dashboard")
  revalidatePath("/plan")
  return { ok: true }
}

export async function markGoalAchieved(
  goalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }
  await setGoalStatus(session.user.id, goalId, "achieved")
  revalidatePath("/goal")
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function abandonGoal(
  goalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }
  await setGoalStatus(session.user.id, goalId, "abandoned")
  revalidatePath("/goal")
  revalidatePath("/dashboard")
  return { ok: true }
}
