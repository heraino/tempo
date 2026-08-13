/**
 * Session completion service — reconciliation primitives.
 *
 * Provides the state-transition methods for planned_sessions:
 *   planned → completed (via completeSession)
 *   planned → skipped   (via skipSession)
 *   planned → rescheduled (via rescheduleSession, inserts new session on target date)
 *
 * findMatchingRunSession() is the reconciliation primitive that locates the
 * best planned run session for a completed workout log on a given date.
 * Called from the upload pipeline when associating a FIT file to a plan.
 */

import { db } from "@/lib/db"
import { plannedSessions, sessionCompletions, plannedWorkoutDays, workoutLogs } from "@/lib/db/schema"
import { and, eq, gte, asc } from "drizzle-orm"
import { isRunningSport } from "@/lib/analytics/classify"
import { getOrCreatePlanVersion, getAthleteTimezone } from "@/lib/services/plan.service"
import { resolveLocalDateForInstant } from "@/lib/plan/localDate"

// ─── Complete ─────────────────────────────────────────────────────────────────

/**
 * Mark a planned session as completed and create the session_completions link.
 * If workoutLogId is null the session is marked done without a FIT file
 * (e.g. strength or elastic work).
 */
export async function completeSession(
  plannedSessionId: string,
  userId: string,
  workoutLogId: string | null,
  completedAt: Date
) {
  const updated = await db
    .update(plannedSessions)
    .set({ status: "completed", updatedAt: completedAt })
    .where(and(eq(plannedSessions.id, plannedSessionId), eq(plannedSessions.userId, userId)))
    .returning({ id: plannedSessions.id })

  // No row matched (wrong id, or the session belongs to a different user) —
  // bail out before creating a session_completions link to it.
  if (updated.length === 0) return null

  const rows = await db
    .insert(sessionCompletions)
    .values({
      plannedSessionId,
      userId,
      workoutLogId,
      completedAt,
    })
    .onConflictDoNothing()
    .returning()

  return rows[0] ?? null
}

// ─── Skip ─────────────────────────────────────────────────────────────────────

export async function skipSession(
  plannedSessionId: string,
  userId: string,
  reason?: string
) {
  const rows = await db
    .update(plannedSessions)
    .set({
      status: "skipped",
      adjustmentReason: reason ?? null,
      adjustmentSource: "athlete",
      updatedAt: new Date(),
    })
    .where(and(eq(plannedSessions.id, plannedSessionId), eq(plannedSessions.userId, userId)))
    .returning({ id: plannedSessions.id, status: plannedSessions.status })
  return rows[0] ?? null
}

// ─── Reschedule ───────────────────────────────────────────────────────────────

/**
 * Move a planned session to a different date.
 * - Marks the original session as "rescheduled".
 * - Finds or creates a planned_workout_day for the target date.
 * - Inserts the new session on the target day with rescheduledFromId set.
 */
export async function rescheduleSession(
  plannedSessionId: string,
  userId: string,
  targetDate: string,
  reason?: string
) {
  // Load the original session
  const origRows = await db
    .select()
    .from(plannedSessions)
    .where(and(eq(plannedSessions.id, plannedSessionId), eq(plannedSessions.userId, userId)))
    .limit(1)

  if (origRows.length === 0) throw new Error(`Session ${plannedSessionId} not found`)
  const orig = origRows[0]

  // Mark original as rescheduled
  await db
    .update(plannedSessions)
    .set({
      status: "rescheduled",
      adjustmentReason: reason ?? null,
      adjustmentSource: "athlete",
      updatedAt: new Date(),
    })
    .where(eq(plannedSessions.id, plannedSessionId))

  // Find the planned_workout_day for the target date + plan version
  let targetDayId: string
  const existingDay = await db
    .select({ id: plannedWorkoutDays.id })
    .from(plannedWorkoutDays)
    .where(
      and(
        eq(plannedWorkoutDays.userId, userId),
        eq(plannedWorkoutDays.scheduledDate, targetDate),
        eq(plannedWorkoutDays.planVersionId, orig.planVersionId ?? "")
      )
    )
    .limit(1)

  if (existingDay.length > 0) {
    targetDayId = existingDay[0].id
  } else {
    // Create a new day entry (unstructured — no cycleWeek lookup needed for a one-off move)
    const [newDay] = await db
      .insert(plannedWorkoutDays)
      .values({
        userId,
        planVersionId: orig.planVersionId ?? "",
        scheduledDate: targetDate,
        weekday: new Date(targetDate + "T00:00:00.000Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) as typeof plannedWorkoutDays.$inferSelect["weekday"],
        cycleWeekId: "",  // unknown — not a generated day
        isRestDay: false,
      })
      .onConflictDoNothing()
      .returning()

    if (!newDay) {
      // Race condition: another insert won; fetch what's there
      const [found] = await db
        .select({ id: plannedWorkoutDays.id })
        .from(plannedWorkoutDays)
        .where(
          and(
            eq(plannedWorkoutDays.userId, userId),
            eq(plannedWorkoutDays.scheduledDate, targetDate),
            eq(plannedWorkoutDays.planVersionId, orig.planVersionId ?? "")
          )
        )
        .limit(1)
      targetDayId = found.id
    } else {
      targetDayId = newDay.id
    }
  }

  // Insert the new session on the target day
  const [newSession] = await db
    .insert(plannedSessions)
    .values({
      plannedDayId: targetDayId,
      userId,
      planVersionId: orig.planVersionId,
      sessionKind: orig.sessionKind,
      customType: orig.customType,
      label: orig.label,
      prescription: orig.prescription,
      isRunSession: orig.isRunSession,
      isStrengthSession: orig.isStrengthSession,
      sequenceInDay: 99,  // appended to target day; resequenced by editor (Phase 8)
      targetDistanceM: orig.targetDistanceM,
      targetDurationSecs: orig.targetDurationSecs,
      targetHrMin: orig.targetHrMin,
      targetHrMax: orig.targetHrMax,
      targetPaceMinPerKm: orig.targetPaceMinPerKm,
      intervalsJson: orig.intervalsJson,
      status: "planned",
      rescheduledFromId: plannedSessionId,
      originalPrescription: orig.prescription,
    })
    .returning()

  return newSession
}

// ─── Reconciliation primitive ─────────────────────────────────────────────────

/**
 * Find the best planned run session for a given date, to associate with an
 * uploaded workout log.
 *
 * Matching preference order:
 *   1. A session with status "planned" (not already completed/skipped)
 *   2. A run session (isRunSession = true)
 *   3. First session by sequenceInDay
 *
 * Returns null if no planned run sessions exist for that date.
 */
export async function findMatchingRunSession(
  userId: string,
  planVersionId: string,
  scheduledDate: string
) {
  const dayRows = await db
    .select({ id: plannedWorkoutDays.id })
    .from(plannedWorkoutDays)
    .where(
      and(
        eq(plannedWorkoutDays.userId, userId),
        eq(plannedWorkoutDays.scheduledDate, scheduledDate),
        eq(plannedWorkoutDays.planVersionId, planVersionId)
      )
    )
    .limit(1)

  if (dayRows.length === 0) return null

  const sessions = await db
    .select()
    .from(plannedSessions)
    .where(
      and(
        eq(plannedSessions.plannedDayId, dayRows[0].id),
        eq(plannedSessions.userId, userId),
        eq(plannedSessions.isRunSession, true),
        eq(plannedSessions.status, "planned")
      )
    )

  if (sessions.length === 0) return null
  // Return lowest sequenceInDay (primary session of the day)
  return sessions.sort((a, b) => a.sequenceInDay - b.sequenceInDay)[0]
}

// ─── Reconciliation ───────────────────────────────────────────────────────────

/**
 * Reconcile a single workout against the athlete's schedule: if a planned run
 * session exists on the workout's local calendar date, mark it completed and
 * link this workout to it.
 *
 * Returns false (does nothing) when the workout isn't a running activity,
 * the athlete has no plan, or no matching planned session exists for that
 * date — all ordinary outcomes, not error conditions. Callers that need this
 * to be non-fatal (e.g. the upload pipeline, where the workout log itself
 * must still save) should wrap the call in their own try/catch.
 */
export async function reconcileWorkoutWithPlan(
  userId: string,
  workoutId: string,
  sport: string | null,
  startTime: Date
): Promise<boolean> {
  if (!isRunningSport(sport)) return false

  const [planVersion, tz] = await Promise.all([
    getOrCreatePlanVersion(userId),
    getAthleteTimezone(userId),
  ])
  if (!planVersion) return false

  const scheduledDate = resolveLocalDateForInstant(startTime, tz)
  const match = await findMatchingRunSession(userId, planVersion.id, scheduledDate)
  if (!match) return false

  await completeSession(match.id, userId, workoutId, startTime)
  return true
}

/**
 * Retroactively reconcile an athlete's recent workout history against their
 * schedule — repairs adherence data for workouts logged before a plan existed,
 * or before this reconciliation existed at all. Idempotent: a workout already
 * linked via session_completions is skipped, so re-running (e.g. on every
 * plan review) is always safe and cheap after the first pass.
 */
export async function backfillPlanReconciliation(
  userId: string,
  sinceDate: Date
): Promise<{ scanned: number; matched: number }> {
  const [logs, alreadyLinked] = await Promise.all([
    db
      .select({ id: workoutLogs.id, sport: workoutLogs.sport, startTime: workoutLogs.startTime })
      .from(workoutLogs)
      .where(and(eq(workoutLogs.userId, userId), gte(workoutLogs.startTime, sinceDate)))
      .orderBy(asc(workoutLogs.startTime)),
    db
      .select({ workoutLogId: sessionCompletions.workoutLogId })
      .from(sessionCompletions)
      .where(eq(sessionCompletions.userId, userId)),
  ])

  const linkedIds = new Set(alreadyLinked.map((r) => r.workoutLogId).filter((id) => id != null))

  let matched = 0
  for (const log of logs) {
    if (linkedIds.has(log.id)) continue
    try {
      const didMatch = await reconcileWorkoutWithPlan(
        userId,
        log.id,
        log.sport,
        new Date(log.startTime)
      )
      if (didMatch) matched++
    } catch (err) {
      console.error(`plan reconciliation backfill failed for workout ${log.id}:`, err)
    }
  }

  return { scanned: logs.length, matched }
}

// ─── Day-level edits ──────────────────────────────────────────────────────────
//
// These operate on a single scheduled day and never alter plan structure.
// Every edit records adjustmentSource="athlete" so the change stays traceable
// and can be distinguished from what the plan version prescribed.

/**
 * Find the planned_workout_day for a date, creating an unstructured one if the
 * schedule has no entry for it yet. Safe against concurrent inserts.
 */
async function findOrCreatePlannedDay(
  userId: string,
  planVersionId: string,
  dateStr: string
): Promise<string> {
  const existing = await db
    .select({ id: plannedWorkoutDays.id })
    .from(plannedWorkoutDays)
    .where(
      and(
        eq(plannedWorkoutDays.userId, userId),
        eq(plannedWorkoutDays.scheduledDate, dateStr),
        eq(plannedWorkoutDays.planVersionId, planVersionId)
      )
    )
    .limit(1)

  if (existing.length > 0) return existing[0].id

  const [created] = await db
    .insert(plannedWorkoutDays)
    .values({
      userId,
      planVersionId,
      scheduledDate: dateStr,
      weekday: new Date(dateStr + "T00:00:00.000Z").toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "UTC",
      }) as typeof plannedWorkoutDays.$inferSelect["weekday"],
      cycleWeekId: "",
      isRestDay: false,
    })
    .onConflictDoNothing()
    .returning()

  if (created) return created.id

  // Lost an insert race — read back the winner
  const [found] = await db
    .select({ id: plannedWorkoutDays.id })
    .from(plannedWorkoutDays)
    .where(
      and(
        eq(plannedWorkoutDays.userId, userId),
        eq(plannedWorkoutDays.scheduledDate, dateStr),
        eq(plannedWorkoutDays.planVersionId, planVersionId)
      )
    )
    .limit(1)

  if (!found) throw new Error(`Could not resolve planned day for ${dateStr}`)
  return found.id
}

/**
 * Swap a single day's session to a different kind.
 *
 * The original prescription is preserved in originalPrescription the first time
 * a session is edited, so the plan's intent is never lost.
 */
export async function changeSessionType(
  plannedSessionId: string,
  userId: string,
  newKind: string,
  opts: {
    label?: string
    prescription?: string
    isRunSession?: boolean
    isStrengthSession?: boolean
    reason?: string
  } = {}
) {
  const rows = await db
    .select()
    .from(plannedSessions)
    .where(and(eq(plannedSessions.id, plannedSessionId), eq(plannedSessions.userId, userId)))
    .limit(1)

  if (rows.length === 0) return null
  const orig = rows[0]

  const [updated] = await db
    .update(plannedSessions)
    .set({
      sessionKind: newKind,
      label: opts.label ?? orig.label,
      prescription: opts.prescription ?? orig.prescription,
      ...(opts.isRunSession !== undefined ? { isRunSession: opts.isRunSession } : {}),
      ...(opts.isStrengthSession !== undefined ? { isStrengthSession: opts.isStrengthSession } : {}),
      adjustmentReason: opts.reason ?? null,
      adjustmentSource: "athlete",
      // Capture the plan's original wording once, on the first edit
      originalPrescription: orig.originalPrescription ?? orig.prescription,
      updatedAt: new Date(),
    })
    .where(eq(plannedSessions.id, plannedSessionId))
    .returning()

  return updated ?? null
}

/**
 * Return a skipped session to "planned". Completed sessions are not restored
 * here — a completion is evidence and must be removed explicitly.
 */
export async function restoreSession(plannedSessionId: string, userId: string) {
  const [updated] = await db
    .update(plannedSessions)
    .set({
      status: "planned",
      adjustmentReason: null,
      adjustmentSource: "athlete",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(plannedSessions.id, plannedSessionId),
        eq(plannedSessions.userId, userId),
        eq(plannedSessions.status, "skipped")
      )
    )
    .returning()

  return updated ?? null
}

/**
 * Add an extra session to a day that the plan did not prescribe.
 * Appended after existing sessions in the day.
 */
export async function addAdHocSession(
  userId: string,
  planVersionId: string,
  dateStr: string,
  input: {
    sessionKind: string
    label: string
    prescription: string
    isRunSession: boolean
    isStrengthSession: boolean
    targetDistanceM?: number | null
    reason?: string
  }
) {
  const dayId = await findOrCreatePlannedDay(userId, planVersionId, dateStr)

  const existing = await db
    .select({ sequenceInDay: plannedSessions.sequenceInDay })
    .from(plannedSessions)
    .where(and(eq(plannedSessions.plannedDayId, dayId), eq(plannedSessions.userId, userId)))

  const nextSequence =
    existing.length > 0 ? Math.max(...existing.map((s) => s.sequenceInDay)) + 1 : 1

  const [created] = await db
    .insert(plannedSessions)
    .values({
      plannedDayId: dayId,
      userId,
      planVersionId,
      sessionKind: input.sessionKind,
      label: input.label,
      prescription: input.prescription,
      isRunSession: input.isRunSession,
      isStrengthSession: input.isStrengthSession,
      sequenceInDay: nextSequence,
      targetDistanceM: input.targetDistanceM ?? null,
      status: "planned",
      adjustmentReason: input.reason ?? "Added by athlete",
      adjustmentSource: "athlete",
    })
    .returning()

  // A day with a session on it is no longer a rest day
  await db
    .update(plannedWorkoutDays)
    .set({ isRestDay: false })
    .where(eq(plannedWorkoutDays.id, dayId))

  return created ?? null
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

/** Fetch completions for a planned session (at most one for MVP). */
export async function getSessionCompletion(plannedSessionId: string) {
  const rows = await db
    .select()
    .from(sessionCompletions)
    .where(eq(sessionCompletions.plannedSessionId, plannedSessionId))
    .limit(1)
  return rows[0] ?? null
}

/** Fetch all sessions for a planned workout day. */
export async function getSessionsForDay(plannedDayId: string, userId: string) {
  return db
    .select()
    .from(plannedSessions)
    .where(
      and(
        eq(plannedSessions.plannedDayId, plannedDayId),
        eq(plannedSessions.userId, userId)
      )
    )
}

/** Check whether a workout log has already been linked to any session. */
export async function findCompletionByWorkoutLog(workoutLogId: string) {
  const rows = await db
    .select()
    .from(sessionCompletions)
    .where(eq(sessionCompletions.workoutLogId, workoutLogId))
    .limit(1)
  return rows[0] ?? null
}
