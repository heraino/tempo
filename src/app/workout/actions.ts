"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { workoutLogs, fitFiles, athleteContexts } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

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

export async function updateWorkoutAnnotations(
  workoutId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  // Verify ownership
  const rows = await db
    .select({ id: workoutLogs.id })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.id, workoutId), eq(workoutLogs.userId, session.user.id)))
    .limit(1)

  if (!rows[0]) return { ok: false, error: "Workout not found" }

  const sessionKindOverride = (formData.get("sessionKindOverride") as string | null) || null
  const effortRaw = formData.get("perceivedEffort") as string | null
  const perceivedEffort = effortRaw ? parseInt(effortRaw, 10) : null
  const notes = (formData.get("notes") as string | null) || null

  await db
    .update(workoutLogs)
    .set({
      sessionKindOverride,
      perceivedEffort: perceivedEffort && perceivedEffort >= 1 && perceivedEffort <= 5
        ? perceivedEffort
        : null,
      notes,
    })
    .where(eq(workoutLogs.id, workoutId))

  // Update outside temperature in athlete_context (upsert)
  const tempRaw = formData.get("outsideTempDisplay") as string | null
  const tempUnits = (formData.get("tempUnits") as string | null) ?? "imperial"
  if (tempRaw !== null && tempRaw !== "") {
    const displayVal = parseFloat(tempRaw)
    if (!isNaN(displayVal)) {
      const outsideTempC = tempUnits === "metric"
        ? displayVal
        : (displayVal - 32) * 5 / 9

      await db
        .insert(athleteContexts)
        .values({
          id: crypto.randomUUID(),
          workoutLogId: workoutId,
          userId: session.user.id,
          outsideTempC,
        })
        .onConflictDoUpdate({
          target: athleteContexts.workoutLogId,
          set: { outsideTempC },
        })
    }
  }

  revalidatePath(`/workout/${workoutId}`)
  return { ok: true }
}
