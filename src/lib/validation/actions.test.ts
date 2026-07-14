import { describe, it, expect } from "vitest"
import { uploadWorkoutSchema, savePlanSchema, painEntrySchema } from "./actions"

// ─── painEntrySchema ──────────────────────────────────────────────────────────

describe("painEntrySchema", () => {
  it("accepts a minimal valid pain entry", () => {
    const result = painEntrySchema.safeParse({ location: "left knee", level0to10: 3 })
    expect(result.success).toBe(true)
  })

  it("accepts a fully specified pain entry", () => {
    const result = painEntrySchema.safeParse({
      location: "right hip",
      side: "right",
      level0to10: 6,
      character: "tight",
      onset: "mid_run",
      walkingScore: 2,
      runningScore: 6,
      gaitChange: true,
      notes: "Gets worse on downhills",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an entry missing location", () => {
    const result = painEntrySchema.safeParse({ level0to10: 4 })
    expect(result.success).toBe(false)
  })

  it("rejects level_0_to_10 above 10", () => {
    const result = painEntrySchema.safeParse({ location: "knee", level0to10: 11 })
    expect(result.success).toBe(false)
  })

  it("rejects level_0_to_10 below 0", () => {
    const result = painEntrySchema.safeParse({ location: "knee", level0to10: -1 })
    expect(result.success).toBe(false)
  })

  it("rejects an invalid side value", () => {
    const result = painEntrySchema.safeParse({ location: "knee", level0to10: 3, side: "center" })
    expect(result.success).toBe(false)
  })
})

// ─── uploadWorkoutSchema ──────────────────────────────────────────────────────

describe("uploadWorkoutSchema", () => {
  it("accepts empty input (all optional)", () => {
    const result = uploadWorkoutSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("accepts typical upload with effort and notes", () => {
    const result = uploadWorkoutSchema.safeParse({
      perceivedEffort: "4",
      notes: "Felt strong today",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.perceivedEffort).toBe(4)
      expect(result.data.notes).toBe("Felt strong today")
    }
  })

  it("coerces perceivedEffort string to number", () => {
    const result = uploadWorkoutSchema.safeParse({ perceivedEffort: "3" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.perceivedEffort).toBe(3)
  })

  it("rejects perceivedEffort above 5", () => {
    const result = uploadWorkoutSchema.safeParse({ perceivedEffort: "6" })
    expect(result.success).toBe(false)
  })

  it("rejects perceivedEffort below 1", () => {
    const result = uploadWorkoutSchema.safeParse({ perceivedEffort: "0" })
    expect(result.success).toBe(false)
  })

  it("ignores empty string perceivedEffort (maps to undefined)", () => {
    const result = uploadWorkoutSchema.safeParse({ perceivedEffort: "" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.perceivedEffort).toBeUndefined()
  })

  it("coerces outsideTempC to number", () => {
    const result = uploadWorkoutSchema.safeParse({ outsideTempC: "18.5" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.outsideTempC).toBe(18.5)
  })

  it("treats empty outsideTempC as undefined", () => {
    const result = uploadWorkoutSchema.safeParse({ outsideTempC: "" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.outsideTempC).toBeUndefined()
  })

  it("parses checkbox 'on' as boolean true", () => {
    const result = uploadWorkoutSchema.safeParse({ travel: "on" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.travel).toBe(true)
  })

  it("parses absent checkbox as false", () => {
    const result = uploadWorkoutSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.travel).toBe(false)
      expect(result.data.massage).toBe(false)
      expect(result.data.illness).toBe(false)
    }
  })

  it("parses valid JSON pain entries", () => {
    const entries = [
      { location: "left knee", level0to10: 3 },
      { location: "right hip", level0to10: 5, character: "tight" },
    ]
    const result = uploadWorkoutSchema.safeParse({
      painEntriesJson: JSON.stringify(entries),
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.painEntriesJson).toHaveLength(2)
      expect(result.data.painEntriesJson[0].location).toBe("left knee")
    }
  })

  it("returns empty array for invalid pain entries JSON", () => {
    const result = uploadWorkoutSchema.safeParse({ painEntriesJson: "not json" })
    // The transform returns [] on parse failure, but then the array item
    // validation wouldn't fail if array is empty
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.painEntriesJson).toHaveLength(0)
  })

  it("rejects more than 10 pain entries", () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({
      location: `area ${i}`,
      level0to10: 3,
    }))
    const result = uploadWorkoutSchema.safeParse({ painEntriesJson: JSON.stringify(entries) })
    expect(result.success).toBe(false)
  })

  it("allows 10 pain entries exactly", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      location: `area ${i}`,
      level0to10: 3,
    }))
    const result = uploadWorkoutSchema.safeParse({ painEntriesJson: JSON.stringify(entries) })
    expect(result.success).toBe(true)
  })
})

// ─── savePlanSchema ───────────────────────────────────────────────────────────

describe("savePlanSchema", () => {
  it("accepts valid plan input", () => {
    const result = savePlanSchema.safeParse({
      title: "My Training Plan",
      startDate: "2026-07-14",
      startWeek: "A",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an invalid date format", () => {
    const result = savePlanSchema.safeParse({
      title: "Plan",
      startDate: "14-07-2026",
      startWeek: "A",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty title", () => {
    const result = savePlanSchema.safeParse({
      title: "",
      startDate: "2026-07-14",
      startWeek: "A",
    })
    expect(result.success).toBe(false)
  })
})
