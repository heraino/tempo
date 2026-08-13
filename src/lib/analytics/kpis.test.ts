import { describe, it, expect } from "vitest"
import { computeKpiSnapshot, type WorkoutForKpi } from "./kpis"

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date("2026-08-13T12:00:00.000Z").getTime()

function runAt(daysAgo: number, overrides: Partial<WorkoutForKpi> = {}): WorkoutForKpi {
  return {
    id: `run-${daysAgo}`,
    startTime: new Date(NOW - daysAgo * DAY_MS),
    totalTimerSecs: 1800,
    totalDistanceM: 5000,
    avgSpeedMps: 2.78,
    avgHr: 140,
    hrDriftBpm: null,
    avgCadence: 170,
    observedSessionKind: "easy",
    ...overrides,
  }
}

describe("computeKpiSnapshot — weeklyRunFrequency", () => {
  it("returns null when there is no running history at all", () => {
    const snapshot = computeKpiSnapshot([], NOW)
    expect(snapshot.weeklyRunFrequency).toBeNull()
  })

  it("averages runs-in-the-last-28-days over 4 weeks", () => {
    // 8 runs spread across the last 28 days -> 8/4 = 2.0 runs/week
    const workouts = Array.from({ length: 8 }, (_, i) => runAt(i * 3))
    const snapshot = computeKpiSnapshot(workouts, NOW)
    expect(snapshot.weeklyRunFrequency).toBe(2)
  })

  it("ignores runs older than 28 days when averaging", () => {
    const workouts = [runAt(5), runAt(10), runAt(40), runAt(90)]
    const snapshot = computeKpiSnapshot(workouts, NOW)
    // Only the 5- and 10-day-old runs fall in the window: 2/4 = 0.5
    expect(snapshot.weeklyRunFrequency).toBe(0.5)
  })

  it("returns 0 (not null) when running history exists but none of it is recent", () => {
    const workouts = [runAt(60), runAt(90)]
    const snapshot = computeKpiSnapshot(workouts, NOW)
    expect(snapshot.weeklyRunFrequency).toBe(0)
  })

  it("includes a run exactly at the 28-day boundary", () => {
    const workouts = [runAt(28)]
    const snapshot = computeKpiSnapshot(workouts, NOW)
    // 1/4 = 0.25, rounded to 1 decimal place rounds up to 0.3
    expect(snapshot.weeklyRunFrequency).toBe(0.3)
  })

  it("excludes a run just past the 28-day boundary", () => {
    const workouts = [runAt(29)]
    const snapshot = computeKpiSnapshot(workouts, NOW)
    expect(snapshot.weeklyRunFrequency).toBe(0)
  })
})
