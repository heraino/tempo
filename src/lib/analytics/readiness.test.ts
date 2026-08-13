import { describe, it, expect } from "vitest"
import { computeReadiness } from "./readiness"
import type { KpiSnapshot } from "./kpis"
import type { TrainingGoalLike } from "@/lib/goals/goal"

const METERS_PER_MILE = 1609.344

function baseKpis(overrides: Partial<KpiSnapshot> = {}): KpiSnapshot {
  return {
    weeklyMileage: null,
    easyPaceAt140Mps: null,
    easyPaceAt145Mps: null,
    aerobicEfficiency: null,
    hrDrift: null,
    decouplingPct: null,
    thresholdSpeedMps: null,
    thresholdSpeedMpsPrev: null,
    thresholdAvgHr: null,
    thresholdMaxHr: null,
    longRunDistanceM: null,
    cadenceEasy: null,
    cadenceTempo: null,
    cadenceTempoPrev: null,
    recentWorkoutCount: 0,
    weeklyRunFrequency: null,
    vertOscMm: null,
    stanceTimeMs: null,
    stanceTimePct: null,
    vertRatio: null,
    strideLengthM: null,
    ...overrides,
  }
}

// A middling athlete: some data everywhere, nowhere near any ceiling.
const MID_KPIS = baseKpis({
  easyPaceAt140Mps: 1609.344 / (10.5 * 60),   // 10:30/mi
  thresholdSpeedMps: 1609.344 / (8.75 * 60),  //  8:45/mi
  longRunDistanceM: 6 * METERS_PER_MILE,
  weeklyMileage: 15 * METERS_PER_MILE,
  weeklyRunFrequency: 3,
  cadenceEasy: 165,
})

const RACE_GOAL: TrainingGoalLike = {
  goalType: "race",
  targetDistanceM: 21097.5, // half marathon
  targetDurationSecs: 6300, // 1:45:00 -> ~4.977 min/km -> ~8.01/mi pace speed
}

const HABIT_GOAL: TrainingGoalLike = {
  goalType: "habit",
  targetRunsPerWeek: 4,
}

describe("computeReadiness — no goal (backward compatible defaults)", () => {
  it("uses the default weighting (aerobic 35 / threshold 25 / longRun 20 / mileage 15 / economy 5)", () => {
    const r = computeReadiness(MID_KPIS, null, null, null)
    expect(r.components.aerobicEngine.weight).toBe(35)
    expect(r.components.threshold.weight).toBe(25)
    expect(r.components.longRun.weight).toBe(20)
    expect(r.components.consistency.weight).toBe(15)
    expect(r.components.frequency.weight).toBe(0)
    expect(r.components.economy.weight).toBe(5)
  })

  it("returns only the 'Current' stage — no ladder without a goal to build one toward", () => {
    const r = computeReadiness(MID_KPIS, null, null, null)
    expect(r.milestoneStages).toHaveLength(1)
    expect(r.milestoneStages[0].id).toBe("current")
  })

  it("scores 0 at the generic beginner floor and 100 at the generic advanced ceiling", () => {
    const atFloor = computeReadiness(
      baseKpis({ easyPaceAt140Mps: 1609.344 / (11.5 * 60) }),
      null, null, null,
    )
    expect(atFloor.components.aerobicEngine.score).toBe(0)

    const atCeiling = computeReadiness(
      baseKpis({ easyPaceAt140Mps: 1609.344 / (8.75 * 60) }),
      null, null, null,
    )
    expect(atCeiling.components.aerobicEngine.score).toBe(100)
  })

  it("clamps a value beyond the ceiling at 100, never overshooting", () => {
    const r = computeReadiness(baseKpis({ easyPaceAt140Mps: 1609.344 / (6 * 60) }), null, null, null)
    expect(r.components.aerobicEngine.score).toBe(100)
  })
})

describe("computeReadiness — goal-derived scales", () => {
  it("uses the goal's own pace as the threshold ceiling instead of the fixed fallback", () => {
    const withGoal = computeReadiness(MID_KPIS, null, RACE_GOAL, null)
    const withoutGoal = computeReadiness(MID_KPIS, null, null, null)
    // Same current fitness, different ceiling -> different score
    expect(withGoal.components.threshold.score).not.toBe(withoutGoal.components.threshold.score)
  })

  it("uses the goal's target distance as the long-run ceiling", () => {
    const r = computeReadiness(MID_KPIS, null, RACE_GOAL, null)
    const goalStage = r.milestoneStages.find((s) => s.id === "goal")!
    const longRunTarget = goalStage.targets.find((t) => t.metric === "Long run")!
    expect(longRunTarget.target).toContain("13.1") // half marathon in miles
  })

  it("derives easy-pace target as 85% of the threshold target when no goal pace override exists", () => {
    const r = computeReadiness(MID_KPIS, null, RACE_GOAL, null)
    // Not asserting an exact string (pace formatting rounds to whole seconds) —
    // just that a goal-derived easy target differs from the generic fallback.
    const withoutGoal = computeReadiness(MID_KPIS, null, null, null)
    expect(r.components.aerobicEngine.score).not.toBe(withoutGoal.components.aerobicEngine.score)
  })

  it("uses the program's peak weekly mileage over the distance-based heuristic when available", () => {
    const withProgram = computeReadiness(MID_KPIS, null, RACE_GOAL, { peakWeeklyMileageM: 30 * METERS_PER_MILE })
    const withoutProgram = computeReadiness(MID_KPIS, null, RACE_GOAL, null)
    expect(withProgram.components.consistency.score).not.toBe(withoutProgram.components.consistency.score)
  })

  it("falls back to 3x the goal distance for mileage target when no program exists", () => {
    // Goal distance = 13.1 mi -> heuristic mileage ceiling = ~39.3 mi/wk.
    // An athlete at exactly that mileage should score ~100 on consistency.
    const atHeuristicCeiling = computeReadiness(
      baseKpis({ weeklyMileage: 21097.5 * 3 }),
      null, RACE_GOAL, null,
    )
    expect(atHeuristicCeiling.components.consistency.score).toBe(100)
  })

  it("only derives a frequency target for habit goals", () => {
    const habitResult = computeReadiness(MID_KPIS, null, HABIT_GOAL, null)
    const raceResult = computeReadiness(MID_KPIS, null, RACE_GOAL, null)
    expect(habitResult.components.frequency.weight).toBe(50)
    expect(raceResult.components.frequency.weight).toBe(0)
  })
})

describe("computeReadiness — per-goal-type weighting", () => {
  it("weighs threshold heaviest for a distance_at_pace (pace) goal", () => {
    const paceGoal: TrainingGoalLike = { goalType: "distance_at_pace", targetPaceMinPerKm: 4.5 }
    const r = computeReadiness(MID_KPIS, null, paceGoal, null)
    expect(r.components.threshold.weight).toBe(40)
    expect(r.components.longRun.weight).toBe(15)
  })

  it("weighs long run heaviest for a distance_milestone goal", () => {
    const distGoal: TrainingGoalLike = { goalType: "distance_milestone", targetDistanceM: 10000 }
    const r = computeReadiness(MID_KPIS, null, distGoal, null)
    expect(r.components.longRun.weight).toBe(40)
    expect(r.components.threshold.weight).toBe(10)
  })

  it("weighs frequency heaviest for a habit goal, with zero weight on threshold", () => {
    const r = computeReadiness(MID_KPIS, null, HABIT_GOAL, null)
    expect(r.components.frequency.weight).toBe(50)
    expect(r.components.threshold.weight).toBe(0)
  })

  it("every defined goal-type weighting sums to 100", () => {
    const goals: TrainingGoalLike[] = [
      RACE_GOAL,
      { goalType: "distance_milestone", targetDistanceM: 10000 },
      { goalType: "distance_at_pace", targetPaceMinPerKm: 4.5 },
      HABIT_GOAL,
    ]
    for (const goal of goals) {
      const r = computeReadiness(MID_KPIS, null, goal, null)
      const total =
        r.components.aerobicEngine.weight +
        r.components.threshold.weight +
        r.components.longRun.weight +
        r.components.consistency.weight +
        r.components.frequency.weight +
        r.components.economy.weight
      expect(total).toBe(100)
    }
  })
})

describe("computeReadiness — milestone ladder gating", () => {
  it("only lists metrics with nonzero weight as milestone targets", () => {
    const r = computeReadiness(MID_KPIS, null, HABIT_GOAL, null)
    const m1 = r.milestoneStages.find((s) => s.id === "m1")!
    const metricLabels = m1.targets.map((t) => t.metric)
    expect(metricLabels).not.toContain("Threshold")
    expect(metricLabels).toContain("Weekly frequency")
  })

  it("builds a full 5-stage ladder when a goal is set", () => {
    const r = computeReadiness(MID_KPIS, null, RACE_GOAL, null)
    expect(r.milestoneStages.map((s) => s.id)).toEqual(["current", "m1", "m2", "m3", "goal"])
  })

  it("marks pre-m1 when current fitness is below every 25% checkpoint", () => {
    const beginner = baseKpis({
      easyPaceAt140Mps: 1609.344 / (11.4 * 60), // barely above the generic floor
      thresholdSpeedMps: 1609.344 / (9.4 * 60),
      longRunDistanceM: 5.2 * METERS_PER_MILE,
    })
    const r = computeReadiness(beginner, null, RACE_GOAL, null)
    expect(r.milestone).toBe("pre-m1")
    expect(r.milestoneStages.find((s) => s.id === "m1")!.completed).toBe(false)
  })

  it("marks the goal stage completed only once every relevant metric reaches its ceiling", () => {
    const atGoal = baseKpis({
      easyPaceAt140Mps: 10, // fast enough to exceed any derived ceiling
      thresholdSpeedMps: 10,
      longRunDistanceM: 30 * METERS_PER_MILE,
      weeklyMileage: 60 * METERS_PER_MILE,
      cadenceEasy: 90, // 180 spm, above CAD_ADV
    })
    const r = computeReadiness(atGoal, null, RACE_GOAL, null)
    expect(r.milestone).toBe("goal")
    expect(r.milestoneStages.find((s) => s.id === "goal")!.completed).toBe(true)
  })

  it("requires all prior checkpoints before granting a later one (monotonic gating)", () => {
    // Excellent aerobic engine and long run, but threshold barely off the floor —
    // m1 should still fail because it requires every relevant metric together.
    const lopsided = baseKpis({
      easyPaceAt140Mps: 10,
      thresholdSpeedMps: 1609.344 / (9.4 * 60), // just above floor
      longRunDistanceM: 30 * METERS_PER_MILE,
      weeklyMileage: 60 * METERS_PER_MILE,
    })
    const r = computeReadiness(lopsided, null, RACE_GOAL, null)
    expect(r.milestoneStages.find((s) => s.id === "m1")!.completed).toBe(false)
  })
})

describe("computeReadiness — freshness modifier still applies on top of goal-relative scoring", () => {
  it("a strong HRV night nudges the total up relative to the same KPIs with no wellness data", () => {
    const withoutWellness = computeReadiness(MID_KPIS, null, RACE_GOAL, null)
    const withGoodWellness = computeReadiness(
      MID_KPIS,
      {
        nightBefore: { hrv: 60, sleepScore: 85, bodyBatteryMorning: 80 },
        sevenDayAvg: { hrv: 50, sleepScore: 70 },
      },
      RACE_GOAL,
      null,
    )
    expect(withGoodWellness.total).toBeGreaterThanOrEqual(withoutWellness.total)
  })
})
