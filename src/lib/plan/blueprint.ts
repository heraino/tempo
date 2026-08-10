/**
 * Program blueprints.
 *
 * A blueprint is the compact, high-level shape of a training program: which
 * session kinds fall on which weekday of which cycle week, and how mileage
 * progresses. It is the only thing the coach produces when generating a program.
 *
 * Expanding a blueprint into a full PlanJson — labels, prescriptions, run and
 * strength flags — is done here, deterministically. The model never authors
 * plan structure directly, so a generated program is always well-formed
 * regardless of model output quality.
 */

import type { PlanJson, SessionKind, Weekday, CycleWeek, SessionTemplate } from "./types"
import { SESSION_KIND_META } from "./sessionKinds"

export const ALL_WEEKDAYS: Weekday[] = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]

export interface BlueprintDay {
  weekday: Weekday
  /** Empty means a rest day. */
  sessionKinds: SessionKind[]
}

export interface BlueprintWeek {
  id: string
  label: string
  isCutback?: boolean
  days: BlueprintDay[]
}

export interface BlueprintProgressionBlock {
  blockNumber: number
  buildMinMi: number
  buildMaxMi: number
  cutbackMinMi: number
  cutbackMaxMi: number
}

export interface ProgramBlueprint {
  planName: string
  summary: string
  cycleWeeks: BlueprintWeek[]
  progressionBlocks: BlueprintProgressionBlock[]
  notes: string[]
}

export class BlueprintError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BlueprintError"
  }
}

/** Build a full SessionTemplate from a bare session kind. */
function expandSession(kind: SessionKind): SessionTemplate {
  const meta = SESSION_KIND_META[kind]
  if (!meta) throw new BlueprintError(`Unknown session kind "${kind}"`)
  return {
    sessionKind: kind,
    label: meta.label,
    prescription: meta.defaultPrescription,
    isRunSession: meta.isRunSession,
    isStrengthSession: meta.isStrengthSession,
  }
}

/**
 * Expand a blueprint into a complete PlanJson.
 *
 * Every cycle week is filled out to all seven weekdays — days the blueprint
 * omits become explicit rest days, so the scheduler never encounters a gap.
 */
export function blueprintToPlanJson(blueprint: ProgramBlueprint): PlanJson {
  if (blueprint.cycleWeeks.length === 0) {
    throw new BlueprintError("A program needs at least one cycle week")
  }

  const seenIds = new Set<string>()
  const cycleWeeks: CycleWeek[] = blueprint.cycleWeeks.map((week) => {
    if (seenIds.has(week.id)) {
      throw new BlueprintError(`Duplicate cycle week id "${week.id}"`)
    }
    seenIds.add(week.id)

    const byWeekday = new Map<Weekday, SessionKind[]>()
    for (const day of week.days) {
      if (byWeekday.has(day.weekday)) {
        throw new BlueprintError(
          `Cycle week "${week.id}" lists ${day.weekday} more than once`,
        )
      }
      byWeekday.set(day.weekday, day.sessionKinds)
    }

    return {
      id: week.id,
      label: week.label,
      ...(week.isCutback ? { isCutback: true } : {}),
      days: ALL_WEEKDAYS.map((weekday) => ({
        weekday,
        sessions: (byWeekday.get(weekday) ?? [])
          // "rest" is represented by the absence of sessions, not a session
          .filter((kind) => kind !== "rest")
          .map(expandSession),
      })),
    }
  })

  return {
    version: 1,
    cycleWeeks,
    ...(blueprint.progressionBlocks.length > 0
      ? { progressionBlocks: [...blueprint.progressionBlocks] }
      : {}),
  }
}

// ─── Derived summaries (for showing the athlete what they're accepting) ───────

export interface WeekSummary {
  id: string
  label: string
  isCutback: boolean
  runDays: number
  restDays: number
  qualityDays: number
  sessionsByDay: Array<{ weekday: Weekday; kinds: SessionKind[] }>
}

const QUALITY_KINDS = new Set<SessionKind>(["tempo", "threshold", "progression"])

/** Per-week counts used by the program preview. */
export function summarizeBlueprint(blueprint: ProgramBlueprint): WeekSummary[] {
  return blueprint.cycleWeeks.map((week) => {
    const byWeekday = new Map<Weekday, SessionKind[]>()
    for (const day of week.days) byWeekday.set(day.weekday, day.sessionKinds)

    const sessionsByDay = ALL_WEEKDAYS.map((weekday) => ({
      weekday,
      kinds: (byWeekday.get(weekday) ?? []).filter((k) => k !== "rest"),
    }))

    const runDays = sessionsByDay.filter((d) =>
      d.kinds.some((k) => SESSION_KIND_META[k]?.isRunSession),
    ).length

    const qualityDays = sessionsByDay.filter((d) =>
      d.kinds.some((k) => QUALITY_KINDS.has(k)),
    ).length

    return {
      id: week.id,
      label: week.label,
      isCutback: week.isCutback ?? false,
      runDays,
      restDays: sessionsByDay.filter((d) => d.kinds.length === 0).length,
      qualityDays,
      sessionsByDay,
    }
  })
}

/**
 * Guardrails applied to a generated program before the athlete ever sees it.
 * These are training-safety checks, not style preferences: they catch the
 * failure modes that actually hurt people — too much intensity, no rest, or a
 * jump in volume the athlete has not earned.
 */
export interface BlueprintWarning {
  code: string
  message: string
}

export function checkBlueprintSafety(
  blueprint: ProgramBlueprint,
  opts: { currentWeeklyMi?: number | null; runnerLevel?: string | null } = {},
): BlueprintWarning[] {
  const warnings: BlueprintWarning[] = []
  const summaries = summarizeBlueprint(blueprint)

  for (const week of summaries) {
    if (week.qualityDays > 3) {
      warnings.push({
        code: "too_much_intensity",
        message: `Week ${week.id} has ${week.qualityDays} hard sessions — more than 3 is a lot of intensity for one week.`,
      })
    }
    if (week.restDays === 0) {
      warnings.push({
        code: "no_rest_day",
        message: `Week ${week.id} has no full rest day.`,
      })
    }
    if (opts.runnerLevel === "beginner" && week.qualityDays > 2) {
      warnings.push({
        code: "beginner_intensity",
        message: `Week ${week.id} has ${week.qualityDays} hard sessions, which is aggressive for a newer runner.`,
      })
    }
  }

  // Opening volume should be within reach of what the athlete is already doing
  const firstBlock = [...blueprint.progressionBlocks].sort(
    (a, b) => a.blockNumber - b.blockNumber,
  )[0]
  const current = opts.currentWeeklyMi
  if (firstBlock && current != null && current > 0) {
    if (firstBlock.buildMaxMi > current * 1.5) {
      warnings.push({
        code: "volume_jump",
        message: `The program opens at up to ${firstBlock.buildMaxMi} mi/week against your current ${Math.round(current)} mi/week — a jump of more than 50%.`,
      })
    }
  }

  for (const block of blueprint.progressionBlocks) {
    if (block.buildMinMi > block.buildMaxMi || block.cutbackMinMi > block.cutbackMaxMi) {
      warnings.push({
        code: "inverted_range",
        message: `Block ${block.blockNumber} has a mileage range whose minimum exceeds its maximum.`,
      })
    }
    if (block.cutbackMaxMi > block.buildMaxMi) {
      warnings.push({
        code: "cutback_not_lighter",
        message: `Block ${block.blockNumber}'s cutback weeks are not lighter than its build weeks.`,
      })
    }
  }

  return warnings
}
