/**
 * Program generation and activation.
 *
 * The coach authors a compact blueprint; this module expands it deterministically
 * into a plan, checks it against training-safety guardrails, and — only when the
 * athlete accepts — writes it as version 1 of their training plan.
 */

import { db } from "@/lib/db"
import { trainingPlans, trainingPlanVersions } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { nebiusChat } from "@/lib/ai/nebius"
import {
  blueprintToPlanJson,
  summarizeBlueprint,
  checkBlueprintSafety,
  BlueprintError,
  type ProgramBlueprint,
  type BlueprintWarning,
  type WeekSummary,
} from "@/lib/plan/blueprint"
import { validateProgramBlueprint } from "@/lib/validation/blueprint"
import { validatePlanJson } from "@/lib/validation/plan"
import { generateSchedule } from "@/lib/plan/scheduler"
import { describeGoal, weeksBetween, suggestPlanTitle, resolveTargetPaceMinPerKm } from "@/lib/goals/goal"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import type { TrainingGoal } from "@/lib/services/goal.service"
import type { PlanJson } from "@/lib/plan/types"

const MODEL_FALLBACK = "meta-llama/Llama-3.3-70B-Instruct"

export interface ProgramInputs {
  runnerLevel: "beginner" | "intermediate"
  daysPerWeek: number
  longRunDay: string | null
  currentWeeklyMi: number | null
  longestRecentRunMi: number | null
  notes?: string | null
}

export interface GeneratedProgram {
  blueprint: ProgramBlueprint
  planJson: PlanJson
  weekSummaries: WeekSummary[]
  warnings: BlueprintWarning[]
}

function buildSystemPrompt(): string {
  return `You are an experienced running coach designing a training program.

You return the program as a compact blueprint: which session kinds fall on which weekday, for each week of a repeating cycle, plus how weekly mileage progresses. You do NOT write session names, descriptions, or durations — those are generated from the session kind.

Design rules:
- Respect the athlete's stated availability. Do not schedule runs on more days than they said they can train.
- Beginners get at most 1 hard session per week; intermediate runners at most 2.
- Every week needs at least one full rest day (a weekday you simply omit).
- Open at a weekly volume the athlete can already handle, and build gradually. Never open more than ~20% above their current weekly mileage.
- Use a repeating cycle of 3-4 weeks where the last week is a cutback (isCutback: true) at roughly 70-80% of build volume.
- Put the long run on the athlete's preferred day when they named one.
- For a beginner whose goal is running a distance continuously, favour easy running and gradual time-on-feet over intensity.

Available session kinds: easy, recovery, long, threshold, tempo, progression, strides, strength, elastic.
Weekdays: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.

Respond with ONLY a valid JSON object:
{
  "planName": "short, memorable program name",
  "summary": "2-3 sentences: the shape of this program and why it suits this athlete",
  "cycleWeeks": [
    {
      "id": "short-id",
      "label": "human label",
      "isCutback": false,
      "days": [ { "weekday": "Tuesday", "sessionKinds": ["easy"] } ]
    }
  ],
  "progressionBlocks": [
    { "blockNumber": 1, "buildMinMi": 0, "buildMaxMi": 0, "cutbackMinMi": 0, "cutbackMaxMi": 0 }
  ],
  "notes": ["up to 4 short coaching notes for the athlete"]
}

Omit a weekday entirely to make it a rest day. Mileage numbers are in miles.`
}

function buildUserPrompt(
  goal: TrainingGoal | null,
  inputs: ProgramInputs,
  todayStr: string,
  feedback?: string | null,
): string {
  const context = {
    goal: goal
      ? {
          summary: describeGoal(goal, "imperial"),
          targetDate: goal.targetDate,
          weeksAvailable: goal.targetDate ? weeksBetween(todayStr, goal.targetDate) : null,
        }
      : null,
    athlete: {
      level: inputs.runnerLevel,
      daysPerWeekAvailable: inputs.daysPerWeek,
      preferredLongRunDay: inputs.longRunDay,
      currentWeeklyMileageMi: inputs.currentWeeklyMi,
      longestRecentRunMi: inputs.longestRecentRunMi,
      notes: inputs.notes ?? null,
    },
  }

  const base = `Design a program for this athlete:\n\n${JSON.stringify(context, null, 2)}`
  if (!feedback) return base

  return `${base}\n\nThe athlete reviewed your previous program and asked for this change:\n"${feedback}"\n\nProduce a revised program that addresses their feedback while keeping the design rules.`
}

/**
 * Generate a program. Returns the expanded plan alongside the blueprint so the
 * athlete can review exactly what they would be accepting.
 *
 * Retries once on a malformed response — a single reroll is worth it before
 * telling the athlete their program could not be built.
 */
export async function generateProgram(
  goal: TrainingGoal | null,
  inputs: ProgramInputs,
  todayStr: string,
  feedback?: string | null,
): Promise<{ ok: true; program: GeneratedProgram; raw: string } | { ok: false; error: string }> {
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(goal, inputs, todayStr, feedback)

  let lastError = "The coach could not design a program. Try again."

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string
    try {
      raw = await nebiusChat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: attempt === 0 ? 0.3 : 0.5, maxTokens: 2500 },
      )
    } catch (err) {
      // Surface the underlying reason (timeout vs. auth vs. upstream error) instead
      // of a generic message — with no server log access in some environments, this
      // is the only signal available for diagnosing a real outage vs. misconfiguration.
      const detail = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `The coach is unavailable right now: ${detail}` }
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      lastError = "Could not read the coach's response."
      continue
    }

    try {
      const blueprint = validateProgramBlueprint(JSON.parse(jsonMatch[0]))
      const planJson = validatePlanJson(blueprintToPlanJson(blueprint))
      return {
        ok: true,
        raw,
        program: {
          blueprint,
          planJson,
          weekSummaries: summarizeBlueprint(blueprint),
          warnings: checkBlueprintSafety(blueprint, {
            currentWeeklyMi: inputs.currentWeeklyMi,
            runnerLevel: inputs.runnerLevel,
          }),
        },
      }
    } catch (err) {
      lastError =
        err instanceof BlueprintError
          ? err.message
          : "The coach's program was not in the expected format."
    }
  }

  return { ok: false, error: lastError }
}

/**
 * Write an accepted program as the athlete's plan and generate its schedule.
 *
 * Used both when an athlete has no plan yet (switching from "just run" or
 * completing onboarding) and when replacing an existing one with a freshly
 * generated program. Either way this versions rather than deletes: a prior
 * active version is linked as priorVersionId and its effective window is
 * closed out at startDate, but its rows — and every completed session and
 * workout log tied to it — are left exactly as they were. Only forward
 * schedule is generated under the new version; past history is never rewritten.
 */
export async function activateProgram(
  userId: string,
  blueprint: ProgramBlueprint,
  planJson: PlanJson,
  startDate: string,
  timezone: string,
  goal: TrainingGoal | null,
): Promise<{ planVersionId: string }> {
  const validated = validatePlanJson(planJson)
  const cycleStartWeekId = validated.cycleWeeks[0].id
  const title =
    blueprint.planName ||
    (goal ? suggestPlanTitle(goal, "imperial") : "Training Program")

  const existing = await db
    .select()
    .from(trainingPlanVersions)
    .where(eq(trainingPlanVersions.userId, userId))
    .orderBy(desc(trainingPlanVersions.versionNumber))
    .limit(1)
  const priorVersion = existing[0] ?? null

  await db.delete(trainingPlans).where(eq(trainingPlans.userId, userId))
  await db.insert(trainingPlans).values({
    userId,
    title,
    // The markdown column predates structured plans; keep it human-readable
    // rather than storing a duplicate of plan_json.
    content: [`# ${title}`, "", blueprint.summary, "", ...blueprint.notes.map((n) => `- ${n}`)].join("\n"),
    startDate,
    startWeek: cycleStartWeekId,
    timezone,
  })

  const changeReason = priorVersion
    ? `Replaced with a newly generated program for: ${goal ? describeGoal(goal, "imperial") : "general training"}`
    : `Program generated for: ${goal ? describeGoal(goal, "imperial") : "general training"}`

  const [version] = await db
    .insert(trainingPlanVersions)
    .values({
      userId,
      versionNumber: (priorVersion?.versionNumber ?? 0) + 1,
      effectiveFrom: startDate,
      effectiveUntil: null,
      planJson: validated,
      cycleStartDate: startDate,
      cycleStartWeekId,
      changeReason,
      changeAuthor: "coach_accepted_by_athlete",
      priorVersionId: priorVersion?.id ?? null,
    })
    .returning()

  if (priorVersion) {
    await db
      .update(trainingPlanVersions)
      .set({ effectiveUntil: startDate })
      .where(eq(trainingPlanVersions.id, priorVersion.id))
  }

  const prefs = await getUserPreferences(userId).catch(() => null)
  await generateSchedule(
    userId,
    version.id,
    validated,
    startDate,
    cycleStartWeekId,
    startDate,
    90,
    goal ? resolveTargetPaceMinPerKm(goal) : null,
    prefs?.maxHr ?? null,
  )

  return { planVersionId: version.id }
}

export const PROGRAM_MODEL = process.env.NEBIUS_MODEL ?? MODEL_FALLBACK
