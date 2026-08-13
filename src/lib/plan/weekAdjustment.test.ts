import { describe, it, expect } from "vitest"
import { planWeekAdjustment, describeWeekAdjustment, type WeekAdjustmentSessionInput } from "./weekAdjustment"
import type { Weekday, SessionKind } from "./types"

function session(
  id: string,
  weekday: Weekday,
  sessionKind: SessionKind,
  isRunSession: boolean,
  status = "planned",
): WeekAdjustmentSessionInput {
  return { id, weekday, sessionKind, isRunSession, status }
}

describe("planWeekAdjustment — basics", () => {
  it("produces no actions when nothing is constrained", () => {
    const sessions = [
      session("1", "Tuesday", "easy", true),
      session("2", "Thursday", "tempo", true),
      session("3", "Sunday", "long", true),
    ]
    const plan = planWeekAdjustment(sessions, { days: {} })
    expect(plan.actions).toEqual([])
  })

  it("ignores sessions that are not still 'planned'", () => {
    const sessions = [session("1", "Wednesday", "tempo", true, "completed")]
    const plan = planWeekAdjustment(sessions, { days: { Wednesday: "blocked" } })
    expect(plan.actions).toEqual([])
  })

  it("leaves a session on an unconstrained day untouched even if other days are constrained", () => {
    const sessions = [session("1", "Friday", "easy", true)]
    const plan = planWeekAdjustment(sessions, { days: { Monday: "blocked" } })
    expect(plan.actions).toEqual([])
  })
})

describe("blocked days", () => {
  it("moves a hard session off a blocked day to the first open normal day", () => {
    const sessions = [session("1", "Wednesday", "tempo", true)]
    const plan = planWeekAdjustment(sessions, { days: { Wednesday: "blocked" } })
    expect(plan.actions).toEqual([
      { op: "move", sessionId: "1", fromWeekday: "Wednesday", toWeekday: "Monday", sessionKind: "tempo" },
    ])
  })

  it("skips (unplaced) a session that cannot be relocated because every other day is full", () => {
    const sessions = [
      session("mon", "Monday", "easy", true),
      session("tue", "Tuesday", "easy", true),
      session("wed", "Wednesday", "tempo", true), // to be displaced
      session("thu", "Thursday", "easy", true),
      session("fri", "Friday", "easy", true),
      session("sat", "Saturday", "easy", true),
      session("sun", "Sunday", "easy", true),
    ]
    const plan = planWeekAdjustment(sessions, { days: { Wednesday: "blocked" } })
    expect(plan.actions).toEqual([
      { op: "skip", reason: "unplaced", sessionId: "wed", fromWeekday: "Wednesday", sessionKind: "tempo" },
    ])
  })

  it("removes a non-running session on a blocked day outright, never relocating it", () => {
    const sessions = [session("1", "Wednesday", "strength", false)]
    const plan = planWeekAdjustment(sessions, { days: { Wednesday: "blocked" } })
    expect(plan.actions).toEqual([
      { op: "skip", reason: "blocked", sessionId: "1", fromWeekday: "Wednesday", sessionKind: "strength" },
    ])
  })

  it("relocates an easy run off a blocked day too, not just hard sessions", () => {
    const sessions = [session("1", "Monday", "easy", true)]
    const plan = planWeekAdjustment(sessions, { days: { Monday: "blocked" } })
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0].op).toBe("move")
  })
})

describe("lighten days", () => {
  it("moves a hard session off a lighten day when another day is open", () => {
    const sessions = [session("1", "Tuesday", "tempo", true)]
    const plan = planWeekAdjustment(sessions, { days: { Tuesday: "lighten" } })
    expect(plan.actions).toEqual([
      { op: "move", sessionId: "1", fromWeekday: "Tuesday", toWeekday: "Monday", sessionKind: "tempo" },
    ])
  })

  it("never moves a hard session back onto the lighten day it came from", () => {
    const sessions = [session("1", "Tuesday", "tempo", true)]
    const plan = planWeekAdjustment(sessions, { days: { Tuesday: "lighten" } })
    const move = plan.actions[0]
    expect(move.op).toBe("move")
    if (move.op === "move") expect(move.toWeekday).not.toBe("Tuesday")
  })

  it("downgrades in place when a hard session on a lighten day cannot be relocated", () => {
    const sessions = [
      session("mon", "Monday", "easy", true),
      session("tue", "Tuesday", "tempo", true), // lighten, to be handled
      session("wed", "Wednesday", "easy", true),
      session("thu", "Thursday", "easy", true),
      session("fri", "Friday", "easy", true),
      session("sat", "Saturday", "easy", true),
      session("sun", "Sunday", "easy", true),
    ]
    const plan = planWeekAdjustment(sessions, { days: { Tuesday: "lighten" } })
    expect(plan.actions).toEqual([
      { op: "downgrade", toKind: "easy", sessionId: "tue", fromWeekday: "Tuesday", sessionKind: "tempo" },
    ])
  })

  it("leaves an easy session on a lighten day alone (already light enough)", () => {
    const sessions = [session("1", "Tuesday", "easy", true)]
    const plan = planWeekAdjustment(sessions, { days: { Tuesday: "lighten" } })
    expect(plan.actions).toEqual([])
  })

  it("does not touch a non-running session on a lighten day", () => {
    const sessions = [session("1", "Tuesday", "strength", false)]
    const plan = planWeekAdjustment(sessions, { days: { Tuesday: "lighten" } })
    expect(plan.actions).toEqual([])
  })
})

describe("spacing between hard sessions", () => {
  it("does not place two displaced hard sessions adjacent to each other when room allows better spacing", () => {
    const sessions = [
      session("a", "Monday", "threshold", true),
      session("b", "Wednesday", "tempo", true),
    ]
    const plan = planWeekAdjustment(sessions, {
      days: { Monday: "blocked", Wednesday: "blocked" },
    })
    const moves = plan.actions.filter((a) => a.op === "move") as Array<{ toWeekday: Weekday }>
    expect(moves).toHaveLength(2)
    const [d1, d2] = moves.map((m) =>
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(m.toWeekday),
    )
    expect(Math.abs(d1 - d2)).toBeGreaterThanOrEqual(2)
  })

  it("places the higher-priority (long) session before a lower-priority one when they compete for the same best slot", () => {
    const sessions = [
      session("tempo", "Monday", "tempo", true),
      session("long", "Tuesday", "long", true),
    ]
    // Both displaced onto the same open week; long should claim spacing/weekend
    // preference over tempo regardless of input order, since it sorts first.
    const plan = planWeekAdjustment(sessions, { days: { Monday: "blocked", Tuesday: "blocked" } })
    const longMove = plan.actions.find((a) => a.sessionId === "long")
    expect(longMove?.op).toBe("move")
    if (longMove?.op === "move") {
      expect(["Saturday", "Sunday"]).toContain(longMove.toWeekday)
    }
  })

  it("prefers a weekend day for a relocated long run when otherwise unconstrained", () => {
    const sessions = [session("1", "Monday", "long", true)]
    const plan = planWeekAdjustment(sessions, { days: { Monday: "blocked" } })
    expect(plan.actions[0]).toMatchObject({ op: "move", toWeekday: "Saturday" })
  })

  it("does not let the weekend preference override real spacing for the long run", () => {
    // A fixed hard session sits on Saturday. Sunday is the nearest weekend
    // day but only 1 day of spacing from it (score 1 + 0.5 bonus = 1.5);
    // Tuesday is 4 days from Saturday with no bonus (score 4). Spacing must
    // win — the 0.5 weekend nudge only breaks genuine ties, never outweighs it.
    const sessions = [
      session("fixed", "Saturday", "threshold", true),
      session("long", "Monday", "long", true),
    ]
    const plan = planWeekAdjustment(sessions, { days: { Monday: "blocked" } })
    const move = plan.actions.find((a) => a.sessionId === "long")
    expect(move).toMatchObject({ op: "move", toWeekday: "Tuesday" })
  })
})

describe("describeWeekAdjustment", () => {
  it("produces one readable line per action", () => {
    const sessions = [
      session("1", "Wednesday", "tempo", true),
      session("2", "Thursday", "strength", false),
    ]
    const plan = planWeekAdjustment(sessions, { days: { Wednesday: "blocked", Thursday: "blocked" } })
    const lines = describeWeekAdjustment(plan)
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => typeof l === "string" && l.length > 0)).toBe(true)
  })
})
