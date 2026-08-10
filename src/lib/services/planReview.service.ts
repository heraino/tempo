/**
 * Evidence gathering for an AI plan review.
 *
 * Everything here is deterministic: the snapshot this builds is the complete
 * factual basis the model is given. The model interprets it; it never
 * recomputes a metric and never sees raw time-series records.
 */

import { db } from "@/lib/db"
import {
  plannedSessions,
  plannedWorkoutDays,
  painFlags,
  dailyWellness,
  coachingAnalyses,
  planChangeProposals,
} from "@/lib/db/schema"
import { and, eq, gte, lte, isNull, desc } from "drizzle-orm"
import { computeAdherence, ratePct, type AdherenceSessionRecord } from "@/lib/analytics/adherence"
import { computePerformance } from "@/lib/analytics/performance"
import { computeReadiness } from "@/lib/analytics/readiness"
import { getKpiSnapshot } from "@/lib/services/kpi.service"
import { getActivePlanVersion } from "@/lib/services/plan.service"
import { getActiveGoal } from "@/lib/services/goal.service"
import { validatePlanJson } from "@/lib/validation/plan"
import { describeGoal, weeksBetween, resolveTargetPaceMinPerKm, fmtGoalPace } from "@/lib/goals/goal"
import { fmtPace, fmtDistance } from "@/lib/fmt"
import type { PlanJson } from "@/lib/plan/types"

export const REVIEW_WINDOW_DAYS = 28

/** Shift a YYYY-MM-DD date by n days (UTC-stable). */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * A compact, model-facing description of the plan's structure. Includes the
 * cycle week ids and weekday/session-kind layout the mutation ops address, so
 * the model can only propose changes that refer to things that exist.
 */
export interface PlanStructureSummary {
  cycleWeeks: Array<{
    id: string
    label: string
    isCutback: boolean
    days: Array<{ weekday: string; sessionKinds: string[] }>
  }>
  progressionBlocks: Array<{
    blockNumber: number
    buildMi: string
    cutbackMi: string
  }>
}

export function summarizePlanStructure(plan: PlanJson): PlanStructureSummary {
  return {
    cycleWeeks: plan.cycleWeeks.map((w) => ({
      id: w.id,
      label: w.label,
      isCutback: w.isCutback ?? false,
      days: w.days.map((d) => ({
        weekday: d.weekday,
        sessionKinds: d.sessions.map((s) => s.sessionKind),
      })),
    })),
    progressionBlocks: (plan.progressionBlocks ?? []).map((b) => ({
      blockNumber: b.blockNumber,
      buildMi: `${b.buildMinMi}–${b.buildMaxMi}`,
      cutbackMi: `${b.cutbackMinMi}–${b.cutbackMaxMi}`,
    })),
  }
}

export interface PlanReviewEvidence {
  windowDays: number
  asOfDate: string
  goal: {
    summary: string
    targetDate: string | null
    weeksRemaining: number | null
    targetPacePerMile: string | null
  } | null
  adherence: {
    completionRatePct: number | null
    completed: number
    skipped: number
    missed: number
    rescheduled: number
    upcoming: number
    longestMissStreak: number
    byKind: Record<string, { planned: number; completed: number; skipped: number; completionRatePct: number | null }>
  }
  trainingLoad: {
    fitnessCtl: number | null
    fatigueAtl: number | null
    formTsb: number | null
  }
  fitness: {
    weeklyMileage: string | null
    easyPaceAt140: string | null
    thresholdPace: string | null
    longestRun: string | null
    recentWorkoutCount: number
    readinessScore: number | null
    readinessConfidence: string | null
  }
  wellness: {
    hrv7dAvg: number | null
    hrv28dAvg: number | null
    sleepScore7dAvg: number | null
    daysWithData: number
  }
  activePainFlags: Array<{ location: string; side: string | null; level: string; sinceDate: string }>
  planStructure: PlanStructureSummary
}

/** Average of the non-null values, or null when there are none. */
function avg(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null)
  if (present.length === 0) return null
  return Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10
}

/**
 * Assemble the full evidence snapshot for a plan review.
 * Returns null when the athlete has no active plan to review.
 */
export async function gatherPlanReviewEvidence(
  userId: string,
  todayStr: string,
): Promise<{ evidence: PlanReviewEvidence; planJson: PlanJson; planVersionId: string } | null> {
  const planVersion = await getActivePlanVersion(userId)
  if (!planVersion) return null

  let planJson: PlanJson
  try {
    planJson = validatePlanJson(planVersion.planJson)
  } catch {
    return null
  }

  const windowStart = shiftDate(todayStr, -REVIEW_WINDOW_DAYS)
  const windowEnd = shiftDate(todayStr, 14) // include upcoming work for context

  const [sessionRows, perf, kpis, wellnessRows, painRows, goal] = await Promise.all([
    db
      .select({
        scheduledDate: plannedWorkoutDays.scheduledDate,
        sessionKind: plannedSessions.sessionKind,
        status: plannedSessions.status,
        isRunSession: plannedSessions.isRunSession,
      })
      .from(plannedSessions)
      .innerJoin(plannedWorkoutDays, eq(plannedSessions.plannedDayId, plannedWorkoutDays.id))
      .where(
        and(
          eq(plannedSessions.userId, userId),
          gte(plannedWorkoutDays.scheduledDate, windowStart),
          lte(plannedWorkoutDays.scheduledDate, windowEnd),
        ),
      )
      .catch(() => [] as AdherenceSessionRecord[]),
    computePerformance(userId).catch(() => ({ ctl: null, atl: null, tsb: null })),
    getKpiSnapshot(userId).catch(() => null),
    db
      .select({
        calendarDate: dailyWellness.calendarDate,
        hrvLastNightAvg: dailyWellness.hrvLastNightAvg,
        sleepScore: dailyWellness.sleepScore,
      })
      .from(dailyWellness)
      .where(
        and(
          eq(dailyWellness.userId, userId),
          gte(dailyWellness.calendarDate, windowStart),
          lte(dailyWellness.calendarDate, todayStr),
        ),
      )
      .orderBy(desc(dailyWellness.calendarDate))
      .catch(() => [] as Array<{ calendarDate: string; hrvLastNightAvg: number | null; sleepScore: number | null }>),
    db
      .select({
        location: painFlags.location,
        side: painFlags.side,
        level: painFlags.level,
        firstNotedDate: painFlags.firstNotedDate,
      })
      .from(painFlags)
      .where(and(eq(painFlags.userId, userId), isNull(painFlags.resolvedAt)))
      .catch(() => [] as Array<{ location: string; side: string | null; level: string; firstNotedDate: string }>),
    getActiveGoal(userId).catch(() => null),
  ])

  const adherence = computeAdherence(sessionRows as AdherenceSessionRecord[], todayStr)

  const sevenDayCutoff = shiftDate(todayStr, -7)
  const last7 = wellnessRows.filter((r) => r.calendarDate >= sevenDayCutoff)

  const readiness = kpis ? computeReadiness(kpis) : null

  const evidence: PlanReviewEvidence = {
    windowDays: REVIEW_WINDOW_DAYS,
    asOfDate: todayStr,
    goal: goal
      ? {
          summary: describeGoal(goal, "imperial"),
          targetDate: goal.targetDate,
          weeksRemaining: goal.targetDate ? weeksBetween(todayStr, goal.targetDate) : null,
          targetPacePerMile: fmtGoalPace(resolveTargetPaceMinPerKm(goal), "imperial"),
        }
      : null,
    adherence: {
      completionRatePct: ratePct(adherence.completionRate),
      completed: adherence.completed,
      skipped: adherence.skipped,
      missed: adherence.missed,
      rescheduled: adherence.rescheduled,
      upcoming: adherence.upcoming,
      longestMissStreak: adherence.longestMissStreak,
      byKind: Object.fromEntries(
        Object.entries(adherence.byKind).map(([kind, v]) => [
          kind,
          {
            planned: v.planned,
            completed: v.completed,
            skipped: v.skipped,
            completionRatePct: ratePct(v.completionRate),
          },
        ]),
      ),
    },
    trainingLoad: {
      fitnessCtl: perf.ctl,
      fatigueAtl: perf.atl,
      formTsb: perf.tsb,
    },
    fitness: {
      weeklyMileage: kpis?.weeklyMileage ? fmtDistance(kpis.weeklyMileage) : null,
      easyPaceAt140: kpis?.easyPaceAt140Mps ? fmtPace(kpis.easyPaceAt140Mps) : null,
      thresholdPace: kpis?.thresholdSpeedMps ? fmtPace(kpis.thresholdSpeedMps) : null,
      longestRun: kpis?.longRunDistanceM ? fmtDistance(kpis.longRunDistanceM) : null,
      recentWorkoutCount: kpis?.recentWorkoutCount ?? 0,
      readinessScore: readiness?.total ?? null,
      readinessConfidence: readiness?.confidenceLabel ?? null,
    },
    wellness: {
      hrv7dAvg: avg(last7.map((r) => r.hrvLastNightAvg)),
      hrv28dAvg: avg(wellnessRows.map((r) => r.hrvLastNightAvg)),
      sleepScore7dAvg: avg(last7.map((r) => r.sleepScore)),
      daysWithData: wellnessRows.length,
    },
    activePainFlags: painRows.map((p) => ({
      location: p.location,
      side: p.side,
      level: p.level,
      sinceDate: p.firstNotedDate,
    })),
    planStructure: summarizePlanStructure(planJson),
  }

  return { evidence, planJson, planVersionId: planVersion.id }
}

/**
 * The most recent plan review for an athlete, with the proposals it produced.
 * Read-only; lives in the service layer so it is never reachable as a server
 * action taking an arbitrary user id.
 */
export async function getLatestReview(userId: string) {
  const analysisRows = await db
    .select()
    .from(coachingAnalyses)
    .where(
      and(
        eq(coachingAnalyses.userId, userId),
        eq(coachingAnalyses.analysisType, "plan_review"),
      ),
    )
    .orderBy(desc(coachingAnalyses.createdAt))
    .limit(1)
    .catch(() => [])

  const analysis = analysisRows[0]
  if (!analysis) return null

  const proposals = await db
    .select()
    .from(planChangeProposals)
    .where(
      and(
        eq(planChangeProposals.userId, userId),
        eq(planChangeProposals.coachingAnalysisId, analysis.id),
      ),
    )
    .orderBy(desc(planChangeProposals.createdAt))
    .catch(() => [])

  return { analysis, proposals }
}
