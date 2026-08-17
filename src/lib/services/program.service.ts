/**
 * Program generation and activation.
 *
 * The coach authors a compact blueprint; this module expands it deterministically
 * into a plan, checks it against training-safety guardrails, and — only when the
 * athlete accepts — writes it as version 1 of their training plan.
 */

import { db } from "@/lib/db"
import { trainingPlans, trainingPlanVersions, programGenerationJobs, coachingAnalyses } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
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
import { resolveCurrentThresholdPaceMinPerKm } from "@/lib/plan/targets"
import { describeGoal, weeksBetween, suggestPlanTitle } from "@/lib/goals/goal"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import { getKpiSnapshot } from "@/lib/services/kpi.service"
import { getActiveGoal } from "@/lib/services/goal.service"
import { getAthleteTimezone } from "@/lib/services/plan.service"
import { resolveLocalDate } from "@/lib/plan/localDate"
import type { TrainingGoal } from "@/lib/services/goal.service"
import type { PlanJson } from "@/lib/plan/types"

const MODEL_FALLBACK = "meta-llama/Llama-3.3-70B-Instruct"
const ANALYTICS_VERSION = "1.0"

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

Design rules — quality structure:
- The week gets ONE primary quality slot: a single hard, structured session (threshold, tempo, or progression). Never schedule a second, different quality stimulus in the same week — that is two hard days plus the long run, which is more than intermediate or beginner athletes should absorb.
- Rotate the quality slot's stimulus across the build block rather than repeating the same workout every week — e.g. threshold intervals one week, continuous tempo the next, a progression run after that.
- Put real recovery between the long run and the week's quality session: favor long run → easy → recovery → quality (e.g. long run Sunday, easy Monday, recovery Tuesday, quality Wednesday) rather than placing quality within ~48 hours of the long run.
- Give the day before the long run a supporting role rather than leaving it blank or adding more intensity: an easy run with strides after a threshold week, an easy-to-steady progression run after a tempo week, or a purely easy run when the upcoming long run is a meaningful step up in distance.
- An intermediate athlete's "up to 2 hard sessions" allowance means the primary quality slot plus something genuinely complementary (strides, a light progression) — never a second full quality stimulus competing with the first. Beginners get the single quality slot only.
- Every week needs at least one full rest day (a weekday you simply omit).

Design rules — long-run progression:
- Progress the long run as its own explicit, conservative variable, anchored to the athlete's most recently completed long run distance — not derived from the week's total mileage or a generic template. Increase gradually across build weeks (roughly 0.5-1 mile per week is typical); do not jump distance just because another week arrived.
- A cutback week's long run is meaningfully shorter than the build weeks' — a deliberate reduction, not simply a fixed percentage of a mileage template.

Design rules — mileage:
- Decide each session's volume on its own merits — long-run distance, quality-work capacity, easy aerobic volume, recovery needs — and let the week's total mileage be whatever results from those decisions. Do not add filler distance to easy or recovery runs just to reach a round weekly number.
- progressionBlocks (buildMinMi/buildMaxMi/cutbackMinMi/cutbackMaxMi) describe the resulting expected weekly range once every session's volume has been decided — they are a summary of the decisions above, not a target chosen first that sessions get padded to hit.
- Cutback weeks reduce BOTH volume and intensity: no threshold, tempo, or progression session that week.
- Open at a weekly volume the athlete can already handle. Never open more than ~20% above their current weekly mileage.

Design rules — general:
- Respect the athlete's stated availability. Do not schedule runs on more days than they said they can train.
- Use a repeating cycle of 3-4 weeks where the last week is a cutback (isCutback: true).
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

// ─── Background generation jobs ────────────────────────────────────────────────
// A Nebius call for a full program can legitimately take longer than a
// serverless function's realistic per-request execution ceiling, especially
// on Hobby-tier plans. Rather than holding one HTTP request open for the
// whole generation, the athlete's request creates a job row and returns
// immediately; the actual work runs out-of-band (scheduled via Next.js
// after(), see program-actions.ts) and writes its result back to this row.
// The client polls getProgramGenerationJob for completion.

export type ProgramGenerationStatus = "pending" | "running" | "done" | "error"

export interface ProgramGenerationJob {
  id: string
  status: ProgramGenerationStatus
  result: GeneratedProgram | null
  errorMessage: string | null
}

/** Create a pending generation job. Returns its id immediately — no Nebius call happens here. */
export async function createProgramGenerationJob(
  userId: string,
  inputs: ProgramInputs,
  feedback: string | null,
): Promise<string> {
  const [job] = await db
    .insert(programGenerationJobs)
    .values({
      userId,
      status: "pending",
      inputsJson: inputs,
      feedback,
    })
    .returning()
  return job.id
}

/** Fetch a job's status, scoped to the requesting athlete so one athlete can never poll another's job. */
export async function getProgramGenerationJob(
  userId: string,
  jobId: string,
): Promise<ProgramGenerationJob | null> {
  const rows = await db
    .select()
    .from(programGenerationJobs)
    .where(and(eq(programGenerationJobs.id, jobId), eq(programGenerationJobs.userId, userId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    status: row.status as ProgramGenerationStatus,
    result: (row.resultJson as GeneratedProgram | null) ?? null,
    errorMessage: row.errorMessage,
  }
}

/**
 * Run a previously created generation job to completion, writing its result
 * back to the job row. Intended to be scheduled via after() so it runs after
 * the HTTP response that created the job has already gone back to the
 * client — nothing is left waiting on it.
 */
export async function runProgramGenerationJob(jobId: string): Promise<void> {
  const rows = await db
    .select()
    .from(programGenerationJobs)
    .where(eq(programGenerationJobs.id, jobId))
    .limit(1)
  const job = rows[0]
  if (!job) return

  await db
    .update(programGenerationJobs)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(programGenerationJobs.id, jobId))

  const inputs = job.inputsJson as ProgramInputs
  const [goal, tz] = await Promise.all([
    getActiveGoal(job.userId).catch(() => null),
    getAthleteTimezone(job.userId),
  ])
  const todayStr = resolveLocalDate(tz)

  const result = await generateProgram(goal, inputs, todayStr, job.feedback)

  if (!result.ok) {
    await db
      .update(programGenerationJobs)
      .set({ status: "error", errorMessage: result.error, updatedAt: new Date() })
      .where(eq(programGenerationJobs.id, jobId))
    return
  }

  await db
    .update(programGenerationJobs)
    .set({ status: "done", resultJson: result.program, updatedAt: new Date() })
    .where(eq(programGenerationJobs.id, jobId))

  // Persist the generation for traceability, alongside the exact inputs used
  await db
    .insert(coachingAnalyses)
    .values({
      userId: job.userId,
      workoutLogId: null,
      analysisType: "program_generation",
      provider: "nebius",
      model: PROGRAM_MODEL,
      analyticsVersion: ANALYTICS_VERSION,
      promptText: JSON.stringify({ inputs, feedback: job.feedback }),
      contextSnapshot: {
        inputs,
        feedback: job.feedback,
        goal: goal ? { goalType: goal.goalType, targetDate: goal.targetDate } : null,
      },
      responseRaw: result.raw,
      responseParsed: result.program.blueprint,
      headline: result.program.blueprint.planName.slice(0, 200),
      decision: result.program.blueprint.summary.slice(0, 500),
      flags: { warnings: result.program.warnings },
    })
    .catch(() => {})
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

  const [prefs, kpis] = await Promise.all([
    getUserPreferences(userId).catch(() => null),
    getKpiSnapshot(userId).catch(() => null),
  ])
  await generateSchedule(
    userId,
    version.id,
    validated,
    startDate,
    cycleStartWeekId,
    startDate,
    90,
    resolveCurrentThresholdPaceMinPerKm(kpis, goal),
    prefs?.maxHr ?? null,
  )

  return { planVersionId: version.id }
}

export const PROGRAM_MODEL = process.env.NEBIUS_MODEL ?? MODEL_FALLBACK
