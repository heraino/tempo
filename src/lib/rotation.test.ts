import { describe, it, expect } from "vitest"
import { getRotationWeek, extractWorkout, getTodayInfo } from "./rotation"
import type { RotationWeek } from "./rotation"

// ─── getRotationWeek ──────────────────────────────────────────────────────────

describe("getRotationWeek", () => {
  const anchor = new Date("2024-01-01T00:00:00") // A week

  it("returns the anchor week on the anchor date", () => {
    expect(getRotationWeek(anchor, anchor, "A")).toBe("A")
  })

  it("advances through B, C, D correctly", () => {
    const week = (offset: number) =>
      getRotationWeek(
        new Date(anchor.getTime() + offset * 7 * 24 * 3600 * 1000),
        anchor,
        "A"
      )
    expect(week(1)).toBe("B")
    expect(week(2)).toBe("C")
    expect(week(3)).toBe("D")
    expect(week(4)).toBe("A")
  })

  it("wraps correctly starting from each anchor week", () => {
    const weeks: RotationWeek[] = ["A", "B", "C", "D"]
    for (const start of weeks) {
      const oneWeekLater = new Date(anchor.getTime() + 7 * 24 * 3600 * 1000)
      const idx = weeks.indexOf(start)
      const expected = weeks[(idx + 1) % 4]
      expect(getRotationWeek(oneWeekLater, anchor, start)).toBe(expected)
    }
  })

  it("handles negative offset (before anchor date)", () => {
    const before = new Date(anchor.getTime() - 7 * 24 * 3600 * 1000)
    expect(getRotationWeek(before, anchor, "A")).toBe("D")
  })

  it("handles mid-week dates (uses floor division by 7)", () => {
    const midWeek = new Date(anchor.getTime() + 3 * 24 * 3600 * 1000)
    expect(getRotationWeek(midWeek, anchor, "A")).toBe("A")
  })
})

// ─── extractWorkout ───────────────────────────────────────────────────────────

const SAMPLE_PLAN = `
# Week A

### Monday
Easy 5 miles at conversational pace.

### Tuesday
Rest day.

### Wednesday
Threshold 4x1mile at 10K pace.

# Week B

### Monday
Long run 12 miles.

### Friday
Strides 6x20s.
`

describe("extractWorkout", () => {
  it("extracts the correct day from the correct week", () => {
    const result = extractWorkout(SAMPLE_PLAN, "A", "Monday")
    expect(result).toContain("Easy 5 miles")
    expect(result).not.toContain("Long run")
  })

  it("returns empty string when week is not found", () => {
    expect(extractWorkout(SAMPLE_PLAN, "C", "Monday")).toBe("")
  })

  it("returns empty string when day is not found within week", () => {
    expect(extractWorkout(SAMPLE_PLAN, "A", "Saturday")).toBe("")
  })

  it("extracts different weeks independently", () => {
    const weekA = extractWorkout(SAMPLE_PLAN, "A", "Wednesday")
    const weekB = extractWorkout(SAMPLE_PLAN, "B", "Monday")
    expect(weekA).toContain("Threshold")
    expect(weekB).toContain("Long run")
  })

  it("does not bleed content from adjacent days", () => {
    const result = extractWorkout(SAMPLE_PLAN, "A", "Monday")
    expect(result).not.toContain("Threshold")
  })
})

// ─── getTodayInfo ─────────────────────────────────────────────────────────────

describe("getTodayInfo", () => {
  it("returns a rotation week and day name", () => {
    const anchor = new Date("2024-01-01T00:00:00")
    const { week, dayName, today } = getTodayInfo(anchor, "A")
    expect(["A", "B", "C", "D"]).toContain(week)
    expect(typeof dayName).toBe("string")
    expect(today).toBeInstanceOf(Date)
  })

  it("accepts a timezone string without throwing", () => {
    const anchor = new Date("2024-01-01T00:00:00")
    expect(() => getTodayInfo(anchor, "A", "America/New_York")).not.toThrow()
  })

  it("accepts UTC timezone", () => {
    const anchor = new Date("2024-01-01T00:00:00")
    const { week } = getTodayInfo(anchor, "A", "UTC")
    expect(["A", "B", "C", "D"]).toContain(week)
  })
})
