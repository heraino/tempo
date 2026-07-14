import { db } from "@/lib/db"
import { fitFiles, workoutLogs } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function findFitFileByUserAndSha256(userId: string, sha256: string) {
  const rows = await db
    .select()
    .from(fitFiles)
    .where(and(eq(fitFiles.userId, userId), eq(fitFiles.sha256, sha256)))
    .limit(1)
  return rows[0] ?? null
}

export async function createFitFile(values: typeof fitFiles.$inferInsert) {
  const rows = await db.insert(fitFiles).values(values).returning()
  return rows[0]
}

export async function getFitFileById(id: string, userId: string) {
  const rows = await db
    .select()
    .from(fitFiles)
    .where(and(eq(fitFiles.id, id), eq(fitFiles.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

// Find the workout_log linked to a given fit_file (for duplicate-detection redirect)
export async function findWorkoutByFitFileId(fitFileId: string, userId: string) {
  const rows = await db
    .select({ id: workoutLogs.id })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.fitFileId, fitFileId), eq(workoutLogs.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}
