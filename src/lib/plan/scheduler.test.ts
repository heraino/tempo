import { describe, it, expect, vi } from "vitest"

// The pure scheduling functions don't use the DB, but scheduler.ts imports
// @/lib/db at the module level. Mock the module so tests run without a real
// database connection.
vi.mock("@/lib/db", () => ({ db: {} }))

import { resolveCycleWeek, resolveDayPlans, getWeekdayName, addDays } from "./scheduler"
import type { PlanJson, CycleWeek } from "./types"

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Build a minimal PlanJson with given cycle-week IDs, all days empty. */
function makePlan(weekDefs: Array<{ id: string; label: string }>): PlanJson {
  return {
    version: 1,
    cycleWeeks: weekDefs.map((w) => ({ id: w.id, label: w.label, days: [] })),
  }
}

/** Build a PlanJson with specific weekday sessions for a single-week cycle. */
function makeOneCyclePlan(dayConfigs: Array<{ weekday: string; sessionKinds: string[] }>): PlanJson {
  return {
    version: 1,
    cycleWeeks: [{
      id: "only",
      label: "Single week",
      days: dayConfigs.map(({ weekday, sessionKinds }) => ({
        weekday: weekday as CycleWeek["days"][0]["weekday"],
        sessions: sessionKinds.map((kind, i) => ({
          sessionKind: kind as "easy",
          label: `Session ${i + 1}`,
          prescription: `Do the ${kind}`,
          isRunSession: kind !== "strength" && kind !== "elastic",
          isStrengthSession: kind === "strength" || kind === "elastic",
        })),
      })),
    }],
  }
}

// ─── resolveCycleWeek — arbitrary cycle lengths ───────────────────────────────

describe("resolveCycleWeek — 3-week cycle", () => {
  const plan = makePlan([
    { id: "base", label: "Base" },
    { id: "build", label: "Build" },
    { id: "cutback", label: "Cutback" },
  ])
  const START = "2026-01-05"  // Monday
  const START_ID = "base"

  it("week 0 (cycleStartDate) resolves to base", () => {
    const w = resolveCycleWeek(plan.cycleWeeks, START, START_ID, "2026-01-05")
    expect(w.id).toBe("base")
  })

  it("week 1 resolves to build", () => {
    const w = resolveCycleWeek(plan.cycleWeeks, START, START_ID, "2026-01-12")
    expect(w.id).toBe("build")
  })

  it("week 2 resolves to cutback", () => {
    const w = resolveCycleWeek(plan.cycleWeeks, START, START_ID, "2026-01-19")
    expect(w.id).toBe("cutback")
  })

  it("week 3 wraps back to base", () => {
    const w = resolveCycleWeek(plan.cycleWeeks, START, START_ID, "2026-01-26")
    expect(w.id).toBe("base")
  })

  it("mid-week dates resolve to the same week as the preceding Monday", () => {
    // Wednesday Jan 7 is in the first week (base)
    const wed = resolveCycleWeek(plan.cycleWeeks, START, START_ID, "2026-01-07")
    const sun = resolveCycleWeek(plan.cycleWeeks, START, START_ID, "2026-01-11")
    expect(wed.id).toBe("base")
    expect(sun.id).toBe("base")
  })
})

describe("resolveCycleWeek — 5-week cycle", () => {
  const plan = makePlan([
    { id: "w1", label: "Week 1" },
    { id: "w2", label: "Week 2" },
    { id: "w3", label: "Week 3" },
    { id: "w4", label: "Week 4" },
    { id: "w5", label: "Week 5" },
  ])
  const START = "2026-03-02"
  const START_ID = "w1"

  it("resolves w1 through w5 in order", () => {
    const ids = [0, 1, 2, 3, 4].map((n) =>
      resolveCycleWeek(plan.cycleWeeks, START, START_ID, addDays(START, n * 7)).id
    )
    expect(ids).toEqual(["w1", "w2", "w3", "w4", "w5"])
  })

  it("wraps correctly at week 5 boundary", () => {
    const w = resolveCycleWeek(plan.cycleWeeks, START, START_ID, addDays(START, 5 * 7))
    expect(w.id).toBe("w1")
  })

  it("no code path assumes 4-week ABCD — works with 5 IDs", () => {
    expect(plan.cycleWeeks.map((w) => w.id)).toEqual(["w1", "w2", "w3", "w4", "w5"])
    // If code assumed 4-week ABCD, this test would produce wrong ids
    const w6 = resolveCycleWeek(plan.cycleWeeks, START, START_ID, addDays(START, 6 * 7))
    expect(w6.id).toBe("w2")  // would be w3 in a 4-week cycle if miscalculated
  })
})

describe("resolveCycleWeek — user-defined cycle IDs", () => {
  const plan = makePlan([
    { id: "aerobic-base", label: "Aerobic Base" },
    { id: "build-intensity", label: "Build Intensity" },
    { id: "race-prep", label: "Race Prep" },
    { id: "recovery-week", label: "Recovery" },
  ])
  const START = "2026-06-01"
  const START_ID = "aerobic-base"

  it("accepts arbitrary non-ABCD string IDs", () => {
    const ids = [0, 1, 2, 3].map((n) =>
      resolveCycleWeek(plan.cycleWeeks, START, START_ID, addDays(START, n * 7)).id
    )
    expect(ids).toEqual(["aerobic-base", "build-intensity", "race-prep", "recovery-week"])
  })

  it("can start on any cycle week (not just the first)", () => {
    // Start anchor at "race-prep" — index 2
    const w0 = resolveCycleWeek(plan.cycleWeeks, START, "race-prep", START)
    const w1 = resolveCycleWeek(plan.cycleWeeks, START, "race-prep", addDays(START, 7))
    const w2 = resolveCycleWeek(plan.cycleWeeks, START, "race-prep", addDays(START, 14))
    expect(w0.id).toBe("race-prep")
    expect(w1.id).toBe("recovery-week")
    expect(w2.id).toBe("aerobic-base")   // wraps
  })

  it("throws on unknown cycleStartWeekId", () => {
    expect(() => resolveCycleWeek(plan.cycleWeeks, START, "nonexistent", START))
      .toThrow(/cycleStartWeekId.*nonexistent/)
  })
})

describe("resolveCycleWeek — year and timezone boundaries", () => {
  const plan = makePlan([
    { id: "A", label: "A" },
    { id: "B", label: "B" },
  ])

  it("correctly spans Dec 31 → Jan 1 year boundary", () => {
    // Cycle starts Mon Dec 28, 2026 (Week A)
    const a = resolveCycleWeek(plan.cycleWeeks, "2026-12-28", "A", "2026-12-31")  // Thursday of Week A
    const b = resolveCycleWeek(plan.cycleWeeks, "2026-12-28", "A", "2027-01-04")  // Monday of Week B
    const a2 = resolveCycleWeek(plan.cycleWeeks, "2026-12-28", "A", "2027-01-11") // Monday of Week A again
    expect(a.id).toBe("A")
    expect(b.id).toBe("B")
    expect(a2.id).toBe("A")
  })

  it("handles dates well before cycleStartDate (negative offset)", () => {
    // Cycle starts 2026-07-06 (Week A). July 1 is 5 days before → still Week B
    // because floor(-5/7) = -1 → (0 - 1 + 2) % 2 = 1 → Week B
    const w = resolveCycleWeek(plan.cycleWeeks, "2026-07-06", "A", "2026-07-01")
    expect(w.id).toBe("B")
  })
})

// ─── resolveDayPlans — session structure ──────────────────────────────────────

describe("resolveDayPlans — day with zero sessions", () => {
  const plan = makeOneCyclePlan([
    // Only Monday has sessions; all other days have no entry (implicit empty)
    { weekday: "Monday", sessionKinds: ["easy"] },
  ])

  it("days not listed in the plan have zero sessions and are marked rest days", () => {
    const days = resolveDayPlans(plan, "2026-07-06", "only", "2026-07-07", 1)  // Tuesday
    expect(days[0].sessions).toHaveLength(0)
    expect(days[0].isRestDay).toBe(true)
  })

  it("explicitly empty session list is also marked as rest", () => {
    const planWithExplicitRest: PlanJson = {
      version: 1,
      cycleWeeks: [{
        id: "x", label: "X",
        days: [{ weekday: "Friday", sessions: [] }],
      }],
    }
    const days = resolveDayPlans(planWithExplicitRest, "2026-07-06", "x", "2026-07-10", 1)  // Friday
    expect(days[0].isRestDay).toBe(true)
    expect(days[0].sessions).toHaveLength(0)
  })

  it("day with sessions is not marked as rest", () => {
    const days = resolveDayPlans(plan, "2026-07-06", "only", "2026-07-06", 1)  // Monday
    expect(days[0].isRestDay).toBe(false)
    expect(days[0].sessions).toHaveLength(1)
  })
})

describe("resolveDayPlans — Tuesday recovery run + pull strength", () => {
  const plan = makeOneCyclePlan([
    { weekday: "Tuesday", sessionKinds: ["recovery", "strength"] },
  ])

  it("Tuesday has two independent sessions with correct kinds and sequence", () => {
    // Cycle starts Monday July 6; test Tuesday July 7
    const days = resolveDayPlans(plan, "2026-07-06", "only", "2026-07-07", 1)
    const { sessions } = days[0]
    expect(sessions).toHaveLength(2)
    expect(sessions[0].sessionKind).toBe("recovery")
    expect(sessions[0].sequenceInDay).toBe(0)
    expect(sessions[1].sessionKind).toBe("strength")
    expect(sessions[1].sequenceInDay).toBe(1)
  })

  it("sessions are separate objects — modifying one does not affect the other", () => {
    const days = resolveDayPlans(plan, "2026-07-06", "only", "2026-07-07", 1)
    const [s1, s2] = days[0].sessions
    expect(s1).not.toBe(s2)
    expect(s1.sessionKind).not.toBe(s2.sessionKind)
  })
})

describe("resolveDayPlans — quality day moved from Wednesday to Tuesday", () => {
  // Original plan: Wednesday has threshold
  const originalPlan: PlanJson = {
    version: 1,
    cycleWeeks: [{
      id: "A", label: "Threshold",
      days: [
        { weekday: "Tuesday",   sessions: [{ sessionKind: "recovery", label: "Recovery", prescription: "Easy", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Wednesday", sessions: [{ sessionKind: "threshold", label: "Threshold", prescription: "Intervals", isRunSession: true, isStrengthSession: false }] },
      ],
    }],
  }

  // Edited plan: quality moved to Tuesday (threshold replaces recovery)
  const editedPlan: PlanJson = {
    version: 1,
    cycleWeeks: [{
      id: "A", label: "Threshold",
      days: [
        { weekday: "Tuesday",   sessions: [{ sessionKind: "threshold", label: "Threshold", prescription: "Intervals", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Wednesday", sessions: [] },
      ],
    }],
  }

  const START = "2026-07-06"  // Monday — Week A starts here
  const TUESDAY  = "2026-07-07"
  const WEDNESDAY = "2026-07-08"

  it("original: Wednesday has threshold, Tuesday has recovery", () => {
    const days = resolveDayPlans(originalPlan, START, "A", TUESDAY, 2)
    expect(days[0].date).toBe(TUESDAY)
    expect(days[0].sessions[0].sessionKind).toBe("recovery")
    expect(days[1].date).toBe(WEDNESDAY)
    expect(days[1].sessions[0].sessionKind).toBe("threshold")
  })

  it("edited plan: Tuesday has threshold, Wednesday is rest", () => {
    const days = resolveDayPlans(editedPlan, START, "A", TUESDAY, 2)
    expect(days[0].date).toBe(TUESDAY)
    expect(days[0].sessions[0].sessionKind).toBe("threshold")
    expect(days[1].date).toBe(WEDNESDAY)
    expect(days[1].isRestDay).toBe(true)
  })

  it("the schedule engine reads plan_json — no hard-coded Wednesday=quality assumption", () => {
    // This test proves quality day follows PlanJson, not weekday-specific code.
    // Different plans produce different schedules for the same calendar dates.
    const orig = resolveDayPlans(originalPlan, START, "A", WEDNESDAY, 1)[0]
    const edit = resolveDayPlans(editedPlan, START, "A", WEDNESDAY, 1)[0]
    expect(orig.sessions[0]?.sessionKind).toBe("threshold")
    expect(edit.isRestDay).toBe(true)
  })
})

describe("resolveDayPlans — regeneration is idempotent", () => {
  const plan: PlanJson = {
    version: 1,
    cycleWeeks: [
      { id: "X", label: "X", days: [
        { weekday: "Monday",    sessions: [{ sessionKind: "easy",     label: "Easy", prescription: "Easy run", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Wednesday", sessions: [{ sessionKind: "threshold", label: "Thresh", prescription: "Thresh", isRunSession: true, isStrengthSession: false }] },
        { weekday: "Friday",    sessions: [] },
      ]},
    ],
  }

  it("identical input produces identical output on repeated calls", () => {
    const a = resolveDayPlans(plan, "2026-07-06", "X", "2026-07-06", 14)
    const b = resolveDayPlans(plan, "2026-07-06", "X", "2026-07-06", 14)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("output date sequence is deterministic and covers all requested days", () => {
    const days = resolveDayPlans(plan, "2026-07-06", "X", "2026-07-06", 7)
    expect(days).toHaveLength(7)
    expect(days[0].date).toBe("2026-07-06")
    expect(days[6].date).toBe("2026-07-12")
  })
})

describe("resolveDayPlans — session status independence (data model)", () => {
  const plan: PlanJson = {
    version: 1,
    cycleWeeks: [{
      id: "A", label: "A",
      days: [{
        weekday: "Tuesday", sessions: [
          { sessionKind: "recovery", label: "Recovery run",  prescription: "Easy", isRunSession: true,  isStrengthSession: false },
          { sessionKind: "strength", label: "Pull strength", prescription: "Pull", isRunSession: false, isStrengthSession: true  },
        ],
      }],
    }],
  }

  it("each session is a separate object with its own identity", () => {
    // Verifies the data model: two sessions on one day are independent objects.
    // In the DB each gets its own planned_sessions row with its own status column.
    const days = resolveDayPlans(plan, "2026-07-07", "A", "2026-07-07", 1)
    const sessions = days[0].sessions
    expect(sessions).toHaveLength(2)

    const recoverySession = sessions.find((s) => s.sessionKind === "recovery")
    const strengthSession = sessions.find((s) => s.sessionKind === "strength")

    expect(recoverySession).toBeDefined()
    expect(strengthSession).toBeDefined()

    // They are distinct objects — mutating one won't affect the other
    // (important because the DB gives each its own status column)
    expect(recoverySession).not.toBe(strengthSession)
    expect(recoverySession!.sequenceInDay).toBe(0)
    expect(strengthSession!.sequenceInDay).toBe(1)
  })
})

// ─── Cycle week label propagation ─────────────────────────────────────────────

describe("resolveDayPlans — cycle week metadata propagated to each day", () => {
  const plan = makePlan([
    { id: "threshold-week", label: "Threshold Training" },
    { id: "cutback-week",   label: "Cutback" },
  ])

  it("cycleWeekId and cycleWeekLabel are set on each DayPlan", () => {
    const days = resolveDayPlans(plan, "2026-07-06", "threshold-week", "2026-07-06", 14)

    const week1Days = days.slice(0, 7)
    const week2Days = days.slice(7, 14)

    for (const d of week1Days) {
      expect(d.cycleWeekId).toBe("threshold-week")
      expect(d.cycleWeekLabel).toBe("Threshold Training")
    }
    for (const d of week2Days) {
      expect(d.cycleWeekId).toBe("cutback-week")
      expect(d.cycleWeekLabel).toBe("Cutback")
    }
  })
})

// ─── getWeekdayName ───────────────────────────────────────────────────────────

describe("getWeekdayName", () => {
  it("correctly identifies all seven weekdays", () => {
    // 2026-07-06 is a Monday
    expect(getWeekdayName("2026-07-06")).toBe("Monday")
    expect(getWeekdayName("2026-07-07")).toBe("Tuesday")
    expect(getWeekdayName("2026-07-08")).toBe("Wednesday")
    expect(getWeekdayName("2026-07-09")).toBe("Thursday")
    expect(getWeekdayName("2026-07-10")).toBe("Friday")
    expect(getWeekdayName("2026-07-11")).toBe("Saturday")
    expect(getWeekdayName("2026-07-12")).toBe("Sunday")
  })

  it("correctly identifies Jan 1 after year boundary", () => {
    // 2027-01-01 is a Friday
    expect(getWeekdayName("2027-01-01")).toBe("Friday")
  })
})
