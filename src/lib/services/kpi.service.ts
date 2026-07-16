import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { computeKpiSnapshot, type KpiSnapshot } from "@/lib/analytics/kpis"

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
    })
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(desc(workoutLogs.startTime))
    .limit(30)

  return computeKpiSnapshot(rows, Date.now())
}
