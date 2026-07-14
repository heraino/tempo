"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function deleteWorkout(workoutId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const deleted = await db
    .delete(workoutLogs)
    .where(and(eq(workoutLogs.id, workoutId), eq(workoutLogs.userId, session.user.id)))
    .returning({ id: workoutLogs.id })

  if (deleted.length === 0) return { ok: false, error: "Workout not found" }
  return { ok: true }
}
