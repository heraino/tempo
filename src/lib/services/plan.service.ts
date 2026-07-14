import { db } from "@/lib/db"
import { trainingPlans, trainingPlanVersions } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

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
