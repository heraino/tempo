import { db } from "@/lib/db"
import { painObservations } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

type PainEntry = Omit<typeof painObservations.$inferInsert, "id" | "createdAt" | "userId" | "workoutLogId" | "observationDate">

export async function createPainObservations(
  userId: string,
  workoutLogId: string,
  observationDate: string,
  entries: PainEntry[]
) {
  if (entries.length === 0) return []

  const values = entries.map((e) => ({
    userId,
    workoutLogId,
    observationDate,
    ...e,
  }))

  return db.insert(painObservations).values(values).returning()
}

export async function getPainObservationsForWorkout(workoutLogId: string) {
  return db
    .select()
    .from(painObservations)
    .where(eq(painObservations.workoutLogId, workoutLogId))
}

export async function getPainObservationsForDate(userId: string, date: string) {
  return db
    .select()
    .from(painObservations)
    .where(
      and(
        eq(painObservations.userId, userId),
        eq(painObservations.observationDate, date)
      )
    )
}
