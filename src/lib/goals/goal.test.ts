import { describe, it, expect } from "vitest"
import {
  parseDurationToSecs,
  parsePaceToMinPerKm,
  paceToInputValue,
  durationToInputValue,
  impliedPaceMinPerKm,
  resolveTargetPaceMinPerKm,
  weeksBetween,
  daysBetween,
  describeGoal,
  suggestPlanTitle,
  fmtGoalPace,
  fmtGoalDuration,
  fmtGoalDistance,
  minPerKmToMinPerMile,
  minPerMileToMinPerKm,
  METERS_PER_MILE,
} from "./goal"

describe("pace conversions", () => {
  it("round-trips min/km ↔ min/mi", () => {
    const original = 5.5
    const roundTripped = minPerMileToMinPerKm(minPerKmToMinPerMile(original))
    expect(roundTripped).toBeCloseTo(original, 10)
  })

  it("converts a known pace correctly", () => {
    // 5:00/km is roughly 8:03/mi
    expect(minPerKmToMinPerMile(5)).toBeCloseTo(8.0467, 3)
  })
})

describe("parseDurationToSecs", () => {
  it("parses H:MM:SS", () => {
    expect(parseDurationToSecs("1:45:00")).toBe(6300)
    expect(parseDurationToSecs("2:00:30")).toBe(7230)
  })

  it("parses M:SS", () => {
    expect(parseDurationToSecs("45:00")).toBe(2700)
    expect(parseDurationToSecs("8:03")).toBe(483)
  })

  it("treats a bare number as minutes", () => {
    expect(parseDurationToSecs("45")).toBe(2700)
  })

  it("tolerates surrounding whitespace", () => {
    expect(parseDurationToSecs("  1:45:00  ")).toBe(6300)
  })

  it("rejects malformed input", () => {
    expect(parseDurationToSecs("")).toBeNull()
    expect(parseDurationToSecs("   ")).toBeNull()
    expect(parseDurationToSecs("abc")).toBeNull()
    expect(parseDurationToSecs("1:2:3:4")).toBeNull()
    expect(parseDurationToSecs("1::30")).toBeNull()
    expect(parseDurationToSecs("-5:00")).toBeNull()
    expect(parseDurationToSecs("1:75")).toBeNull()   // seconds out of range
    expect(parseDurationToSecs("1:75:00")).toBeNull() // minutes out of range
    expect(parseDurationToSecs("0")).toBeNull()      // zero is not a goal
  })
})

describe("parsePaceToMinPerKm", () => {
  it("parses an imperial pace into min/km", () => {
    const result = parsePaceToMinPerKm("8:03", "imperial")
    expect(result).toBeCloseTo(5, 2)
  })

  it("parses a metric pace unchanged", () => {
    expect(parsePaceToMinPerKm("5:00", "metric")).toBeCloseTo(5, 6)
  })

  it("returns null for malformed input", () => {
    expect(parsePaceToMinPerKm("", "imperial")).toBeNull()
    expect(parsePaceToMinPerKm("fast", "imperial")).toBeNull()
  })
})

describe("form input round-trips", () => {
  it("round-trips a pace through input value and back", () => {
    const original = 5.2
    const asInput = paceToInputValue(original, "imperial")
    const parsed = parsePaceToMinPerKm(asInput, "imperial")
    // Round-trip is lossy to the nearest second, so allow ~0.01 min/km
    expect(parsed).toBeCloseTo(original, 1)
  })

  it("round-trips a duration through input value and back", () => {
    expect(parseDurationToSecs(durationToInputValue(6300))).toBe(6300)
    expect(parseDurationToSecs(durationToInputValue(2700))).toBe(2700)
  })

  it("returns an empty string for null inputs", () => {
    expect(paceToInputValue(null, "imperial")).toBe("")
    expect(durationToInputValue(null)).toBe("")
  })
})

describe("impliedPaceMinPerKm", () => {
  it("derives pace from distance and finish time", () => {
    // Half marathon (21097.5 m) in 1:45:00 (6300 s) ≈ 4.977 min/km
    expect(impliedPaceMinPerKm(21097.5, 6300)).toBeCloseTo(4.977, 2)
  })

  it("returns null for missing or non-positive inputs", () => {
    expect(impliedPaceMinPerKm(null, 6300)).toBeNull()
    expect(impliedPaceMinPerKm(21097.5, null)).toBeNull()
    expect(impliedPaceMinPerKm(0, 6300)).toBeNull()
    expect(impliedPaceMinPerKm(21097.5, 0)).toBeNull()
    expect(impliedPaceMinPerKm(-100, 600)).toBeNull()
  })
})

describe("resolveTargetPaceMinPerKm", () => {
  it("prefers an explicit pace over a derived one", () => {
    const pace = resolveTargetPaceMinPerKm({
      goalType: "distance_at_pace",
      targetPaceMinPerKm: 4.5,
      targetDistanceM: 21097.5,
      targetDurationSecs: 6300,
    })
    expect(pace).toBe(4.5)
  })

  it("falls back to deriving from distance and time", () => {
    const pace = resolveTargetPaceMinPerKm({
      goalType: "race",
      targetDistanceM: 10000,
      targetDurationSecs: 3000, // 50:00 → 5:00/km
    })
    expect(pace).toBeCloseTo(5, 6)
  })

  it("returns null when neither is available", () => {
    expect(resolveTargetPaceMinPerKm({ goalType: "habit", targetRunsPerWeek: 4 })).toBeNull()
  })
})

describe("weeksBetween / daysBetween", () => {
  it("counts whole weeks forward", () => {
    expect(weeksBetween("2026-01-01", "2026-01-29")).toBe(4)
  })

  it("returns negative for past targets", () => {
    expect(weeksBetween("2026-03-01", "2026-02-01")).toBe(-4)
    expect(daysBetween("2026-03-01", "2026-02-27")).toBe(-2)
  })

  it("is stable across a DST boundary", () => {
    // US DST starts 2026-03-08; UTC math must not drift a day
    expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14)
  })

  it("returns 0 for unparseable input", () => {
    expect(weeksBetween("not-a-date", "2026-01-01")).toBe(0)
  })
})

describe("formatters", () => {
  it("formats pace in both unit systems", () => {
    expect(fmtGoalPace(5, "metric")).toBe("5:00/km")
    expect(fmtGoalPace(5, "imperial")).toBe("8:03/mi")
  })

  it("returns null for invalid pace", () => {
    expect(fmtGoalPace(null, "imperial")).toBeNull()
    expect(fmtGoalPace(0, "imperial")).toBeNull()
  })

  it("formats durations with and without hours", () => {
    expect(fmtGoalDuration(6300)).toBe("1:45:00")
    expect(fmtGoalDuration(1800)).toBe("30:00")
    expect(fmtGoalDuration(null)).toBeNull()
  })

  it("uses canonical race labels for standard distances", () => {
    expect(fmtGoalDistance(21097.5, "imperial")).toBe("Half marathon")
    expect(fmtGoalDistance(5000, "metric")).toBe("5K")
    expect(fmtGoalDistance(42195, "imperial")).toBe("Marathon")
  })

  it("formats non-standard distances in the requested units", () => {
    expect(fmtGoalDistance(8 * METERS_PER_MILE, "imperial")).toBe("8 mi")
    expect(fmtGoalDistance(8000, "metric")).toBe("8 km")
  })
})

describe("describeGoal", () => {
  it("describes a race goal with a finish time and date", () => {
    const text = describeGoal(
      {
        goalType: "race",
        targetDistanceM: 21097.5,
        targetDurationSecs: 6300,
        targetDate: "2026-04-12",
      },
      "imperial",
    )
    expect(text).toContain("Half marathon")
    expect(text).toContain("1:45:00")
    expect(text).toContain("Apr 12, 2026")
  })

  it("describes a race goal without a finish time", () => {
    const text = describeGoal({ goalType: "race", targetDistanceM: 5000, targetDate: "2026-06-01" })
    expect(text).toBe("5K by Jun 1, 2026")
  })

  it("describes a distance milestone", () => {
    expect(describeGoal({ goalType: "distance_milestone", targetDistanceM: 5000 }))
      .toBe("Run 5K continuous")
  })

  it("describes a habit goal", () => {
    expect(describeGoal({ goalType: "habit", targetRunsPerWeek: 4 })).toBe("Run 4× per week")
  })

  it("describes a legacy 'pace' goal (type merged into distance_at_pace, kept for old data)", () => {
    const text = describeGoal(
      { goalType: "pace", targetDistanceM: 5000, targetPaceMinPerKm: 5 },
      "imperial",
    )
    expect(text).toBe("5K at 8:03/mi")
  })

  it("describes a distance_at_pace goal with only a pace set, no finish time — the case 'pace' used to cover", () => {
    const text = describeGoal(
      { goalType: "distance_at_pace", targetDistanceM: 5000, targetPaceMinPerKm: 5 },
      "imperial",
    )
    expect(text).toBe("5K at 8:03/mi")
  })

  it("does not leak a date suffix when no target date is set", () => {
    expect(describeGoal({ goalType: "distance_milestone", targetDistanceM: 10000 }))
      .not.toContain("by")
  })
})

describe("suggestPlanTitle", () => {
  it("names a race plan from the distance", () => {
    expect(suggestPlanTitle({ goalType: "race", targetDistanceM: 42195 }))
      .toBe("Marathon Race Plan")
  })

  it("names a milestone plan", () => {
    expect(suggestPlanTitle({ goalType: "distance_milestone", targetDistanceM: 5000 }))
      .toBe("Road to 5K")
  })

  it("names a distance_at_pace plan with the finish time", () => {
    expect(
      suggestPlanTitle({
        goalType: "distance_at_pace",
        targetDistanceM: 21097.5,
        targetDurationSecs: 6300,
      }),
    ).toBe("Half marathon in 1:45:00")
  })

  it("always returns a non-empty title", () => {
    expect(suggestPlanTitle({ goalType: "habit" }).length).toBeGreaterThan(0)
    expect(suggestPlanTitle({ goalType: "race" }).length).toBeGreaterThan(0)
  })
})
