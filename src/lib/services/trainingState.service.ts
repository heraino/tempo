import { db } from "@/lib/db"
import { trainingStates } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function getTrainingState(userId: string) {
  const rows = await db
    .select()
    .from(trainingStates)
    .where(eq(trainingStates.userId, userId))
    .limit(1)
  return rows[0] ?? null
}

export async function updateTrainingState(
  userId: string,
  values: Partial<typeof trainingStates.$inferInsert>
) {
  const existing = await getTrainingState(userId)
  if (existing) {
    const rows = await db
      .update(trainingStates)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(trainingStates.userId, userId))
      .returning()
    return rows[0]
  }
  const rows = await db
    .insert(trainingStates)
    .values({ userId, ...values })
    .returning()
  return rows[0]
}
