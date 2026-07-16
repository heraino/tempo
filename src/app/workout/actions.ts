"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { workoutLogs, fitFiles } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function deleteWorkout(workoutId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  // Fetch fitFileId before deleting so we can clean it up afterward
  const rows = await db
    .select({ fitFileId: workoutLogs.fitFileId })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.id, workoutId), eq(workoutLogs.userId, session.user.id)))
    .limit(1)

  if (rows.length === 0) return { ok: false, error: "Workout not found" }

  const fitFileId = rows[0].fitFileId

  await db
    .delete(workoutLogs)
    .where(and(eq(workoutLogs.id, workoutId), eq(workoutLogs.userId, session.user.id)))

  if (fitFileId) {
    await db.delete(fitFiles).where(eq(fitFiles.id, fitFileId))
  }

  return { ok: true }
}
