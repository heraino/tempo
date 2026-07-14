import { db } from "@/lib/db"
import { athleteContexts } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

type ContextValues = Omit<typeof athleteContexts.$inferInsert, "id" | "createdAt" | "workoutLogId" | "userId">

export async function upsertAthleteContext(
  workoutLogId: string,
  userId: string,
  values: ContextValues
) {
  const rows = await db
    .insert(athleteContexts)
    .values({ workoutLogId, userId, ...values })
    .onConflictDoUpdate({
      target: athleteContexts.workoutLogId,
      set: values,
    })
    .returning()
  return rows[0]
}

export async function getAthleteContextForWorkout(workoutLogId: string) {
  const rows = await db
    .select()
    .from(athleteContexts)
    .where(eq(athleteContexts.workoutLogId, workoutLogId))
    .limit(1)
  return rows[0] ?? null
}
