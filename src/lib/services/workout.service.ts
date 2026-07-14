import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

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
  return rows[0]
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
