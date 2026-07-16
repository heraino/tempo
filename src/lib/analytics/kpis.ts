import { resolveSpeedMps } from "@/lib/fmt"

export interface WorkoutForKpi {
  id: string
  startTime: Date | string
  totalTimerSecs: number | null
  totalDistanceM: number | null
  avgSpeedMps: number | null
  avgHr: number | null
  hrDriftBpm: number | null
  avgCadence: number | null
  observedSessionKind: string | null
  qualitySpeedMps?: number | null
  qualityCadence?: number | null
}

export interface KpiSnapshot {
  weeklyMileage: number | null
  easyPaceAt140Mps: number | null
  aerobicEfficiency: number | null
  hrDrift: number | null
  thresholdSpeedMps: number | null
  thresholdSpeedMpsPrev: number | null
  longRunDistanceM: number | null
  cadenceEasy: number | null
  cadenceTempo: number | null
  cadenceTempoPrev: number | null
  recentWorkoutCount: number
}

export function computeKpiSnapshot(
  workouts: WorkoutForKpi[],
  nowMs: number,
): KpiSnapshot {
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  )

  const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000

  const weeklyM = sorted
    .filter((w) => new Date(w.startTime).getTime() >= sevenDaysAgo)
    .reduce((sum, w) => sum + (w.totalDistanceM ?? 0), 0)

  const lastEasy = sorted.find(
    (w) => w.observedSessionKind === "easy" || w.observedSessionKind === "recovery"
  )
  const tempos = sorted.filter(
    (w) => w.observedSessionKind === "tempo" || w.observedSessionKind === "threshold"
  )
  const lastTempo = tempos[0]
  const prevTempo = tempos[1]
  const thresholds = sorted.filter((w) => w.observedSessionKind === "threshold")
  const lastThreshold = thresholds[0]
  const prevThreshold = thresholds[1]
  const lastLong = sorted.find((w) => w.observedSessionKind === "long")

  let easyPaceAt140Mps: number | null = null
  if (lastEasy?.avgHr && lastEasy.avgHr > 0) {
    const spd = resolveSpeedMps(lastEasy.avgSpeedMps, lastEasy.totalDistanceM, lastEasy.totalTimerSecs)
    if (spd) easyPaceAt140Mps = spd * (140 / lastEasy.avgHr)
  }

  let aerobicEfficiency: number | null = null
  if (lastEasy?.avgHr && lastEasy.avgHr > 0) {
    const spd = resolveSpeedMps(lastEasy.avgSpeedMps, lastEasy.totalDistanceM, lastEasy.totalTimerSecs)
    if (spd) aerobicEfficiency = (spd * 60) / lastEasy.avgHr
  }

  // Prefer quality-lap speed (excludes warmup/cooldown) over whole-workout average
  const thresholdSpeedMps =
    lastThreshold?.qualitySpeedMps ??
    ((lastThreshold?.totalTimerSecs ?? 0) >= 15 * 60
      ? resolveSpeedMps(lastThreshold?.avgSpeedMps ?? null, lastThreshold?.totalDistanceM ?? null, lastThreshold?.totalTimerSecs ?? null)
      : null)

  const thresholdSpeedMpsPrev =
    prevThreshold?.qualitySpeedMps ??
    ((prevThreshold?.totalTimerSecs ?? 0) >= 15 * 60
      ? resolveSpeedMps(prevThreshold?.avgSpeedMps ?? null, prevThreshold?.totalDistanceM ?? null, prevThreshold?.totalTimerSecs ?? null)
      : null)

  return {
    weeklyMileage: weeklyM > 0 ? weeklyM : null,
    easyPaceAt140Mps,
    aerobicEfficiency,
    hrDrift: lastEasy?.hrDriftBpm ?? null,
    thresholdSpeedMps,
    thresholdSpeedMpsPrev,
    longRunDistanceM: lastLong?.totalDistanceM ?? null,
    cadenceEasy: lastEasy?.avgCadence ?? null,
    cadenceTempo: lastTempo?.qualityCadence ?? lastTempo?.avgCadence ?? null,
    cadenceTempoPrev: prevTempo?.qualityCadence ?? prevTempo?.avgCadence ?? null,
    recentWorkoutCount: workouts.length,
  }
}
