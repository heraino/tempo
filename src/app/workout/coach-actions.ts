"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { workoutLogs, coachingAnalyses, athleteContexts } from "@/lib/db/schema"
import { and, eq, desc } from "drizzle-orm"
import { nebiusChat } from "@/lib/ai/nebius"
import { getKpiSnapshot } from "@/lib/services/kpi.service"
import { computeReadiness } from "@/lib/analytics/readiness"
import { fmtPace, fmtDistance, fmtDuration } from "@/lib/fmt"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const ANALYTICS_VERSION = "1.0"

const CoachOutputSchema = z.object({
  headline: z.string(),
  grade: z.string().nullable().optional(),
  data: z.object({
    workoutType: z.string(),
    keyMetrics: z.string(),
    conditions: z.string(),
    segmentSummary: z.string().optional(),
  }),
  calculations: z.object({
    summary: z.string(),
  }),
  athleteReport: z.string(),
  interpretation: z.string(),
  decision: z.string(),
  positiveSignals: z.array(z.string()).default([]),
  cautionarySignals: z.array(z.string()).default([]),
  neutralSignals: z.array(z.string()).default([]),
})

export type CoachOutput = z.infer<typeof CoachOutputSchema>

const NotebookSchema = z.object({
  summary: z.string(),
  trajectory: z.enum(["improving", "plateauing", "declining", "insufficient_data"]),
  strengths: z.array(z.string()),
  limiters: z.array(z.string()),
  nextUnlock: z.string(),
})

export type NotebookEntry = z.infer<typeof NotebookSchema>

function mpsToMinPerMile(mps: number | null | undefined): string {
  return fmtPace(mps ?? null)
}

async function generateAndSaveNotebook(
  userId: string,
  workoutId: string,
  kpis: Awaited<ReturnType<typeof getKpiSnapshot>>,
): Promise<void> {
  const readiness = computeReadiness(kpis)

  // Fetch last 5 workout analyses for context
  const recentAnalyses = await db
    .select({
      headline: coachingAnalyses.headline,
      grade: coachingAnalyses.grade,
      createdAt: coachingAnalyses.createdAt,
    })
    .from(coachingAnalyses)
    .where(and(
      eq(coachingAnalyses.userId, userId),
      eq(coachingAnalyses.analysisType, "workout"),
    ))
    .orderBy(desc(coachingAnalyses.createdAt))
    .limit(5)

  const contextSnapshot = {
    readiness: {
      total: readiness.total,
      milestone: readiness.milestone,
      milestoneLabel: readiness.milestoneLabel,
      confidence: readiness.confidence,
      confidenceLabel: readiness.confidenceLabel,
      components: {
        aerobicEngine: { score: readiness.components.aerobicEngine.score, detail: readiness.components.aerobicEngine.detail },
        threshold: { score: readiness.components.threshold.score, detail: readiness.components.threshold.detail },
        longRun: { score: readiness.components.longRun.score, detail: readiness.components.longRun.detail },
        consistency: { score: readiness.components.consistency.score, detail: readiness.components.consistency.detail },
        economy: { score: readiness.components.economy.score, detail: readiness.components.economy.detail },
      },
    },
    kpis: {
      easyPaceAt140: mpsToMinPerMile(kpis.easyPaceAt140Mps),
      thresholdPace: mpsToMinPerMile(kpis.thresholdSpeedMps),
      lastLongRun: kpis.longRunDistanceM ? fmtDistance(kpis.longRunDistanceM) : null,
      weeklyMileage: kpis.weeklyMileage ? fmtDistance(kpis.weeklyMileage) : null,
      cadenceEasy: kpis.cadenceEasy ? kpis.cadenceEasy * 2 : null,
      cadenceTempo: kpis.cadenceTempo ? kpis.cadenceTempo * 2 : null,
      recentWorkoutCount: kpis.recentWorkoutCount,
    },
    recentWorkouts: recentAnalyses.map((a) => ({
      headline: a.headline,
      grade: a.grade,
    })),
    goal: {
      event: "half marathon",
      targetPacePerMile: "7:20/mi",
      targetAge: 50,
    },
  }

  const systemPrompt = `You are an experienced running coach keeping a longitudinal notebook on an athlete's trajectory toward a half marathon at 7:20/mile pace by age 50. You receive structured data about their current fitness and recent workout history.

Write a brief notebook entry that observes patterns and trends — not just today's workout. Think like a coach who has been following this athlete for weeks.

Rules:
- Be specific; cite actual paces, distances, or trends from the data
- Never diagnose injury or prescribe medical treatment
- Keep language direct and actionable
- trajectory must be one of: "improving", "plateauing", "declining", "insufficient_data"

Respond with ONLY a valid JSON object:
{
  "summary": "2-3 sentence overall trajectory assessment",
  "trajectory": "improving" | "plateauing" | "declining" | "insufficient_data",
  "strengths": ["up to 3 specific strengths observed from data"],
  "limiters": ["up to 3 specific limiters holding back progress"],
  "nextUnlock": "one sentence: what physiological or training adaptation is most likely to unlock next, and what will drive it"
}`

  const userPrompt = `Athlete data:\n\n${JSON.stringify(contextSnapshot, null, 2)}`

  let rawResponse: string
  try {
    rawResponse = await nebiusChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, maxTokens: 800 },
    )
  } catch {
    return // fail silently — notebook is non-critical
  }

  const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return

  let parsed: NotebookEntry
  try {
    parsed = NotebookSchema.parse(JSON.parse(jsonMatch[0]))
  } catch {
    return
  }

  await db.insert(coachingAnalyses).values({
    id: crypto.randomUUID(),
    userId,
    workoutLogId: workoutId,
    analysisType: "notebook",
    provider: "nebius",
    model: process.env.NEBIUS_MODEL ?? "meta-llama/Meta-Llama-3.1-70B-Instruct",
    analyticsVersion: ANALYTICS_VERSION,
    promptText: userPrompt,
    contextSnapshot,
    responseRaw: rawResponse,
    responseParsed: parsed,
    headline: parsed.summary.slice(0, 200),
    decision: parsed.nextUnlock,
    grade: null,
    flags: {
      trajectory: parsed.trajectory,
      strengths: parsed.strengths,
      limiters: parsed.limiters,
    },
  })
}

export async function generateCoachingAnalysis(workoutId: string): Promise<{
  ok: boolean
  analysis?: CoachOutput
  error?: string
}> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }
  const userId = session.user.id

  // Fetch workout
  const rows = await db
    .select({ log: workoutLogs })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.id, workoutId), eq(workoutLogs.userId, userId)))
    .limit(1)

  if (!rows[0]) return { ok: false, error: "Workout not found" }
  const { log } = rows[0]

  // Fetch athlete context
  const ctxRows = await db
    .select()
    .from(athleteContexts)
    .where(eq(athleteContexts.workoutLogId, workoutId))
    .limit(1)
  const ctx = ctxRows[0] ?? null

  // KPI snapshot for recent context
  const kpis = await getKpiSnapshot(userId).catch(() => null)

  // Build quality lap stats if threshold/tempo
  const kind = log.sessionKindOverride ?? log.observedSessionKind
  const laps = (log.laps as Record<string, unknown>[] | null) ?? []

  let qualityPaceMps: number | null = null
  let qualityDistM: number | null = null
  let qualityDurSecs: number | null = null
  let qualityCadSpm: number | null = null

  if ((kind === "threshold" || kind === "tempo") && laps.length > 0) {
    const excluded = new Set(["warmup", "cooldown", "rest", "recovery"])
    const hrCutoff = kind === "threshold" ? 145 : 135
    const qualLaps = laps.filter((lap) => {
      const intensity = lap.intensity as string | undefined
      if (intensity && excluded.has(intensity)) return false
      const spd = (lap.avg_speed ?? lap.enhanced_avg_speed) as number | undefined
      if (spd != null && spd < 1.85) return false
      const hr = lap.avg_heart_rate as number | undefined
      if (hr != null && hr < hrCutoff) return false
      return true
    })
    if (qualLaps.length > 0) {
      let dist = 0, time = 0, cadSum = 0, cadN = 0
      for (const lap of qualLaps) {
        dist += (lap.total_distance as number | undefined) ?? 0
        time += ((lap.total_timer_time ?? lap.total_elapsed_time) as number | undefined) ?? 0
        const cad = (lap.avg_running_cadence ?? lap.avg_cadence) as number | undefined
        if (cad) { cadSum += cad; cadN++ }
      }
      qualityPaceMps = time > 0 ? dist / time : null
      qualityDistM = dist
      qualityDurSecs = time
      qualityCadSpm = cadN > 0 ? Math.round(cadSum / cadN) * 2 : null
    }
  }

  const outsideTempF = ctx?.outsideTempC != null
    ? Math.round(ctx.outsideTempC * 9 / 5 + 32)
    : null

  // Build context snapshot
  const contextSnapshot = {
    workout: {
      date: log.startTime instanceof Date
        ? log.startTime.toISOString().slice(0, 10)
        : String(log.startTime).slice(0, 10),
      kind: kind ?? "unknown",
      sport: log.sport ?? "running",
      fullSession: {
        distanceMi: log.totalDistanceM ? (log.totalDistanceM / 1609.344).toFixed(2) : null,
        durationMin: log.totalTimerSecs ? (log.totalTimerSecs / 60).toFixed(1) : null,
        avgPace: mpsToMinPerMile(log.avgSpeedMps),
        avgHr: log.avgHr,
        maxHr: log.maxHr,
        avgCadenceSpm: log.avgCadence ? log.avgCadence * 2 : null,
        hrDriftBpm: log.hrDriftBpm,
        perceivedEffort: log.perceivedEffort,
      },
      qualitySegment: qualityPaceMps
        ? {
            distanceMi: qualityDistM ? (qualityDistM / 1609.344).toFixed(2) : null,
            durationMin: qualityDurSecs ? (qualityDurSecs / 60).toFixed(1) : null,
            avgPace: mpsToMinPerMile(qualityPaceMps),
            avgCadenceSpm: qualityCadSpm,
          }
        : null,
      conditions: {
        outsideTempF,
        feel: ctx?.feel ?? null,
        rpe: ctx?.rpe ?? log.perceivedEffort ?? null,
        notes: log.notes ?? null,
      },
    },
    recentContext: kpis
      ? {
          easyPaceAt140: mpsToMinPerMile(kpis.easyPaceAt140Mps),
          thresholdPace: mpsToMinPerMile(kpis.thresholdSpeedMps),
          lastLongRun: kpis.longRunDistanceM ? fmtDistance(kpis.longRunDistanceM) : null,
          weeklyMileage: kpis.weeklyMileage ? fmtDistance(kpis.weeklyMileage) : null,
        }
      : null,
    goal: {
      event: "half marathon",
      targetPacePerMile: "7:20/mi",
      targetAge: 50,
    },
  }

  const systemPrompt = `You are an experienced running coach analyzing a workout for an athlete training toward a half marathon at 7:20/mile pace by age 50. You receive structured workout data and produce a coaching analysis.

Follow the workflow: DATA → DETERMINISTIC CALCULATIONS → ATHLETE REPORT → COACH INTERPRETATION → DECISION.

Rules:
- Never interpret from whole-session averages alone when quality segment data is available
- Never diagnose injuries or medical conditions
- Never propose structural training-plan changes without flagging them explicitly
- For threshold/tempo runs, base your grade and interpretation on the quality segment, not whole-session averages
- Always contextualize elevated HR relative to temperature
- Be specific, honest, and concise

Respond with ONLY a valid JSON object, no markdown, no prose outside the JSON. Use this exact schema:
{
  "headline": "one sentence characterizing this specific workout",
  "grade": "A" | "B" | "C" | "D" | "F" (grade the execution quality and physiological response, not just speed),
  "data": {
    "workoutType": "e.g. Continuous tempo, Threshold intervals, Easy aerobic",
    "keyMetrics": "brief list of most important numbers from the workout",
    "conditions": "temperature, RPE, notes",
    "segmentSummary": "if quality segment exists, describe it; else omit"
  },
  "calculations": {
    "summary": "aerobic efficiency, HR drift, decoupling note, quality segment pace vs recent threshold"
  },
  "athleteReport": "what the athlete felt/reported, conditions, context",
  "interpretation": "2-3 sentences: what this workout means for the athlete's development toward their goal",
  "decision": "1-2 sentences: what to do next based on this workout",
  "positiveSignals": ["list of positive observations"],
  "cautionarySignals": ["list of cautions or flags"],
  "neutralSignals": ["list of neutral observations"]
}`

  const userPrompt = `Analyze this workout:\n\n${JSON.stringify(contextSnapshot, null, 2)}`

  let rawResponse: string
  try {
    rawResponse = await nebiusChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.15, maxTokens: 2500 },
    )
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI call failed" }
  }

  // Extract JSON from response (handle markdown code fences)
  const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { ok: false, error: "AI returned no JSON" }

  let parsed: CoachOutput
  try {
    parsed = CoachOutputSchema.parse(JSON.parse(jsonMatch[0]))
  } catch {
    return { ok: false, error: "AI response did not match expected schema" }
  }

  // Store workout analysis
  await db.insert(coachingAnalyses).values({
    id: crypto.randomUUID(),
    userId,
    workoutLogId: workoutId,
    analysisType: "workout",
    provider: "nebius",
    model: process.env.NEBIUS_MODEL ?? "meta-llama/Meta-Llama-3.1-70B-Instruct",
    analyticsVersion: ANALYTICS_VERSION,
    promptText: userPrompt,
    contextSnapshot,
    responseRaw: rawResponse,
    responseParsed: parsed,
    headline: parsed.headline,
    decision: parsed.decision,
    grade: parsed.grade ?? null,
    flags: {
      positive: parsed.positiveSignals,
      cautionary: parsed.cautionarySignals,
      neutral: parsed.neutralSignals,
    },
  })

  // Save readiness snapshot (deterministic, no LLM)
  if (kpis) {
    const readiness = computeReadiness(kpis)
    await db.insert(coachingAnalyses).values({
      id: crypto.randomUUID(),
      userId,
      workoutLogId: workoutId,
      analysisType: "readiness_snapshot",
      provider: "deterministic",
      model: "v1",
      analyticsVersion: ANALYTICS_VERSION,
      promptText: null,
      contextSnapshot: kpis as unknown as Record<string, unknown>,
      responseRaw: null,
      responseParsed: {
        total: readiness.total,
        milestone: readiness.milestone,
        confidence: readiness.confidence,
        components: {
          aerobicEngine: readiness.components.aerobicEngine.score,
          threshold: readiness.components.threshold.score,
          longRun: readiness.components.longRun.score,
          consistency: readiness.components.consistency.score,
          economy: readiness.components.economy.score,
        },
      },
      headline: `Readiness ${readiness.total}/100 · ${readiness.milestoneLabel}`,
      decision: null,
      grade: null,
      flags: null,
    })

    // Generate Coach's Notebook (async, non-blocking for the return value)
    await generateAndSaveNotebook(userId, workoutId, kpis).catch(() => {})
  }

  revalidatePath(`/workout/${workoutId}`)
  revalidatePath("/dashboard")
  return { ok: true, analysis: parsed }
}
