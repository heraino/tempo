import { db } from "@/lib/db"
import { trainingPlans, trainingPlanVersions, plannedWorkoutDays, plannedSessions } from "@/lib/db/schema"
import { and, eq, desc, gte, lte } from "drizzle-orm"
import { validatePlanJson } from "@/lib/validation/plan"
import { generateSchedule } from "@/lib/plan/scheduler"
import { seedPlanVersion } from "@/lib/plan/seed"
import type { DayPlan, SessionPlan } from "@/lib/plan/scheduler"

export async function getActivePlan(userId: string) {
  const rows = await db
    .select()
    .from(trainingPlans)
    .where(eq(trainingPlans.userId, userId))
    .orderBy(desc(trainingPlans.createdAt))
    .limit(1)
  return rows[0] ?? null
}

export async function getActivePlanVersion(userId: string) {
  const rows = await db
    .select()
    .from(trainingPlanVersions)
    .where(eq(trainingPlanVersions.userId, userId))
    .orderBy(desc(trainingPlanVersions.versionNumber))
    .limit(1)
  return rows[0] ?? null
}

export async function savePlanMarkdown(
  userId: string,
  values: typeof trainingPlans.$inferInsert
) {
  await db.delete(trainingPlans).where(eq(trainingPlans.userId, userId))
  const rows = await db.insert(trainingPlans).values(values).returning()
  return rows[0]
}

// ─── Scheduling engine helpers ────────────────────────────────────────────────

export interface ScheduledSession {
  id: string
  sessionKind: string
  customType: string | null
  label: string
  prescription: string
  isRunSession: boolean
  isStrengthSession: boolean
  sequenceInDay: number
  status: string
  intervalsJson: unknown
}

export interface ScheduledDay {
  id: string
  date: string
  weekday: string
  cycleWeekId: string
  isRestDay: boolean
  sessions: ScheduledSession[]
}

/**
 * Get or auto-seed a plan version for the user.
 * Returns null if the user has no training_plan (needs onboarding).
 */
export async function getOrCreatePlanVersion(userId: string) {
  const existing = await getActivePlanVersion(userId)
  if (existing) return existing

  const plan = await getActivePlan(userId)
  if (!plan) return null

  return seedPlanVersion(userId, { startDate: plan.startDate, startWeek: plan.startWeek })
}

/**
 * Fetch sessions for a single calendar date from the DB.
 * Auto-extends the schedule if the date has not been generated yet.
 */
export async function getDayWithSessions(
  userId: string,
  dateStr: string
): Promise<ScheduledDay | null> {
  const planVersion = await getOrCreatePlanVersion(userId)
  if (!planVersion) return null

  // Ensure this date is generated
  const planJson = validatePlanJson(planVersion.planJson)
  await generateSchedule(
    userId, planVersion.id, planJson,
    planVersion.cycleStartDate, planVersion.cycleStartWeekId,
    dateStr, 1
  )

  const dayRows = await db
    .select()
    .from(plannedWorkoutDays)
    .where(
      and(
        eq(plannedWorkoutDays.userId, userId),
        eq(plannedWorkoutDays.scheduledDate, dateStr),
        eq(plannedWorkoutDays.planVersionId, planVersion.id)
      )
    )
    .limit(1)

  if (dayRows.length === 0) return null
  const day = dayRows[0]

  const sessions = await db
    .select()
    .from(plannedSessions)
    .where(
      and(
        eq(plannedSessions.plannedDayId, day.id),
        eq(plannedSessions.userId, userId)
      )
    )

  return {
    id: day.id,
    date: day.scheduledDate,
    weekday: day.weekday,
    cycleWeekId: day.cycleWeekId,
    isRestDay: day.isRestDay ?? false,
    sessions: sessions
      .sort((a, b) => a.sequenceInDay - b.sequenceInDay)
      .map((s) => ({
        id: s.id,
        sessionKind: s.sessionKind,
        customType: s.customType,
        label: s.label,
        prescription: s.prescription,
        isRunSession: s.isRunSession,
        isStrengthSession: s.isStrengthSession,
        sequenceInDay: s.sequenceInDay,
        status: s.status,
        intervalsJson: s.intervalsJson,
      })),
  }
}

/**
 * Fetch a range of scheduled days from the DB, auto-generating any missing ones.
 * Returns one ScheduledDay per day in [fromDateStr, fromDateStr + days).
 *
 * Also returns the plan version's cycleWeek labels for display.
 */
export async function getScheduleRange(
  userId: string,
  fromDateStr: string,
  days: number
): Promise<{
  planVersionId: string
  cycleWeekLabels: Record<string, string>
  scheduledDays: ScheduledDay[]
} | null> {
  const planVersion = await getOrCreatePlanVersion(userId)
  if (!planVersion) return null

  const planJson = validatePlanJson(planVersion.planJson)

  // Build a label map for display
  const cycleWeekLabels: Record<string, string> = {}
  for (const w of planJson.cycleWeeks) {
    cycleWeekLabels[w.id] = w.label
  }

  // Ensure all requested days are generated
  await generateSchedule(
    userId, planVersion.id, planJson,
    planVersion.cycleStartDate, planVersion.cycleStartWeekId,
    fromDateStr, days
  )

  // Compute inclusive end date for query
  const toDate = new Date(fromDateStr + "T00:00:00.000Z")
  toDate.setUTCDate(toDate.getUTCDate() + days - 1)
  const toDateStr = toDate.toISOString().split("T")[0]

  const dayRows = await db
    .select()
    .from(plannedWorkoutDays)
    .where(
      and(
        eq(plannedWorkoutDays.userId, userId),
        eq(plannedWorkoutDays.planVersionId, planVersion.id),
        gte(plannedWorkoutDays.scheduledDate, fromDateStr),
        lte(plannedWorkoutDays.scheduledDate, toDateStr)
      )
    )

  // Batch-fetch all sessions for these days
  const dayIds = dayRows.map((d) => d.id)
  const allSessions =
    dayIds.length > 0
      ? await db
          .select()
          .from(plannedSessions)
          .where(eq(plannedSessions.userId, userId))
      : []

  const sessionsByDayId = new Map<string, typeof allSessions>()
  for (const s of allSessions) {
    if (!dayIds.includes(s.plannedDayId)) continue
    const list = sessionsByDayId.get(s.plannedDayId) ?? []
    list.push(s)
    sessionsByDayId.set(s.plannedDayId, list)
  }

  const scheduledDays: ScheduledDay[] = dayRows
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .map((day) => {
      const sessions = (sessionsByDayId.get(day.id) ?? [])
        .sort((a, b) => a.sequenceInDay - b.sequenceInDay)
        .map((s) => ({
          id: s.id,
          sessionKind: s.sessionKind,
          customType: s.customType,
          label: s.label,
          prescription: s.prescription,
          isRunSession: s.isRunSession,
          isStrengthSession: s.isStrengthSession,
          sequenceInDay: s.sequenceInDay,
          status: s.status,
          intervalsJson: s.intervalsJson,
        }))

      return {
        id: day.id,
        date: day.scheduledDate,
        weekday: day.weekday,
        cycleWeekId: day.cycleWeekId,
        isRestDay: day.isRestDay ?? false,
        sessions,
      }
    })

  return { planVersionId: planVersion.id, cycleWeekLabels, scheduledDays }
}

// Re-export DayPlan and SessionPlan so callers can use without importing scheduler
export type { DayPlan, SessionPlan }
