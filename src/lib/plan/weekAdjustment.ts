/**
 * Deterministic single-week rebalancing.
 *
 * Given the athlete's constraints for the current week — which days they
 * can't run at all ("blocked") and which days they can run but need easier
 * ("lighten") — this computes the best redistribution of the week's run
 * sessions across the days that remain available, preserving spacing between
 * hard efforts wherever possible.
 *
 * This is a constraint-satisfaction problem with a correct, checkable answer,
 * not a judgment call — so it's solved with an algorithm, not the model. The
 * output is a list of day-level operations (skip / move / downgrade), applied
 * through the same primitives Phase 1 already uses. Nothing here creates a
 * new plan version; it only rearranges what was already prescribed.
 */

import type { SessionKind, Weekday } from "./types"
import { ALL_WEEKDAYS } from "./blueprint"

export type DayConstraint = "blocked" | "lighten" | "normal"

export interface WeekConstraints {
  /** Days absent from this map are treated as "normal" (unconstrained). */
  days: Partial<Record<Weekday, DayConstraint>>
}

export interface WeekAdjustmentSessionInput {
  id: string
  weekday: Weekday
  sessionKind: SessionKind
  isRunSession: boolean
  /** Only "planned" sessions are eligible for rebalancing. */
  status: string
}

interface BaseAction {
  sessionId: string
  fromWeekday: Weekday
  sessionKind: SessionKind
}

export interface SkipAction extends BaseAction {
  op: "skip"
  /** blocked = the day itself is unavailable; unplaced = needed a new day but none was open. */
  reason: "blocked" | "unplaced"
}

export interface MoveAction extends BaseAction {
  op: "move"
  toWeekday: Weekday
}

export interface DowngradeAction extends BaseAction {
  op: "downgrade"
  toKind: SessionKind
}

export type WeekAdjustmentAction = SkipAction | MoveAction | DowngradeAction

export interface WeekAdjustmentPlan {
  actions: WeekAdjustmentAction[]
}

// Sessions demanding real recovery — these are the ones spacing matters for,
// and the ones a "lighten" day may not hold.
const HARD_KINDS = new Set<SessionKind>(["long", "threshold", "tempo", "progression"])

// Placed first, in this order, so the hardest-to-relocate work claims the
// best remaining slot before lower-stakes sessions pick over what's left.
const PRIORITY: Partial<Record<SessionKind, number>> = {
  long: 5,
  threshold: 4,
  tempo: 4,
  progression: 3,
  easy: 2,
  recovery: 1,
  strides: 1,
}

const WEEKEND = new Set<Weekday>(["Saturday", "Sunday"])

function dayIndex(weekday: Weekday): number {
  return ALL_WEEKDAYS.indexOf(weekday)
}

function constraintFor(constraints: WeekConstraints, weekday: Weekday): DayConstraint {
  return constraints.days[weekday] ?? "normal"
}

function isHard(kind: SessionKind): boolean {
  return HARD_KINDS.has(kind)
}

// One more than any distance possible within a 7-day week — used as "no
// other hard session to be near" instead of Infinity, so the weekend
// tiebreak below (added as a fraction) can still distinguish candidates:
// Infinity + 0.5 === Infinity in IEEE754, which would silently defeat it.
const MAX_DISTANCE = ALL_WEEKDAYS.length

/** Minimum weekday-distance from `slot` to any index in `others`. */
function minDistance(slot: number, others: Set<number>): number {
  let min = MAX_DISTANCE
  for (const o of others) {
    const d = Math.abs(slot - o)
    if (d < min) min = d
  }
  return min
}

/**
 * Compute the day-level operations that best satisfy the given constraints.
 *
 * Rules, in short:
 * - A "blocked" day holds nothing. Any run session there must move to an
 *   open day; if no day is open, it's skipped ("unplaced").
 * - A "lighten" day may keep an easy/recovery/strides session, but not a
 *   hard one. A hard session there is moved if a day opens up for it;
 *   otherwise it's downgraded to easy in place, so the athlete still trains
 *   that day, just lighter.
 * - Non-running sessions (strength, elastic) are only affected by "blocked"
 *   days, where they're skipped outright — they aren't part of the run
 *   redistribution this solves for.
 * - Placement favors the slot that maximizes spacing from the week's other
 *   hard efforts; ties for a long run prefer a weekend day.
 */
export function planWeekAdjustment(
  sessions: WeekAdjustmentSessionInput[],
  constraints: WeekConstraints
): WeekAdjustmentPlan {
  const planned = sessions.filter((s) => s.status === "planned")
  const actions: WeekAdjustmentAction[] = []

  // Non-run sessions on a blocked day are simply removed.
  for (const s of planned) {
    if (!s.isRunSession && constraintFor(constraints, s.weekday) === "blocked") {
      actions.push({ op: "skip", reason: "blocked", sessionId: s.id, fromWeekday: s.weekday, sessionKind: s.sessionKind })
    }
  }

  const runSessions = planned.filter((s) => s.isRunSession)

  function needsRelocation(s: WeekAdjustmentSessionInput): boolean {
    const c = constraintFor(constraints, s.weekday)
    if (c === "blocked") return true
    if (c === "lighten" && isHard(s.sessionKind)) return true
    return false
  }

  const fixed = runSessions.filter((s) => !needsRelocation(s))
  const displaced = runSessions
    .filter(needsRelocation)
    .slice()
    .sort((a, b) => {
      const pa = PRIORITY[a.sessionKind] ?? 0
      const pb = PRIORITY[b.sessionKind] ?? 0
      if (pb !== pa) return pb - pa
      return dayIndex(a.weekday) - dayIndex(b.weekday) // deterministic tiebreak
    })

  // A day is open if it isn't blocked and no fixed session already sits there.
  const occupiedByFixed = new Set(fixed.map((s) => s.weekday))
  const openWeekdays = ALL_WEEKDAYS.filter(
    (w) => constraintFor(constraints, w) !== "blocked" && !occupiedByFixed.has(w)
  )
  const openSet = new Set(openWeekdays)

  const hardWeekdayIndices = new Set(fixed.filter((s) => isHard(s.sessionKind)).map((s) => dayIndex(s.weekday)))

  for (const s of displaced) {
    const eligible = Array.from(openSet).filter((w) => {
      if (isHard(s.sessionKind)) return constraintFor(constraints, w) === "normal"
      return true // a non-hard session can land on a normal or lighten open day
    })

    if (eligible.length === 0) {
      const fallback = constraintFor(constraints, s.weekday)
      if (fallback === "lighten" && isHard(s.sessionKind)) {
        actions.push({
          op: "downgrade",
          toKind: "easy",
          sessionId: s.id,
          fromWeekday: s.weekday,
          sessionKind: s.sessionKind,
        })
      } else {
        actions.push({
          op: "skip",
          reason: "unplaced",
          sessionId: s.id,
          fromWeekday: s.weekday,
          sessionKind: s.sessionKind,
        })
      }
      continue
    }

    let best = eligible[0]
    if (isHard(s.sessionKind)) {
      let bestScore = -1
      for (const w of eligible) {
        let score = minDistance(dayIndex(w), hardWeekdayIndices)
        // Weekend tiebreak for the long run only, applied as a fractional
        // nudge so it only breaks genuine ties, never overrides spacing.
        if (s.sessionKind === "long" && WEEKEND.has(w)) score += 0.5
        if (score > bestScore) {
          bestScore = score
          best = w
        }
      }
    } else {
      best = eligible.slice().sort((a, b) => dayIndex(a) - dayIndex(b))[0]
    }

    openSet.delete(best)
    if (isHard(s.sessionKind)) hardWeekdayIndices.add(dayIndex(best))

    actions.push({ op: "move", toWeekday: best, sessionId: s.id, fromWeekday: s.weekday, sessionKind: s.sessionKind })
  }

  return { actions }
}

/** Human-readable summary lines for a plan, for the preview UI. */
export function describeWeekAdjustment(plan: WeekAdjustmentPlan): string[] {
  return plan.actions.map((a) => {
    switch (a.op) {
      case "skip":
        return a.reason === "blocked"
          ? `${a.fromWeekday}: ${a.sessionKind} skipped (day unavailable)`
          : `${a.fromWeekday}: ${a.sessionKind} skipped (no open day to move it to)`
      case "move":
        return `${a.fromWeekday} → ${a.toWeekday}: ${a.sessionKind} moved`
      case "downgrade":
        return `${a.fromWeekday}: ${a.sessionKind} → ${a.toKind} (lightened, kept in place)`
    }
  })
}
