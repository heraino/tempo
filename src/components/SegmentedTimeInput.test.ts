import { describe, it, expect } from "vitest"
import { seedSegmentValues, combineSegmentValues } from "./SegmentedTimeInput"
import { parseDurationToSecs, parsePaceToMinPerKm, durationToInputValue, paceToInputValue } from "@/lib/goals/goal"

describe("seedSegmentValues", () => {
  it("right-aligns a 2-part seed onto 3 segments, leaving hours blank", () => {
    expect(seedSegmentValues("45:00", 3)).toEqual(["", "45", "00"])
  })

  it("fills all 3 segments from a 3-part seed", () => {
    expect(seedSegmentValues("1:45:00", 3)).toEqual(["1", "45", "00"])
  })

  it("fills 2 segments from a 2-part seed", () => {
    expect(seedSegmentValues("8:00", 2)).toEqual(["8", "00"])
  })

  it("returns all-blank for an empty seed", () => {
    expect(seedSegmentValues("", 3)).toEqual(["", "", ""])
  })
})

describe("combineSegmentValues", () => {
  it("returns empty when nothing was touched", () => {
    expect(combineSegmentValues(["", "", ""])).toBe("")
    expect(combineSegmentValues(["", ""])).toBe("")
  })

  it("fills blank segments with 0 once anything is touched", () => {
    expect(combineSegmentValues(["", "45", ""])).toBe("0:45:00")
  })

  it("pads non-first segments to 2 digits", () => {
    expect(combineSegmentValues(["1", "5", "3"])).toBe("1:05:03")
  })

  it("does not pad the first (hours) segment", () => {
    expect(combineSegmentValues(["1", "45", "00"])).toBe("1:45:00")
  })

  it("handles a 2-segment (pace) input", () => {
    expect(combineSegmentValues(["8", "3"])).toBe("8:03")
  })
})

describe("end-to-end: segment entry parses the same as the value it seeded from", () => {
  it("round-trips a 3-part duration through segments and back to seconds", () => {
    const original = 6300 // 1:45:00
    const seed = durationToInputValue(original)
    const values = seedSegmentValues(seed, 3)
    const combined = combineSegmentValues(values)
    expect(parseDurationToSecs(combined)).toBe(original)
  })

  it("round-trips a 2-part duration (no hours) through 3 segments", () => {
    const original = 1500 // 25:00 — no hours typed, hour segment stays blank
    const seed = durationToInputValue(original)
    const values = seedSegmentValues(seed, 3)
    const combined = combineSegmentValues(values)
    expect(combined).toBe("0:25:00")
    expect(parseDurationToSecs(combined)).toBe(original)
  })

  it("round-trips a pace through 2 segments", () => {
    const original = 5 // 5:00/km
    const seed = paceToInputValue(original, "metric")
    const values = seedSegmentValues(seed, 2)
    const combined = combineSegmentValues(values)
    expect(parsePaceToMinPerKm(combined, "metric")).toBeCloseTo(original, 6)
  })

  it("what the athlete types (H blank, M='45', S='00') parses as 45 minutes flat", () => {
    // Reproduces the reported bug's fix: no colon typed, just three boxes filled
    const combined = combineSegmentValues(["", "45", "00"])
    expect(parseDurationToSecs(combined)).toBe(2700)
  })
})
