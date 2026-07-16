import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { computeKpiSnapshot, type KpiSnapshot } from "@/lib/analytics/kpis"
import { heuristicClassify } from "@/lib/analytics/classify"

export type { KpiSnapshot }

export async function getKpiSnapshot(userId: string): Promise<KpiSnapshot> {
  const rows = await db
    .select({
      id: workoutLogs.id,
      startTime: workoutLogs.startTime,
      totalTimerSecs: workoutLogs.totalTimerSecs,
      totalDistanceM: workoutLogs.totalDistanceM,
      avgSpeedMps: workoutLogs.avgSpeedMps,
      avgHr: workoutLogs.avgHr,
      hrDriftBpm: workoutLogs.hrDriftBpm,
      avgCadence: workoutLogs.avgCadence,
      observedSessionKind: workoutLogs.observedSessionKind,
      sessionKindOverride: workoutLogs.sessionKindOverride,
    })
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(desc(workoutLogs.startTime))
    .limit(30)

  // Apply in-memory classification for workouts uploaded before the backfill.
  // Priority: stored override → stored observed → heuristic.
  const enriched = rows.map((w) => ({
    ...w,
    observedSessionKind:
      w.sessionKindOverride ??
      w.observedSessionKind ??
      heuristicClassify({
        totalTimerSecs: w.totalTimerSecs,
        totalDistanceM: w.totalDistanceM,
        avgHr: w.avgHr,
      }),
  }))

  return computeKpiSnapshot(enriched, Date.now())
}
