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
import { plannedSessions, sessionCompletions, plannedWorkoutDays } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

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
  await db
    .update(plannedSessions)
    .set({ status: "completed", updatedAt: completedAt })
    .where(and(eq(plannedSessions.id, plannedSessionId), eq(plannedSessions.userId, userId)))

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
