import { describe, it, expect } from "vitest"
import { resolveWeeklyMileageTarget, computeSessionTargets } from "./targets"
import { METERS_PER_MILE } from "@/lib/goals/goal"
import type { ProgressionBlock } from "./types"

const BLOCKS: ProgressionBlock[] = [
  { blockNumber: 1, buildMinMi: 20, buildMaxMi: 22, cutbackMinMi: 15, cutbackMaxMi: 17 },
  { blockNumber: 2, buildMinMi: 22, buildMaxMi: 24, cutbackMinMi: 17, cutbackMaxMi: 19 },
  { blockNumber: 3, buildMinMi: 24, buildMaxMi: 26, cutbackMinMi: 19, cutbackMaxMi: 21 },
]

describe("resolveWeeklyMileageTarget", () => {
  it("returns null when there are no progression blocks", () => {
    expect(resolveWeeklyMileageTarget(undefined, 4, 0, false)).toBeNull()
    expect(resolveWeeklyMileageTarget([], 4, 0, false)).toBeNull()
  })

  it("returns null when the cycle has no weeks", () => {
    expect(resolveWeeklyMileageTarget(BLOCKS, 0, 0, false)).toBeNull()
  })

  it("uses block 1's build midpoint for the first pass through the cycle", () => {
    const result = resolveWeeklyMileageTarget(BLOCKS, 4, 0, false)
    expect(result).toEqual({ targetMi: 21, isCutback: false })
  })

  it("uses block 1's cutback midpoint on a cutback week within the first pass", () => {
    const result = resolveWeeklyMileageTarget(BLOCKS, 4, 3, true)
    expect(result).toEqual({ targetMi: 16, isCutback: true })
  })

  it("advances to block 2 after one full pass through a 4-week cycle", () => {
    const result = resolveWeeklyMileageTarget(BLOCKS, 4, 4, false)
    expect(result).toEqual({ targetMi: 23, isCutback: false })
  })

  it("advances to block 3 after two full passes", () => {
    const result = resolveWeeklyMileageTarget(BLOCKS, 4, 8, false)
    expect(result).toEqual({ targetMi: 25, isCutback: false })
  })

  it("clamps to the last authored block once the plan outlasts them", () => {
    const result = resolveWeeklyMileageTarget(BLOCKS, 4, 40, false)
    expect(result).toEqual({ targetMi: 25, isCutback: false })
  })

  it("clamps a negative weekOrdinal (dates before the plan's own cycle start) to block 1", () => {
    const result = resolveWeeklyMileageTarget(BLOCKS, 4, -3, false)
    expect(result).toEqual({ targetMi: 21, isCutback: false })
  })
})

describe("computeSessionTargets", () => {
  const WEEK_KINDS = ["easy", "recovery", "long", "threshold"] as const

  it("omits distance for a kind with no volume weight (e.g. strength)", () => {
    const result = computeSessionTargets(
      "strength", [...WEEK_KINDS], { targetMi: 20, isCutback: false }, null
    )
    expect(result.targetDistanceM).toBeUndefined()
  })

  it("splits the weekly target proportionally by relative weight", () => {
    // weights: easy=1, recovery=0.6, long=3, threshold=1.5 -> total 6.1
    const weeklyTarget = { targetMi: 20, isCutback: false }
    const long = computeSessionTargets("long", [...WEEK_KINDS], weeklyTarget, null)
    const easy = computeSessionTargets("easy", [...WEEK_KINDS], weeklyTarget, null)
    const recovery = computeSessionTargets("recovery", [...WEEK_KINDS], weeklyTarget, null)

    const totalWeight = 1 + 0.6 + 3 + 1.5
    expect(long.targetDistanceM).toBeCloseTo(20 * (3 / totalWeight) * METERS_PER_MILE, 3)
    expect(easy.targetDistanceM).toBeCloseTo(20 * (1 / totalWeight) * METERS_PER_MILE, 3)
    expect(recovery.targetDistanceM).toBeCloseTo(20 * (0.6 / totalWeight) * METERS_PER_MILE, 3)
    // Long run should always get the largest single share
    expect(long.targetDistanceM!).toBeGreaterThan(easy.targetDistanceM!)
    expect(easy.targetDistanceM!).toBeGreaterThan(recovery.targetDistanceM!)
  })

  it("omits distance entirely when there is no weekly mileage target", () => {
    const result = computeSessionTargets("long", [...WEEK_KINDS], null, null)
    expect(result.targetDistanceM).toBeUndefined()
  })

  it("omits pace and duration when there is no threshold pace to derive them from", () => {
    const result = computeSessionTargets(
      "easy", [...WEEK_KINDS], { targetMi: 20, isCutback: false }, null
    )
    expect(result.targetPaceMinPerKm).toBeUndefined()
    expect(result.targetDurationSecs).toBeUndefined()
  })

  it("derives pace as a ratio of the threshold pace, slower for easier kinds", () => {
    const thresholdPace = 5.0 // min/km
    const threshold = computeSessionTargets("threshold", [...WEEK_KINDS], null, thresholdPace)
    const easy = computeSessionTargets("easy", [...WEEK_KINDS], null, thresholdPace)
    const recovery = computeSessionTargets("recovery", [...WEEK_KINDS], null, thresholdPace)

    expect(threshold.targetPaceMinPerKm).toBeCloseTo(5.0, 5)
    // A slower pace is a larger min/km number
    expect(easy.targetPaceMinPerKm!).toBeGreaterThan(threshold.targetPaceMinPerKm!)
    expect(recovery.targetPaceMinPerKm!).toBeGreaterThan(easy.targetPaceMinPerKm!)
  })

  it("computes duration from distance and pace when both are available", () => {
    const result = computeSessionTargets(
      "easy", [...WEEK_KINDS], { targetMi: 20, isCutback: false }, 5.0
    )
    expect(result.targetDistanceM).toBeDefined()
    expect(result.targetPaceMinPerKm).toBeDefined()
    const expectedSecs = (result.targetDistanceM! / 1000) * result.targetPaceMinPerKm! * 60
    expect(result.targetDurationSecs).toBeCloseTo(expectedSecs, 5)
  })

  it("omits duration when distance is available but pace is not", () => {
    const result = computeSessionTargets(
      "easy", [...WEEK_KINDS], { targetMi: 20, isCutback: false }, null
    )
    expect(result.targetDistanceM).toBeDefined()
    expect(result.targetDurationSecs).toBeUndefined()
  })
})
