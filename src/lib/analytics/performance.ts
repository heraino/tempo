import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { isRunningSport } from "./classify"

export interface PerformanceMetrics {
  ctl: number | null  // Chronic Training Load — 42-day exponential decay (fitness)
  atl: number | null  // Acute Training Load — 7-day exponential decay (fatigue)
  tsb: number | null  // Training Stress Balance — CTL − ATL (form)
}

// Banister impulse-response model constants
const CTL_TC = 42  // chronic time constant (days)
const ATL_TC = 7   // acute time constant (days)
const K_CTL = 1 - Math.exp(-1 / CTL_TC)
const K_ATL = 1 - Math.exp(-1 / ATL_TC)

export async function computePerformance(userId: string): Promise<PerformanceMetrics> {
  // Need ~3× CTL time constant of history for the values to stabilize
  const cutoff = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      startTime: workoutLogs.startTime,
      trainingLoad: workoutLogs.trainingLoad,
      sport: workoutLogs.sport,
    })
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    // Fetch everything >= cutoff; filter non-running after
    .orderBy(desc(workoutLogs.startTime))

  // Filter to running activities (training load is a running-specific metric)
  const running = rows.filter(
    (r) => isRunningSport(r.sport) && r.trainingLoad != null && r.startTime != null
  )

  if (running.length === 0) return { ctl: null, atl: null, tsb: null }

  // Build a date → total load map (multiple runs on the same calendar day sum)
  const loadByDate = new Map<string, number>()
  for (const row of running) {
    if (new Date(row.startTime!) < cutoff) continue
    const dateKey = new Date(row.startTime!).toISOString().slice(0, 10)
    loadByDate.set(dateKey, (loadByDate.get(dateKey) ?? 0) + (row.trainingLoad ?? 0))
  }

  if (loadByDate.size === 0) return { ctl: null, atl: null, tsb: null }

  // Walk day-by-day from earliest date to today, applying exponential decay
  const dates = Array.from(loadByDate.keys()).sort()
  const start = new Date(dates[0] + "T00:00:00Z")
  const todayUTC = new Date()
  todayUTC.setUTCHours(0, 0, 0, 0)

  let ctl = 0
  let atl = 0
  const current = new Date(start)

  while (current <= todayUTC) {
    const key = current.toISOString().slice(0, 10)
    const tl = loadByDate.get(key) ?? 0
    ctl = ctl + K_CTL * (tl - ctl)
    atl = atl + K_ATL * (tl - atl)
    current.setUTCDate(current.getUTCDate() + 1)
  }

  // Return null if the computed values are essentially zero (no real data)
  if (ctl < 0.1) return { ctl: null, atl: null, tsb: null }

  return {
    ctl: Math.round(ctl * 10) / 10,
    atl: Math.round(atl * 10) / 10,
    tsb: Math.round((ctl - atl) * 10) / 10,
  }
}
