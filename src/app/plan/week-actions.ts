"use server"

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getScheduleRange } from "@/lib/services/plan.service"
import { skipSession, rescheduleSession, changeSessionType } from "@/lib/services/completion.service"
import {
  planWeekAdjustment,
  describeWeekAdjustment,
  type WeekConstraints,
  type WeekAdjustmentAction,
} from "@/lib/plan/weekAdjustment"
import { sessionKindMeta } from "@/lib/plan/sessionKinds"
import { addDays } from "@/lib/plan/scheduler"
import { WEEKDAYS } from "@/lib/validation/plan"
import type { Weekday, SessionKind } from "@/lib/plan/types"

const mondaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid week")
const dayConstraintSchema = z.enum(["blocked", "lighten", "normal"])
const constraintsInputSchema = z.record(z.string(), dayConstraintSchema)

/** Narrow a client-supplied {weekday: constraint} object to WeekConstraints. */
function toWeekConstraints(raw: Record<string, string>): WeekConstraints {
  const days: WeekConstraints["days"] = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!(WEEKDAYS as readonly string[]).includes(key)) continue
    if (value === "blocked" || value === "lighten") {
      days[key as Weekday] = value
    }
  }
  return { days }
}

/** Fetch this week's still-adjustable sessions in the shape the algorithm needs. */
async function loadWeekSessions(userId: string, monday: string) {
  const schedule = await getScheduleRange(userId, monday, 7)
  if (!schedule) return null
  return schedule.scheduledDays.flatMap((day) =>
    day.sessions.map((s) => ({
      id: s.id,
      weekday: day.weekday as Weekday,
      sessionKind: s.sessionKind as SessionKind,
      isRunSession: s.isRunSession,
      status: s.status,
    }))
  )
}

export interface WeekAdjustmentPreview {
  ok: boolean
  error?: string
  actions?: WeekAdjustmentAction[]
  summary?: string[]
}

export async function previewWeekAdjustment(
  monday: string,
  rawConstraints: unknown
): Promise<WeekAdjustmentPreview> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const mondayParsed = mondaySchema.safeParse(monday)
  if (!mondayParsed.success) return { ok: false, error: mondayParsed.error.issues[0].message }

  const constraintsParsed = constraintsInputSchema.safeParse(rawConstraints)
  if (!constraintsParsed.success) return { ok: false, error: "Invalid day selections" }
  const constraints = toWeekConstraints(constraintsParsed.data)

  if (Object.keys(constraints.days).length === 0) {
    return { ok: false, error: "Mark at least one day before previewing changes" }
  }

  const sessions = await loadWeekSessions(session.user.id, mondayParsed.data)
  if (!sessions) return { ok: false, error: "No active training plan" }

  const plan = planWeekAdjustment(sessions, constraints)
  return { ok: true, actions: plan.actions, summary: describeWeekAdjustment(plan) }
}

/**
 * Apply the adjustment for a week. Re-runs the algorithm against the schedule
 * as it stands right now rather than trusting the actions returned by an
 * earlier preview — the constraints are the athlete's durable intent; if the
 * schedule changed in between (e.g. a session was edited in another tab),
 * recomputing from current state is the correct behavior, not a stale replay.
 */
export async function applyWeekAdjustment(
  monday: string,
  rawConstraints: unknown
): Promise<{ ok: boolean; error?: string; applied?: number }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }
  const userId = session.user.id

  const mondayParsed = mondaySchema.safeParse(monday)
  if (!mondayParsed.success) return { ok: false, error: mondayParsed.error.issues[0].message }

  const constraintsParsed = constraintsInputSchema.safeParse(rawConstraints)
  if (!constraintsParsed.success) return { ok: false, error: "Invalid day selections" }
  const constraints = toWeekConstraints(constraintsParsed.data)

  if (Object.keys(constraints.days).length === 0) {
    return { ok: false, error: "Mark at least one day first" }
  }

  const sessions = await loadWeekSessions(userId, mondayParsed.data)
  if (!sessions) return { ok: false, error: "No active training plan" }

  const plan = planWeekAdjustment(sessions, constraints)

  let applied = 0
  for (const action of plan.actions) {
    try {
      if (action.op === "skip") {
        const reason =
          action.reason === "blocked" ? "Adjusted: day unavailable" : "Adjusted: no open day to move to"
        const result = await skipSession(action.sessionId, userId, reason)
        if (result) applied++
      } else if (action.op === "move") {
        const weekdayIndex = (WEEKDAYS as readonly string[]).indexOf(action.toWeekday)
        const targetDate = addDays(mondayParsed.data, weekdayIndex)
        await rescheduleSession(action.sessionId, userId, targetDate, "Adjusted: week rebalance")
        applied++
      } else if (action.op === "downgrade") {
        const meta = sessionKindMeta(action.toKind)
        const result = await changeSessionType(action.sessionId, userId, action.toKind, {
          label: meta.label,
          prescription: meta.defaultPrescription,
          isRunSession: meta.isRunSession,
          isStrengthSession: meta.isStrengthSession,
          reason: "Adjusted: lightened for the week",
        })
        if (result) applied++
      }
    } catch (err) {
      console.error(`week adjustment: failed to apply action for session ${action.sessionId}:`, err)
    }
  }

  revalidatePath(`/plan/week/${mondayParsed.data}`)
  revalidatePath("/plan")
  revalidatePath("/dashboard")

  return { ok: true, applied }
}
