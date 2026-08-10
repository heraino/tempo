/**
 * Deterministic plan_json transforms.
 *
 * The AI never writes plan structure. It proposes one of these named ops with
 * validated parameters, and this module applies it — so every structural change
 * is reproducible, reviewable, and independent of model output quality.
 *
 * All functions are pure: the input plan is never mutated.
 */

import type { PlanJson, SessionKind, Weekday } from "./types"
import { SESSION_KIND_META } from "./sessionKinds"

export class PlanMutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PlanMutationError"
  }
}

export type PlanMutationOp =
  | {
      op: "swap_session_kind"
      cycleWeekId: string
      weekday: Weekday
      fromKind: SessionKind
      toKind: SessionKind
    }
  | { op: "remove_session"; cycleWeekId: string; weekday: Weekday; sessionKind: SessionKind }
  | { op: "add_session"; cycleWeekId: string; weekday: Weekday; sessionKind: SessionKind }
  | {
      op: "move_session"
      cycleWeekId: string
      fromWeekday: Weekday
      toWeekday: Weekday
      sessionKind: SessionKind
    }
  | { op: "scale_mileage"; blockNumber?: number; factorPct: number }
  | { op: "set_cutback"; cycleWeekId: string; isCutback: boolean }

export const PLAN_MUTATION_OPS = [
  "swap_session_kind",
  "remove_session",
  "add_session",
  "move_session",
  "scale_mileage",
  "set_cutback",
] as const

function clone(plan: PlanJson): PlanJson {
  return structuredClone(plan)
}

function findWeek(plan: PlanJson, cycleWeekId: string) {
  const week = plan.cycleWeeks.find((w) => w.id === cycleWeekId)
  if (!week) {
    throw new PlanMutationError(
      `Cycle week "${cycleWeekId}" is not in this plan (have: ${plan.cycleWeeks
        .map((w) => w.id)
        .join(", ")})`,
    )
  }
  return week
}

function findDay(plan: PlanJson, cycleWeekId: string, weekday: Weekday) {
  const week = findWeek(plan, cycleWeekId)
  const day = week.days.find((d) => d.weekday === weekday)
  if (!day) {
    throw new PlanMutationError(`${weekday} is not defined in cycle week "${cycleWeekId}"`)
  }
  return day
}

/** Round to 1 decimal to keep mileage targets tidy. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Apply a single mutation, returning the new plan and a human-readable summary
 * of exactly what changed. The summary is stored as the plan version's
 * changeReason so the athlete can always see why a version exists.
 */
export function applyPlanMutation(
  plan: PlanJson,
  mutation: PlanMutationOp,
): { plan: PlanJson; summary: string } {
  const next = clone(plan)

  switch (mutation.op) {
    case "swap_session_kind": {
      const day = findDay(next, mutation.cycleWeekId, mutation.weekday)
      const target = day.sessions.find((s) => s.sessionKind === mutation.fromKind)
      if (!target) {
        throw new PlanMutationError(
          `No ${mutation.fromKind} session on ${mutation.weekday} in week "${mutation.cycleWeekId}"`,
        )
      }
      const meta = SESSION_KIND_META[mutation.toKind]
      target.sessionKind = mutation.toKind
      target.label = meta.label
      target.prescription = meta.defaultPrescription
      target.isRunSession = meta.isRunSession
      target.isStrengthSession = meta.isStrengthSession
      // Targets from the old session kind no longer apply
      delete target.targetHrMin
      delete target.targetHrMax
      delete target.targetPaceMinPerKm
      delete target.intervals
      return {
        plan: next,
        summary: `Week ${mutation.cycleWeekId} ${mutation.weekday}: ${mutation.fromKind} → ${mutation.toKind}`,
      }
    }

    case "remove_session": {
      const day = findDay(next, mutation.cycleWeekId, mutation.weekday)
      const index = day.sessions.findIndex((s) => s.sessionKind === mutation.sessionKind)
      if (index === -1) {
        throw new PlanMutationError(
          `No ${mutation.sessionKind} session on ${mutation.weekday} in week "${mutation.cycleWeekId}"`,
        )
      }
      day.sessions.splice(index, 1)
      return {
        plan: next,
        summary: `Week ${mutation.cycleWeekId} ${mutation.weekday}: removed ${mutation.sessionKind}`,
      }
    }

    case "add_session": {
      const day = findDay(next, mutation.cycleWeekId, mutation.weekday)
      const meta = SESSION_KIND_META[mutation.sessionKind]
      day.sessions.push({
        sessionKind: mutation.sessionKind,
        label: meta.label,
        prescription: meta.defaultPrescription,
        isRunSession: meta.isRunSession,
        isStrengthSession: meta.isStrengthSession,
      })
      return {
        plan: next,
        summary: `Week ${mutation.cycleWeekId} ${mutation.weekday}: added ${mutation.sessionKind}`,
      }
    }

    case "move_session": {
      if (mutation.fromWeekday === mutation.toWeekday) {
        throw new PlanMutationError("Source and target weekday are the same")
      }
      const fromDay = findDay(next, mutation.cycleWeekId, mutation.fromWeekday)
      const toDay = findDay(next, mutation.cycleWeekId, mutation.toWeekday)
      const index = fromDay.sessions.findIndex((s) => s.sessionKind === mutation.sessionKind)
      if (index === -1) {
        throw new PlanMutationError(
          `No ${mutation.sessionKind} session on ${mutation.fromWeekday} in week "${mutation.cycleWeekId}"`,
        )
      }
      const [moved] = fromDay.sessions.splice(index, 1)
      toDay.sessions.push(moved)
      return {
        plan: next,
        summary: `Week ${mutation.cycleWeekId}: moved ${mutation.sessionKind} from ${mutation.fromWeekday} to ${mutation.toWeekday}`,
      }
    }

    case "scale_mileage": {
      const blocks = next.progressionBlocks
      if (!blocks || blocks.length === 0) {
        throw new PlanMutationError("This plan has no mileage progression to scale")
      }
      if (mutation.factorPct === 0) {
        throw new PlanMutationError("Mileage change must be non-zero")
      }
      if (mutation.factorPct < -50 || mutation.factorPct > 50) {
        throw new PlanMutationError("Mileage change must be within ±50%")
      }

      const targets =
        mutation.blockNumber != null
          ? blocks.filter((b) => b.blockNumber === mutation.blockNumber)
          : blocks

      if (targets.length === 0) {
        throw new PlanMutationError(`Block ${mutation.blockNumber} is not in this plan`)
      }

      const factor = 1 + mutation.factorPct / 100
      for (const block of targets) {
        block.buildMinMi = round1(block.buildMinMi * factor)
        block.buildMaxMi = round1(block.buildMaxMi * factor)
        block.cutbackMinMi = round1(block.cutbackMinMi * factor)
        block.cutbackMaxMi = round1(block.cutbackMaxMi * factor)
      }

      const scope =
        mutation.blockNumber != null ? `block ${mutation.blockNumber}` : "all blocks"
      const direction = mutation.factorPct > 0 ? "+" : ""
      return {
        plan: next,
        summary: `Mileage targets ${direction}${mutation.factorPct}% (${scope})`,
      }
    }

    case "set_cutback": {
      const week = findWeek(next, mutation.cycleWeekId)
      week.isCutback = mutation.isCutback
      return {
        plan: next,
        summary: `Week ${mutation.cycleWeekId} marked as ${
          mutation.isCutback ? "a cutback week" : "a build week"
        }`,
      }
    }

    default: {
      // Exhaustiveness guard — a new op must be handled above
      const exhaustive: never = mutation
      throw new PlanMutationError(`Unsupported mutation: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/** Apply several mutations in order, accumulating summaries. */
export function applyPlanMutations(
  plan: PlanJson,
  mutations: PlanMutationOp[],
): { plan: PlanJson; summaries: string[] } {
  let current = plan
  const summaries: string[] = []
  for (const mutation of mutations) {
    const result = applyPlanMutation(current, mutation)
    current = result.plan
    summaries.push(result.summary)
  }
  return { plan: current, summaries }
}
