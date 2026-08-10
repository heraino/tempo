import { describe, it, expect } from "vitest"
import {
  computeAdherence,
  computeLongestMissStreak,
  ratePct,
  type AdherenceSessionRecord,
} from "./adherence"

function s(
  scheduledDate: string,
  sessionKind: string,
  status: string,
  isRunSession = true,
): AdherenceSessionRecord {
  return { scheduledDate, sessionKind, status, isRunSession }
}

describe("computeAdherence", () => {
  it("returns a null rate when nothing has come due", () => {
    const result = computeAdherence(
      [s("2026-09-01", "easy", "planned"), s("2026-09-02", "long", "planned")],
      "2026-08-10",
    )
    expect(result.completionRate).toBeNull()
    expect(result.upcoming).toBe(2)
    expect(result.missed).toBe(0)
  })

  it("counts a past 'planned' session as missed, not upcoming", () => {
    const result = computeAdherence([s("2026-08-01", "easy", "planned")], "2026-08-10")
    expect(result.missed).toBe(1)
    expect(result.upcoming).toBe(0)
    expect(result.completionRate).toBe(0)
  })

  it("treats a session due exactly today as due", () => {
    const result = computeAdherence([s("2026-08-10", "easy", "planned")], "2026-08-10")
    expect(result.missed).toBe(1)
    expect(result.upcoming).toBe(0)
  })

  it("computes the completion rate over decided sessions only", () => {
    const result = computeAdherence(
      [
        s("2026-08-01", "easy", "completed"),
        s("2026-08-02", "easy", "completed"),
        s("2026-08-03", "tempo", "skipped"),
        s("2026-09-01", "long", "planned"), // future — excluded
      ],
      "2026-08-10",
    )
    expect(result.completed).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.completionRate).toBeCloseTo(2 / 3, 6)
  })

  it("excludes rescheduled sessions from the rate", () => {
    const result = computeAdherence(
      [
        s("2026-08-01", "tempo", "rescheduled"),
        s("2026-08-03", "tempo", "completed"),
      ],
      "2026-08-10",
    )
    expect(result.rescheduled).toBe(1)
    expect(result.completionRate).toBe(1)
  })

  it("breaks adherence down by session kind", () => {
    const result = computeAdherence(
      [
        s("2026-08-01", "easy", "completed"),
        s("2026-08-02", "easy", "completed"),
        s("2026-08-03", "threshold", "skipped"),
        s("2026-08-04", "threshold", "skipped"),
        s("2026-08-05", "threshold", "completed"),
      ],
      "2026-08-10",
    )
    expect(result.byKind.easy.completionRate).toBe(1)
    expect(result.byKind.threshold.completed).toBe(1)
    expect(result.byKind.threshold.skipped).toBe(2)
    expect(result.byKind.threshold.completionRate).toBeCloseTo(1 / 3, 6)
  })

  it("rolls past-due planned sessions into the kind's skipped count", () => {
    const result = computeAdherence(
      [s("2026-08-01", "tempo", "planned"), s("2026-08-02", "tempo", "completed")],
      "2026-08-10",
    )
    expect(result.byKind.tempo.skipped).toBe(1)
    expect(result.byKind.tempo.completionRate).toBe(0.5)
  })

  it("counts distinct days on which work came due", () => {
    const result = computeAdherence(
      [
        s("2026-08-01", "easy", "completed"),
        s("2026-08-01", "strength", "completed"), // same day, double
        s("2026-08-02", "easy", "completed"),
      ],
      "2026-08-10",
    )
    expect(result.daysWithScheduledWork).toBe(2)
  })

  it("handles an empty window", () => {
    const result = computeAdherence([], "2026-08-10")
    expect(result.totalScheduled).toBe(0)
    expect(result.completionRate).toBeNull()
    expect(result.longestMissStreak).toBe(0)
    expect(result.byKind).toEqual({})
  })
})

describe("computeLongestMissStreak", () => {
  it("finds the longest run of consecutive misses", () => {
    const streak = computeLongestMissStreak(
      [
        s("2026-08-01", "easy", "completed"),
        s("2026-08-02", "easy", "skipped"),
        s("2026-08-03", "easy", "skipped"),
        s("2026-08-04", "easy", "skipped"),
        s("2026-08-05", "easy", "completed"),
        s("2026-08-06", "easy", "skipped"),
      ],
      "2026-08-10",
    )
    expect(streak).toBe(3)
  })

  it("orders by date regardless of input order", () => {
    const streak = computeLongestMissStreak(
      [
        s("2026-08-05", "easy", "completed"),
        s("2026-08-02", "easy", "skipped"),
        s("2026-08-01", "easy", "completed"),
        s("2026-08-03", "easy", "skipped"),
      ],
      "2026-08-10",
    )
    expect(streak).toBe(2)
  })

  it("is transparent to rescheduled sessions", () => {
    const streak = computeLongestMissStreak(
      [
        s("2026-08-01", "easy", "skipped"),
        s("2026-08-02", "easy", "rescheduled"),
        s("2026-08-03", "easy", "skipped"),
      ],
      "2026-08-10",
    )
    expect(streak).toBe(2)
  })

  it("ignores sessions that have not come due", () => {
    expect(
      computeLongestMissStreak([s("2026-09-01", "easy", "planned")], "2026-08-10"),
    ).toBe(0)
  })

  it("returns 0 when everything was completed", () => {
    expect(
      computeLongestMissStreak(
        [s("2026-08-01", "easy", "completed"), s("2026-08-02", "easy", "completed")],
        "2026-08-10",
      ),
    ).toBe(0)
  })
})

describe("ratePct", () => {
  it("converts a rate to a whole percentage", () => {
    expect(ratePct(0.667)).toBe(67)
    expect(ratePct(1)).toBe(100)
    expect(ratePct(0)).toBe(0)
  })

  it("passes null through", () => {
    expect(ratePct(null)).toBeNull()
  })
})
