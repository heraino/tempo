import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { computeKpiSnapshot, type KpiSnapshot } from "@/lib/analytics/kpis"
import { heuristicClassify } from "@/lib/analytics/classify"

export type { KpiSnapshot }

const EXCLUDED_INTENSITIES = new Set(["warmup", "cooldown", "rest", "recovery"])

function qualityLapStats(laps: Record<string, unknown>[], kind: string) {
  const quality = laps.filter((lap) => {
    const intensity = lap.intensity as string | undefined
    if (intensity && EXCLUDED_INTENSITIES.has(intensity)) return false
    const spd = (lap.avg_speed ?? lap.enhanced_avg_speed) as number | undefined
    if (spd != null && spd < 1.85) return false
    const hr = lap.avg_heart_rate as number | undefined
    if (kind === "threshold" && hr != null && hr < 145) return false
    if (kind === "tempo" && hr != null && hr < 135) return false
    return true
  })
  if (quality.length === 0) return null
  let dist = 0, time = 0, cadSum = 0, cadCount = 0
  let hrSum = 0, hrCount = 0, hrMax = 0
  for (const lap of quality) {
    dist += (lap.total_distance as number | undefined) ?? 0
    time += ((lap.total_timer_time ?? lap.total_elapsed_time) as number | undefined) ?? 0
    const cad = (lap.avg_running_cadence ?? lap.avg_cadence) as number | undefined
    if (cad) { cadSum += cad; cadCount++ }
    const hr = lap.avg_heart_rate as number | undefined
    if (hr) { hrSum += hr; hrCount++; if (hr > hrMax) hrMax = hr }
  }
  return {
    avgSpeedMps: time > 0 ? dist / time : null,
    avgCadence: cadCount > 0 ? Math.round(cadSum / cadCount) : null,
    avgHr: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
    maxHr: hrMax > 0 ? hrMax : null,
  }
}

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
      firstHalfAvgHr: workoutLogs.firstHalfAvgHr,
      secondHalfAvgHr: workoutLogs.secondHalfAvgHr,
      avgCadence: workoutLogs.avgCadence,
      sessionKindOverride: workoutLogs.sessionKindOverride,
      observedSessionKind: workoutLogs.observedSessionKind,
      laps: workoutLogs.laps,
    })
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(desc(workoutLogs.startTime))
    .limit(30)

  const enriched = rows.map((w) => {
    const kind = w.sessionKindOverride ?? w.observedSessionKind ?? heuristicClassify({
      totalTimerSecs: w.totalTimerSecs,
      totalDistanceM: w.totalDistanceM,
      avgHr: w.avgHr,
    })
    const laps = (w.laps as Record<string, unknown>[] | null) ?? []
    const isQuality = kind === "threshold" || kind === "tempo"
    const qStats = isQuality && laps.length > 0 ? qualityLapStats(laps, kind) : null
    return {
      ...w,
      observedSessionKind: kind,
      qualitySpeedMps: qStats?.avgSpeedMps ?? null,
      qualityCadence: qStats?.avgCadence ?? null,
      qualityAvgHr: qStats?.avgHr ?? null,
      qualityMaxHr: qStats?.maxHr ?? null,
    }
  })

  return computeKpiSnapshot(enriched, Date.now())
}
