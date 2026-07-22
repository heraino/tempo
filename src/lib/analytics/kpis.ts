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
  firstHalfAvgHr?: number | null
  secondHalfAvgHr?: number | null
  observedSessionKind: string | null
  qualitySpeedMps?: number | null
  qualityCadence?: number | null
  qualityAvgHr?: number | null
  qualityMaxHr?: number | null
  // Running dynamics (Garmin-specific; optional — may be null for non-GPS watches)
  avgVerticalOscillationMm?: number | null
  avgStanceTimeMs?: number | null
  avgStanceTimePct?: number | null
  avgVerticalRatio?: number | null
  avgStrideLengthM?: number | null
}

export interface KpiSnapshot {
  weeklyMileage: number | null
  easyPaceAt140Mps: number | null
  easyPaceAt145Mps: number | null
  aerobicEfficiency: number | null
  hrDrift: number | null
  decouplingPct: number | null
  thresholdSpeedMps: number | null
  thresholdSpeedMpsPrev: number | null
  thresholdAvgHr: number | null
  thresholdMaxHr: number | null
  longRunDistanceM: number | null
  cadenceEasy: number | null
  cadenceTempo: number | null
  cadenceTempoPrev: number | null
  recentWorkoutCount: number
  // Running dynamics (from most recent workout that recorded them)
  vertOscMm: number | null
  stanceTimeMs: number | null
  stanceTimePct: number | null
  vertRatio: number | null
  strideLengthM: number | null
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
  let easyPaceAt145Mps: number | null = null
  if (lastEasy?.avgHr && lastEasy.avgHr > 0) {
    const spd = resolveSpeedMps(lastEasy.avgSpeedMps, lastEasy.totalDistanceM, lastEasy.totalTimerSecs)
    if (spd) {
      easyPaceAt140Mps = spd * (140 / lastEasy.avgHr)
      easyPaceAt145Mps = spd * (145 / lastEasy.avgHr)
    }
  }

  let aerobicEfficiency: number | null = null
  if (lastEasy?.avgHr && lastEasy.avgHr > 0) {
    const spd = resolveSpeedMps(lastEasy.avgSpeedMps, lastEasy.totalDistanceM, lastEasy.totalTimerSecs)
    if (spd) aerobicEfficiency = (spd * 60) / lastEasy.avgHr
  }

  // Aerobic decoupling from last easy run: second-half HR drift relative to first half
  let decouplingPct: number | null = null
  if (
    lastEasy?.firstHalfAvgHr != null &&
    lastEasy?.secondHalfAvgHr != null &&
    lastEasy.firstHalfAvgHr > 0
  ) {
    decouplingPct = ((lastEasy.secondHalfAvgHr - lastEasy.firstHalfAvgHr) / lastEasy.firstHalfAvgHr) * 100
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

  // Most recent workout that recorded Garmin running dynamics
  const lastWithDynamics = sorted.find(
    (w) => w.avgVerticalOscillationMm != null || w.avgStanceTimeMs != null || w.avgVerticalRatio != null
  )

  return {
    weeklyMileage: weeklyM > 0 ? weeklyM : null,
    easyPaceAt140Mps,
    easyPaceAt145Mps,
    aerobicEfficiency,
    hrDrift: lastEasy?.hrDriftBpm ?? null,
    decouplingPct,
    thresholdSpeedMps,
    thresholdSpeedMpsPrev,
    thresholdAvgHr: lastThreshold?.qualityAvgHr ?? null,
    thresholdMaxHr: lastThreshold?.qualityMaxHr ?? null,
    longRunDistanceM: lastLong?.totalDistanceM ?? null,
    cadenceEasy: lastEasy?.avgCadence ?? null,
    cadenceTempo: lastTempo?.qualityCadence ?? lastTempo?.avgCadence ?? null,
    cadenceTempoPrev: prevTempo?.qualityCadence ?? prevTempo?.avgCadence ?? null,
    recentWorkoutCount: workouts.length,
    vertOscMm: lastWithDynamics?.avgVerticalOscillationMm ?? null,
    stanceTimeMs: lastWithDynamics?.avgStanceTimeMs ?? null,
    stanceTimePct: lastWithDynamics?.avgStanceTimePct ?? null,
    vertRatio: lastWithDynamics?.avgVerticalRatio ?? null,
    strideLengthM: lastWithDynamics?.avgStrideLengthM ?? null,
  }
}
