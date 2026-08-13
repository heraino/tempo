import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { reconcileWorkoutWithPlan } from "@/lib/services/completion.service"

export async function getWorkoutById(id: string, userId: string) {
  const rows = await db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.id, id))
    .limit(1)
  const row = rows[0]
  if (!row || row.userId !== userId) return null
  return row
}

export async function getRecentWorkouts(userId: string, limit = 10) {
  return db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(desc(workoutLogs.startTime))
    .limit(limit)
}

export async function createWorkout(
  values: typeof workoutLogs.$inferInsert
) {
  const rows = await db.insert(workoutLogs).values(values).returning()
  const workout = rows[0]

  if (workout) {
    // Best-effort: the workout log is the source of truth and must be saved
    // regardless of whether a matching planned session exists.
    await reconcileWorkoutWithPlan(
      workout.userId,
      workout.id,
      workout.sport,
      new Date(workout.startTime)
    ).catch((err) => {
      console.error("plan reconciliation failed (workout is still saved):", err)
    })
  }

  return workout
}

export async function getComparableWorkouts(
  userId: string,
  sessionKind: string,
  limit = 5
) {
  return db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(desc(workoutLogs.startTime))
    .limit(limit)
}
