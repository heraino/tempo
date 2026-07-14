import { db } from "@/lib/db"
import { fitFiles, workoutLogs } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

// Mirrors the parse_status column values; keep in sync with schema comment.
export type ParseStatus = "pending" | "parsed" | "failed" | "workout_save_failed"

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

/**
 * Transitions the parse_status of a fit_file record.
 *
 * Call sequence:
 *   createFitFile()             → status defaults to "pending"
 *   updateFitFileParseStatus(id, "failed", err.message)          — parse threw
 *   updateFitFileParseStatus(id, "workout_save_failed", msg)     — parse ok, DB write failed
 *   updateFitFileParseStatus(id, "parsed")                       — fully persisted
 */
export async function updateFitFileParseStatus(
  id: string,
  status: ParseStatus,
  parseError?: string
) {
  const rows = await db
    .update(fitFiles)
    .set({
      parseStatus: status,
      parseError: parseError ?? null,
    })
    .where(eq(fitFiles.id, id))
    .returning({ id: fitFiles.id, parseStatus: fitFiles.parseStatus })
  return rows[0] ?? null
}
