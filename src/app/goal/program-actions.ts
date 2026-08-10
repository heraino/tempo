"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { coachingAnalyses } from "@/lib/db/schema"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  generateProgram,
  activateProgram,
  PROGRAM_MODEL,
  type ProgramInputs,
} from "@/lib/services/program.service"
import { getActiveGoal } from "@/lib/services/goal.service"
import { getAthleteTimezone, getActivePlanVersion } from "@/lib/services/plan.service"
import { upsertUserPreferences, type TrainingMode } from "@/lib/services/userPreferences.service"
import { resolveLocalDate } from "@/lib/plan/localDate"
import { programBlueprintSchema } from "@/lib/validation/blueprint"
import { blueprintToPlanJson, summarizeBlueprint, checkBlueprintSafety } from "@/lib/plan/blueprint"
import { validatePlanJson } from "@/lib/validation/plan"
import type { GeneratedProgram } from "@/lib/services/program.service"

const ANALYTICS_VERSION = "1.0"

const inputsSchema = z.object({
  runnerLevel: z.enum(["beginner", "intermediate"]),
  daysPerWeek: z.number().int().min(2).max(7),
  longRunDay: z.string().max(20).nullable(),
  currentWeeklyMi: z.number().min(0).max(200).nullable(),
  longestRecentRunMi: z.number().min(0).max(100).nullable(),
  notes: z.string().max(1000).nullable().optional(),
})

/** Monday of the week after the given date — programs start on a clean week. */
function nextMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay() // 0 = Sunday
  const daysUntilMonday = dow === 1 ? 7 : (8 - dow) % 7 || 7
  d.setUTCDate(d.getUTCDate() + daysUntilMonday)
  return d.toISOString().slice(0, 10)
}

export async function buildProgram(
  rawInputs: unknown,
  feedback?: string | null,
): Promise<{ ok: boolean; program?: GeneratedProgram; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }
  const userId = session.user.id

  const parsed = inputsSchema.safeParse(rawInputs)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid inputs" }
  }
  const inputs: ProgramInputs = parsed.data

  const trimmedFeedback = typeof feedback === "string" ? feedback.trim().slice(0, 1000) : null

  const [goal, tz] = await Promise.all([
    getActiveGoal(userId).catch(() => null),
    getAthleteTimezone(userId),
  ])
  const todayStr = resolveLocalDate(tz)

  const result = await generateProgram(goal, inputs, todayStr, trimmedFeedback)
  if (!result.ok) return { ok: false, error: result.error }

  // Persist the generation for traceability, alongside the exact inputs used
  await db
    .insert(coachingAnalyses)
    .values({
      userId,
      workoutLogId: null,
      analysisType: "program_generation",
      provider: "nebius",
      model: PROGRAM_MODEL,
      analyticsVersion: ANALYTICS_VERSION,
      promptText: JSON.stringify({ inputs, feedback: trimmedFeedback }),
      contextSnapshot: {
        inputs,
        feedback: trimmedFeedback,
        goal: goal ? { goalType: goal.goalType, targetDate: goal.targetDate } : null,
      },
      responseRaw: result.raw,
      responseParsed: result.program.blueprint,
      headline: result.program.blueprint.planName.slice(0, 200),
      decision: result.program.blueprint.summary.slice(0, 500),
      flags: { warnings: result.program.warnings },
    })
    .catch(() => {})

  return { ok: true, program: result.program }
}

/**
 * Activate a reviewed program.
 *
 * The client sends back only the blueprint; the plan is re-expanded and
 * re-validated here, so nothing the client supplies reaches plan storage
 * unchecked.
 */
export async function startProgram(
  rawBlueprint: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }
  const userId = session.user.id

  const parsed = programBlueprintSchema.safeParse(rawBlueprint)
  if (!parsed.success) {
    return { ok: false, error: "That program is no longer valid — generate a new one." }
  }

  const existingVersion = await getActivePlanVersion(userId)
  if (existingVersion) {
    return {
      ok: false,
      error:
        "You already have a training plan. Use “How is my plan working?” to change it instead.",
    }
  }

  let planJson
  try {
    planJson = validatePlanJson(blueprintToPlanJson(parsed.data))
  } catch {
    return { ok: false, error: "That program could not be built. Generate a new one." }
  }

  const [goal, tz] = await Promise.all([
    getActiveGoal(userId).catch(() => null),
    getAthleteTimezone(userId),
  ])
  const todayStr = resolveLocalDate(tz)

  await activateProgram(userId, parsed.data, planJson, nextMonday(todayStr), tz, goal)
  await upsertUserPreferences(userId, { trainingMode: "goal_program" })

  revalidatePath("/dashboard")
  revalidatePath("/plan")
  revalidatePath("/settings")
  revalidatePath("/goal")
  return { ok: true }
}

/**
 * Switch between tracking-only and following a program.
 *
 * Switching to "just run" leaves any existing plan in place — it simply stops
 * driving the app — so switching back does not lose training history.
 */
export async function setTrainingMode(
  mode: string,
): Promise<{ ok: boolean; error?: string; needsProgram?: boolean }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }
  const userId = session.user.id

  if (mode !== "just_run" && mode !== "goal_program") {
    return { ok: false, error: "Unknown training mode" }
  }

  if (mode === "goal_program") {
    const existingVersion = await getActivePlanVersion(userId)
    if (!existingVersion) {
      // Nothing to switch to yet — the athlete needs to build a program first
      return { ok: true, needsProgram: true }
    }
  }

  await upsertUserPreferences(userId, { trainingMode: mode as TrainingMode })

  revalidatePath("/settings")
  revalidatePath("/dashboard")
  revalidatePath("/plan")
  return { ok: true }
}

/** Persist athlete availability so a program can be regenerated later. */
export async function saveProgramInputs(
  rawInputs: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const parsed = inputsSchema.safeParse(rawInputs)
  if (!parsed.success) return { ok: false, error: "Invalid inputs" }

  await upsertUserPreferences(session.user.id, {
    runnerLevel: parsed.data.runnerLevel,
    daysPerWeek: parsed.data.daysPerWeek,
    longRunDay: parsed.data.longRunDay,
  })
  return { ok: true }
}

/** Re-derive preview data for a blueprint without calling the model. */
export async function previewBlueprint(
  rawBlueprint: unknown,
  currentWeeklyMi: number | null,
  runnerLevel: string | null,
): Promise<{ ok: boolean; program?: GeneratedProgram; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const parsed = programBlueprintSchema.safeParse(rawBlueprint)
  if (!parsed.success) return { ok: false, error: "Invalid program" }

  try {
    const planJson = validatePlanJson(blueprintToPlanJson(parsed.data))
    return {
      ok: true,
      program: {
        blueprint: parsed.data,
        planJson,
        weekSummaries: summarizeBlueprint(parsed.data),
        warnings: checkBlueprintSafety(parsed.data, { currentWeeklyMi, runnerLevel }),
      },
    }
  } catch {
    return { ok: false, error: "That program could not be built" }
  }
}
