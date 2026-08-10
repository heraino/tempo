import { describe, it, expect } from "vitest"
import { applyPlanMutation, applyPlanMutations, PlanMutationError } from "./mutations"
import { planJsonSchema } from "@/lib/validation/plan"
import type { PlanJson } from "./types"

function samplePlan(): PlanJson {
  return {
    version: 1,
    cycleWeeks: [
      {
        id: "A",
        label: "Build",
        days: [
          {
            weekday: "Tuesday",
            sessions: [
              {
                sessionKind: "threshold",
                label: "Threshold",
                prescription: "6×3:00 at threshold",
                isRunSession: true,
                isStrengthSession: false,
                targetHrMin: 160,
                targetHrMax: 172,
                intervals: [{ reps: 6, workDurationSecs: 180, recDurationSecs: 90 }],
              },
            ],
          },
          {
            weekday: "Thursday",
            sessions: [
              {
                sessionKind: "easy",
                label: "Easy run",
                prescription: "Easy 5 miles",
                isRunSession: true,
                isStrengthSession: false,
              },
            ],
          },
          { weekday: "Sunday", sessions: [] },
        ],
      },
      {
        id: "D",
        label: "Cutback",
        days: [{ weekday: "Tuesday", sessions: [] }],
        isCutback: true,
      },
    ],
    progressionBlocks: [
      { blockNumber: 1, buildMinMi: 30, buildMaxMi: 35, cutbackMinMi: 22, cutbackMaxMi: 26 },
      { blockNumber: 2, buildMinMi: 36, buildMaxMi: 42, cutbackMinMi: 26, cutbackMaxMi: 30 },
    ],
  }
}

describe("purity", () => {
  it("never mutates the input plan", () => {
    const plan = samplePlan()
    const snapshot = JSON.stringify(plan)
    applyPlanMutation(plan, {
      op: "swap_session_kind",
      cycleWeekId: "A",
      weekday: "Tuesday",
      fromKind: "threshold",
      toKind: "easy",
    })
    expect(JSON.stringify(plan)).toBe(snapshot)
  })

  it("produces output that still validates as a plan", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "scale_mileage",
      factorPct: -10,
    })
    expect(() => planJsonSchema.parse(plan)).not.toThrow()
  })
})

describe("swap_session_kind", () => {
  it("replaces kind, label, and prescription", () => {
    const { plan, summary } = applyPlanMutation(samplePlan(), {
      op: "swap_session_kind",
      cycleWeekId: "A",
      weekday: "Tuesday",
      fromKind: "threshold",
      toKind: "easy",
    })
    const session = plan.cycleWeeks[0].days[0].sessions[0]
    expect(session.sessionKind).toBe("easy")
    expect(session.label).toBe("Easy run")
    expect(session.prescription).not.toContain("6×3:00")
    expect(summary).toContain("threshold → easy")
  })

  it("clears targets that belonged to the old session kind", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "swap_session_kind",
      cycleWeekId: "A",
      weekday: "Tuesday",
      fromKind: "threshold",
      toKind: "easy",
    })
    const session = plan.cycleWeeks[0].days[0].sessions[0]
    expect(session.targetHrMin).toBeUndefined()
    expect(session.targetHrMax).toBeUndefined()
    expect(session.intervals).toBeUndefined()
  })

  it("updates run/strength flags when swapping to a strength kind", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "swap_session_kind",
      cycleWeekId: "A",
      weekday: "Tuesday",
      fromKind: "threshold",
      toKind: "strength",
    })
    const session = plan.cycleWeeks[0].days[0].sessions[0]
    expect(session.isRunSession).toBe(false)
    expect(session.isStrengthSession).toBe(true)
  })

  it("throws when the source session is absent", () => {
    expect(() =>
      applyPlanMutation(samplePlan(), {
        op: "swap_session_kind",
        cycleWeekId: "A",
        weekday: "Thursday",
        fromKind: "threshold",
        toKind: "easy",
      }),
    ).toThrow(PlanMutationError)
  })

  it("throws with available week ids when the week is unknown", () => {
    expect(() =>
      applyPlanMutation(samplePlan(), {
        op: "swap_session_kind",
        cycleWeekId: "Z",
        weekday: "Tuesday",
        fromKind: "threshold",
        toKind: "easy",
      }),
    ).toThrow(/have: A, D/)
  })
})

describe("remove_session / add_session", () => {
  it("removes a session from a day", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "remove_session",
      cycleWeekId: "A",
      weekday: "Tuesday",
      sessionKind: "threshold",
    })
    expect(plan.cycleWeeks[0].days[0].sessions).toHaveLength(0)
  })

  it("adds a session to an empty day", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "add_session",
      cycleWeekId: "A",
      weekday: "Sunday",
      sessionKind: "long",
    })
    const sunday = plan.cycleWeeks[0].days.find((d) => d.weekday === "Sunday")!
    expect(sunday.sessions).toHaveLength(1)
    expect(sunday.sessions[0].sessionKind).toBe("long")
    expect(sunday.sessions[0].isRunSession).toBe(true)
  })

  it("throws when removing a session that is not there", () => {
    expect(() =>
      applyPlanMutation(samplePlan(), {
        op: "remove_session",
        cycleWeekId: "A",
        weekday: "Sunday",
        sessionKind: "long",
      }),
    ).toThrow(PlanMutationError)
  })
})

describe("move_session", () => {
  it("moves a session between weekdays within a cycle week", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "move_session",
      cycleWeekId: "A",
      fromWeekday: "Tuesday",
      toWeekday: "Sunday",
      sessionKind: "threshold",
    })
    const tuesday = plan.cycleWeeks[0].days.find((d) => d.weekday === "Tuesday")!
    const sunday = plan.cycleWeeks[0].days.find((d) => d.weekday === "Sunday")!
    expect(tuesday.sessions).toHaveLength(0)
    expect(sunday.sessions[0].sessionKind).toBe("threshold")
  })

  it("preserves the session's prescription and intervals when moving", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "move_session",
      cycleWeekId: "A",
      fromWeekday: "Tuesday",
      toWeekday: "Sunday",
      sessionKind: "threshold",
    })
    const sunday = plan.cycleWeeks[0].days.find((d) => d.weekday === "Sunday")!
    expect(sunday.sessions[0].prescription).toBe("6×3:00 at threshold")
    expect(sunday.sessions[0].intervals).toHaveLength(1)
  })

  it("rejects a no-op move", () => {
    expect(() =>
      applyPlanMutation(samplePlan(), {
        op: "move_session",
        cycleWeekId: "A",
        fromWeekday: "Tuesday",
        toWeekday: "Tuesday",
        sessionKind: "threshold",
      }),
    ).toThrow(PlanMutationError)
  })
})

describe("scale_mileage", () => {
  it("scales every block when no block number is given", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "scale_mileage",
      factorPct: -10,
    })
    expect(plan.progressionBlocks![0].buildMinMi).toBe(27)
    expect(plan.progressionBlocks![0].buildMaxMi).toBe(31.5)
    expect(plan.progressionBlocks![1].buildMinMi).toBe(32.4)
  })

  it("scales only the named block", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "scale_mileage",
      blockNumber: 2,
      factorPct: 10,
    })
    expect(plan.progressionBlocks![0].buildMinMi).toBe(30) // untouched
    expect(plan.progressionBlocks![1].buildMinMi).toBe(39.6)
  })

  it("scales cutback targets alongside build targets", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "scale_mileage",
      blockNumber: 1,
      factorPct: -50,
    })
    expect(plan.progressionBlocks![0].cutbackMinMi).toBe(11)
    expect(plan.progressionBlocks![0].cutbackMaxMi).toBe(13)
  })

  it("rejects changes beyond ±50% and no-op changes", () => {
    for (const factorPct of [-51, 51, 0]) {
      expect(() =>
        applyPlanMutation(samplePlan(), { op: "scale_mileage", factorPct }),
      ).toThrow(PlanMutationError)
    }
  })

  it("throws when the plan has no progression blocks", () => {
    const plan = samplePlan()
    delete plan.progressionBlocks
    expect(() => applyPlanMutation(plan, { op: "scale_mileage", factorPct: -10 })).toThrow(
      /no mileage progression/,
    )
  })

  it("throws for an unknown block number", () => {
    expect(() =>
      applyPlanMutation(samplePlan(), { op: "scale_mileage", blockNumber: 9, factorPct: -5 }),
    ).toThrow(PlanMutationError)
  })
})

describe("set_cutback", () => {
  it("marks a build week as a cutback week", () => {
    const { plan, summary } = applyPlanMutation(samplePlan(), {
      op: "set_cutback",
      cycleWeekId: "A",
      isCutback: true,
    })
    expect(plan.cycleWeeks[0].isCutback).toBe(true)
    expect(summary).toContain("cutback")
  })

  it("can clear a cutback flag", () => {
    const { plan } = applyPlanMutation(samplePlan(), {
      op: "set_cutback",
      cycleWeekId: "D",
      isCutback: false,
    })
    expect(plan.cycleWeeks[1].isCutback).toBe(false)
  })
})

describe("applyPlanMutations", () => {
  it("applies several mutations in order and collects summaries", () => {
    const { plan, summaries } = applyPlanMutations(samplePlan(), [
      { op: "swap_session_kind", cycleWeekId: "A", weekday: "Tuesday", fromKind: "threshold", toKind: "easy" },
      { op: "scale_mileage", factorPct: -10 },
    ])
    expect(plan.cycleWeeks[0].days[0].sessions[0].sessionKind).toBe("easy")
    expect(plan.progressionBlocks![0].buildMinMi).toBe(27)
    expect(summaries).toHaveLength(2)
  })

  it("propagates an error from a later mutation without partial application", () => {
    const original = samplePlan()
    expect(() =>
      applyPlanMutations(original, [
        { op: "scale_mileage", factorPct: -10 },
        { op: "remove_session", cycleWeekId: "A", weekday: "Sunday", sessionKind: "long" },
      ]),
    ).toThrow(PlanMutationError)
    // The caller's plan is untouched regardless of where the failure occurred
    expect(original.progressionBlocks![0].buildMinMi).toBe(30)
  })
})
