/**
 * Canonical scheduling engine.
 *
 * All schedule generation reads plan_json from training_plan_versions.
 * No reference to rotation.ts or hard-coded weekday assumptions.
 *
 * Public API:
 *   resolveCycleWeek()  — pure; which CycleWeek applies to a date
 *   getWeekdayName()    — pure; "Monday" | … from a date string
 *   resolveDayPlans()   — pure; full day-by-day plan for a date range
 *   generateSchedule()  — writes planned_workout_days + planned_sessions (idempotent)
 */

import { db } from "@/lib/db"
import { plannedWorkoutDays, plannedSessions } from "@/lib/db/schema"
import type { PlanJson, CycleWeek, Weekday } from "@/lib/plan/types"

// ─── Date helpers ─────────────────────────────────────────────────────────────

const WEEKDAY_NAMES: Weekday[] = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday",
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Parse YYYY-MM-DD as UTC midnight. Throws on invalid input. */
export function parseDateStr(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00.000Z")
  if (isNaN(d.getTime())) throw new Error(`Invalid date string: "${dateStr}"`)
  return d
}

/** Format a Date as YYYY-MM-DD (UTC). */
export function formatDateStr(date: Date): string {
  return date.toISOString().split("T")[0]
}

/** Advance a YYYY-MM-DD string by N days (UTC). */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(parseDateStr(dateStr).getTime() + n * MS_PER_DAY)
  return formatDateStr(d)
}

/** Weekday name for a UTC date string ("Monday" … "Sunday"). */
export function getWeekdayName(dateStr: string): Weekday {
  return WEEKDAY_NAMES[parseDateStr(dateStr).getUTCDay()]
}

// ─── Cycle resolver (pure) ────────────────────────────────────────────────────

/**
 * Resolve which CycleWeek applies to a calendar date.
 *
 * The cycle is a repeating sequence of arbitrary length. The cycle started on
 * `cycleStartDate` with `cycleStartWeekId` active. For any target date:
 *
 *   weeksSinceCycleStart = floor((targetDate − cycleStartDate) / 7 days)
 *   cycleIndex           = (startIndex + weeksSinceCycleStart) mod cycleLen
 *
 * The modulo handles negative offsets (dates before cycleStartDate) correctly
 * via the always-positive ((x % n) + n) % n idiom.
 *
 * No assumption about cycle length. Works for 3-week, 4-week, 5-week, or
 * any-length cycles with any string IDs.
 */
export function resolveCycleWeek(
  cycleWeeks: CycleWeek[],
  cycleStartDate: string,
  cycleStartWeekId: string,
  targetDateStr: string
): CycleWeek {
  const len = cycleWeeks.length
  const startIdx = cycleWeeks.findIndex((w) => w.id === cycleStartWeekId)
  if (startIdx === -1) {
    throw new Error(
      `cycleStartWeekId "${cycleStartWeekId}" not found in cycleWeeks ` +
      `[${cycleWeeks.map((w) => w.id).join(", ")}]`
    )
  }

  const startMs = parseDateStr(cycleStartDate).getTime()
  const targetMs = parseDateStr(targetDateStr).getTime()
  // Math.round handles any sub-millisecond floating-point drift from DST zones
  const daysFromStart = Math.round((targetMs - startMs) / MS_PER_DAY)
  const weeksDiff = Math.floor(daysFromStart / 7)
  const cycleIdx = ((startIdx + weeksDiff) % len + len) % len

  return cycleWeeks[cycleIdx]
}

// ─── Day plan builder (pure) ──────────────────────────────────────────────────

export interface SessionPlan {
  sessionKind: string
  customType: string | undefined
  label: string
  prescription: string
  isRunSession: boolean
  isStrengthSession: boolean
  sequenceInDay: number
  targetDistanceM: number | undefined
  targetDurationSecs: number | undefined
  targetHrMin: number | undefined
  targetHrMax: number | undefined
  targetPaceMinPerKm: number | undefined
  intervalsJson: unknown
}

export interface DayPlan {
  date: string
  weekday: Weekday
  cycleWeekId: string
  cycleWeekLabel: string
  isRestDay: boolean
  sessions: SessionPlan[]
}

/**
 * Pure function: compute one DayPlan per date in [fromDateStr, fromDateStr + days).
 * No DB access. Safe to call in tests without mocking.
 */
export function resolveDayPlans(
  planJson: PlanJson,
  cycleStartDate: string,
  cycleStartWeekId: string,
  fromDateStr: string,
  days: number
): DayPlan[] {
  const result: DayPlan[] = []

  for (let i = 0; i < days; i++) {
    const dateStr = addDays(fromDateStr, i)
    const weekday = getWeekdayName(dateStr)
    const cycleWeek = resolveCycleWeek(
      planJson.cycleWeeks, cycleStartDate, cycleStartWeekId, dateStr
    )

    const dayTemplate = cycleWeek.days.find((dt) => dt.weekday === weekday)
    const sessions = dayTemplate?.sessions ?? []

    result.push({
      date: dateStr,
      weekday,
      cycleWeekId: cycleWeek.id,
      cycleWeekLabel: cycleWeek.label,
      isRestDay: sessions.length === 0,
      sessions: sessions.map((s, idx) => ({
        sessionKind: s.sessionKind,
        customType: s.customType,
        label: s.label,
        prescription: s.prescription,
        isRunSession: s.isRunSession,
        isStrengthSession: s.isStrengthSession,
        sequenceInDay: idx,
        targetDistanceM: s.targetDistanceM,
        targetDurationSecs: s.targetDurationSecs,
        targetHrMin: s.targetHrMin,
        targetHrMax: s.targetHrMax,
        targetPaceMinPerKm: s.targetPaceMinPerKm,
        intervalsJson: s.intervals ?? null,
      })),
    })
  }

  return result
}

// ─── DB writer (idempotent) ───────────────────────────────────────────────────

export interface GenerateResult {
  daysCreated: number
  sessionsCreated: number
}

/**
 * Write planned_workout_days + planned_sessions rows for a date range.
 *
 * Idempotent: UNIQUE(user_id, scheduled_date, plan_version_id) with
 * onConflictDoNothing means calling this twice produces identical DB state.
 * Sessions are only inserted when the day row is newly created.
 */
export async function generateSchedule(
  userId: string,
  planVersionId: string,
  planJson: PlanJson,
  cycleStartDate: string,
  cycleStartWeekId: string,
  fromDateStr: string,
  days: number
): Promise<GenerateResult> {
  const dayPlans = resolveDayPlans(
    planJson, cycleStartDate, cycleStartWeekId, fromDateStr, days
  )

  let daysCreated = 0
  let sessionsCreated = 0

  for (const plan of dayPlans) {
    const dayRows = await db
      .insert(plannedWorkoutDays)
      .values({
        userId,
        planVersionId,
        scheduledDate: plan.date,
        weekday: plan.weekday,
        cycleWeekId: plan.cycleWeekId,
        isRestDay: plan.isRestDay,
      })
      .onConflictDoNothing()
      .returning()

    // If conflict (day already exists), skip session inserts for this day
    if (dayRows.length === 0) continue
    daysCreated++

    const dayId = dayRows[0].id
    if (plan.sessions.length > 0) {
      // Batch all sessions for this day in one round-trip instead of N sequential inserts.
      await db.insert(plannedSessions).values(
        plan.sessions.map((s) => ({
          plannedDayId: dayId,
          userId,
          planVersionId,
          sessionKind: s.sessionKind,
          customType: s.customType,
          label: s.label,
          prescription: s.prescription,
          isRunSession: s.isRunSession,
          isStrengthSession: s.isStrengthSession,
          sequenceInDay: s.sequenceInDay,
          targetDistanceM: s.targetDistanceM,
          targetDurationSecs: s.targetDurationSecs,
          targetHrMin: s.targetHrMin,
          targetHrMax: s.targetHrMax,
          targetPaceMinPerKm: s.targetPaceMinPerKm,
          intervalsJson: s.intervalsJson,
          status: "planned" as const,
        }))
      )
      sessionsCreated += plan.sessions.length
    }
  }

  return { daysCreated, sessionsCreated }
}
