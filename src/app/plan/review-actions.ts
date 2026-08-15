"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import {
  coachingAnalyses,
  planChangeProposals,
  trainingPlanVersions,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { nebiusChat } from "@/lib/ai/nebius"
import { gatherPlanReviewEvidence, REVIEW_WINDOW_DAYS } from "@/lib/services/planReview.service"
import { getActivePlanVersion, getAthleteTimezone } from "@/lib/services/plan.service"
import { backfillPlanReconciliation } from "@/lib/services/completion.service"
import { resolveLocalDate } from "@/lib/plan/localDate"
import { applyPlanMutation, PlanMutationError, type PlanMutationOp } from "@/lib/plan/mutations"
import { planMutationSchema } from "@/lib/validation/planMutation"
import { validatePlanJson } from "@/lib/validation/plan"
import { generateSchedule } from "@/lib/plan/scheduler"
import { getActiveGoal } from "@/lib/services/goal.service"
import { resolveTargetPaceMinPerKm } from "@/lib/goals/goal"

const ANALYTICS_VERSION = "1.0"
const MAX_PROPOSALS = 4

const proposalSchema = z.object({
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(1000),
  evidence: z.string().max(1000).optional().default(""),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  mutation: planMutationSchema,
})

const reviewSchema = z.object({
  summary: z.string().min(1).max(2000),
  assessment: z.enum(["on_track", "minor_adjustments", "needs_change", "at_risk"]),
  observations: z.array(z.string().max(500)).max(6).default([]),
  proposals: z.array(proposalSchema).max(MAX_PROPOSALS).default([]),
})

export type PlanReview = z.infer<typeof reviewSchema>

const SYSTEM_PROMPT = `You are an experienced running coach reviewing whether an athlete's training plan is still the right plan for them.

You receive a deterministic evidence snapshot: plan adherence over the review window, training load (CTL/ATL/TSB), fitness KPIs, recovery signals, active pain flags, the athlete's goal, and the plan's structure. Every number has already been computed for you — never recompute or estimate one, and never invent data that is not present.

Follow the workflow: DATA → COACH INTERPRETATION → DECISION.

Rules:
- Ground every claim in a specific number from the snapshot. Cite it in the "evidence" field.
- Never diagnose injury. If pain flags are present, use conservative training-management language.
- Do not propose changes when the evidence says the plan is working. An empty proposals array is the correct answer for an athlete on track.
- Propose at most ${MAX_PROPOSALS} changes, most important first.
- Each proposal MUST include a "mutation" object using ONLY the ops and the exact cycleWeek ids, weekdays, and session kinds that appear in planStructure. A proposal referring to something not in planStructure will be discarded.
- Prefer the smallest change that addresses the problem.

Available mutation ops:
  {"op":"swap_session_kind","cycleWeekId":"<id>","weekday":"<Weekday>","fromKind":"<kind>","toKind":"<kind>"}
  {"op":"remove_session","cycleWeekId":"<id>","weekday":"<Weekday>","sessionKind":"<kind>"}
  {"op":"add_session","cycleWeekId":"<id>","weekday":"<Weekday>","sessionKind":"<kind>"}
  {"op":"move_session","cycleWeekId":"<id>","fromWeekday":"<Weekday>","toWeekday":"<Weekday>","sessionKind":"<kind>"}
  {"op":"scale_mileage","blockNumber":<int, optional>,"factorPct":<-50..50>}
  {"op":"set_cutback","cycleWeekId":"<id>","isCutback":<bool>}

Respond with ONLY a valid JSON object:
{
  "summary": "2-4 sentences: is this plan working, and why",
  "assessment": "on_track" | "minor_adjustments" | "needs_change" | "at_risk",
  "observations": ["up to 6 specific evidence-grounded observations"],
  "proposals": [
    {
      "title": "short imperative change description",
      "rationale": "why this change, in coaching terms",
      "evidence": "the specific numbers that justify it",
      "severity": "low" | "medium" | "high",
      "mutation": { ...one op from above... }
    }
  ]
}`

/**
 * Run a plan review. Athlete-initiated only — nothing here runs on a schedule.
 *
 * Proposals are dry-run against the current plan before being persisted, so
 * every proposal the athlete sees is guaranteed to apply cleanly.
 */
export async function generatePlanReview(): Promise<{
  ok: boolean
  analysisId?: string
  error?: string
}> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }
  const userId = session.user.id

  const tz = await getAthleteTimezone(userId)
  const todayStr = resolveLocalDate(tz)

  // Self-healing: reconcile any workouts logged before this linkage existed
  // (or before the athlete's plan did) against the schedule, so adherence
  // reflects real training rather than whether each run happened to get
  // linked at upload time. Idempotent and cheap after the first run.
  const backfillSince = new Date(Date.now() - (REVIEW_WINDOW_DAYS + 7) * 24 * 60 * 60 * 1000)
  await backfillPlanReconciliation(userId, backfillSince).catch((err) => {
    console.error("plan reconciliation backfill failed (review continues with existing data):", err)
  })

  const gathered = await gatherPlanReviewEvidence(userId, todayStr)
  if (!gathered) {
    return { ok: false, error: "No active training plan to review" }
  }
  const { evidence, planJson } = gathered

  const userPrompt = `Evidence snapshot:\n\n${JSON.stringify(evidence, null, 2)}`

  let rawResponse: string
  try {
    rawResponse = await nebiusChat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, maxTokens: 2000 },
    )
  } catch {
    return { ok: false, error: "The coach is unavailable right now. Try again shortly." }
  }

  const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { ok: false, error: "Could not read the coach's response" }

  let parsed: PlanReview
  try {
    parsed = reviewSchema.parse(JSON.parse(jsonMatch[0]))
  } catch {
    return { ok: false, error: "The coach's response was not in the expected format" }
  }

  // Dry-run every proposal. Anything that does not apply to the real plan is
  // dropped rather than shown to the athlete.
  const applicable: Array<{
    proposal: (typeof parsed.proposals)[number]
    mutation: PlanMutationOp
    summary: string
  }> = []

  for (const proposal of parsed.proposals) {
    try {
      const mutation = proposal.mutation as PlanMutationOp
      const result = applyPlanMutation(planJson, mutation)
      validatePlanJson(result.plan)
      applicable.push({ proposal, mutation, summary: result.summary })
    } catch (err) {
      if (err instanceof PlanMutationError) continue
      continue
    }
  }

  const [analysis] = await db
    .insert(coachingAnalyses)
    .values({
      userId,
      workoutLogId: null,
      analysisType: "plan_review",
      provider: "nebius",
      model: process.env.NEBIUS_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct",
      analyticsVersion: ANALYTICS_VERSION,
      promptText: userPrompt,
      contextSnapshot: evidence,
      responseRaw: rawResponse,
      responseParsed: parsed,
      headline: parsed.summary.slice(0, 200),
      decision: parsed.assessment,
      grade: null,
      flags: {
        assessment: parsed.assessment,
        observations: parsed.observations,
        proposalsReturned: parsed.proposals.length,
        proposalsApplicable: applicable.length,
      },
    })
    .returning()

  if (applicable.length > 0) {
    await db.insert(planChangeProposals).values(
      applicable.map(({ proposal, mutation, summary }) => ({
        userId,
        coachingAnalysisId: analysis.id,
        changeOp: mutation.op,
        changeParams: mutation,
        title: proposal.title,
        rationale: proposal.rationale,
        evidence: proposal.evidence || summary,
        severity: proposal.severity,
        status: "pending",
      })),
    )
  }

  revalidatePath("/plan/review")
  revalidatePath("/dashboard")
  return { ok: true, analysisId: analysis.id }
}

/**
 * Accept a proposal: apply its mutation deterministically and record the
 * result as a new plan version. The prior version is retained and linked.
 */
export async function acceptProposal(
  proposalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }
  const userId = session.user.id

  const [proposal] = await db
    .select()
    .from(planChangeProposals)
    .where(and(eq(planChangeProposals.id, proposalId), eq(planChangeProposals.userId, userId)))
    .limit(1)

  if (!proposal) return { ok: false, error: "Proposal not found" }
  if (proposal.status !== "pending") {
    return { ok: false, error: "This proposal has already been decided" }
  }

  const currentVersion = await getActivePlanVersion(userId)
  if (!currentVersion) return { ok: false, error: "No active training plan" }

  let mutation: PlanMutationOp
  try {
    mutation = planMutationSchema.parse(proposal.changeParams) as PlanMutationOp
  } catch {
    return { ok: false, error: "This proposal is no longer valid" }
  }

  let nextPlan
  let summary: string
  try {
    const currentPlan = validatePlanJson(currentVersion.planJson)
    const result = applyPlanMutation(currentPlan, mutation)
    nextPlan = validatePlanJson(result.plan)
    summary = result.summary
  } catch (err) {
    const message =
      err instanceof PlanMutationError
        ? err.message
        : "This change no longer applies to your current plan"
    return { ok: false, error: message }
  }

  const tz = await getAthleteTimezone(userId)
  const todayStr = resolveLocalDate(tz)

  const [newVersion] = await db
    .insert(trainingPlanVersions)
    .values({
      userId,
      versionNumber: currentVersion.versionNumber + 1,
      effectiveFrom: todayStr,
      effectiveUntil: null,
      planJson: nextPlan,
      cycleStartDate: currentVersion.cycleStartDate,
      cycleStartWeekId: currentVersion.cycleStartWeekId,
      changeReason: `${proposal.title} — ${summary}`,
      changeAuthor: "coach_accepted_by_athlete",
      priorVersionId: currentVersion.id,
    })
    .returning()

  // Close out the prior version so its effective window is explicit
  await db
    .update(trainingPlanVersions)
    .set({ effectiveUntil: todayStr })
    .where(eq(trainingPlanVersions.id, currentVersion.id))

  // Generate forward schedule under the new version. Past days stay attached
  // to the old version — completed training is history and is never rewritten.
  const goal = await getActiveGoal(userId).catch(() => null)
  await generateSchedule(
    userId,
    newVersion.id,
    nextPlan,
    newVersion.cycleStartDate,
    newVersion.cycleStartWeekId,
    todayStr,
    60,
    goal ? resolveTargetPaceMinPerKm(goal) : null,
  ).catch(() => {})

  await db
    .update(planChangeProposals)
    .set({
      status: "accepted",
      resultingPlanVersionId: newVersion.id,
      decidedAt: new Date(),
    })
    .where(eq(planChangeProposals.id, proposalId))

  // Sibling proposals from the same review were written against the old plan
  // and may no longer apply, so they are retired rather than left stale.
  if (proposal.coachingAnalysisId) {
    await db
      .update(planChangeProposals)
      .set({ status: "superseded", decidedAt: new Date() })
      .where(
        and(
          eq(planChangeProposals.userId, userId),
          eq(planChangeProposals.coachingAnalysisId, proposal.coachingAnalysisId),
          eq(planChangeProposals.status, "pending"),
        ),
      )
  }

  revalidatePath("/plan/review")
  revalidatePath("/plan")
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function rejectProposal(
  proposalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const result = await db
    .update(planChangeProposals)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(
      and(
        eq(planChangeProposals.id, proposalId),
        eq(planChangeProposals.userId, session.user.id),
        eq(planChangeProposals.status, "pending"),
      ),
    )
    .returning({ id: planChangeProposals.id })

  if (result.length === 0) return { ok: false, error: "Proposal not found" }

  revalidatePath("/plan/review")
  return { ok: true }
}
