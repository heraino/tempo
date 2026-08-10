import { db } from "@/lib/db"
import { trainingGoals } from "@/lib/db/schema"
import { and, eq, desc } from "drizzle-orm"
import type { TrainingGoalLike } from "@/lib/goals/goal"

export type TrainingGoal = typeof trainingGoals.$inferSelect

/** The athlete's current active goal, or null if none is set. */
export async function getActiveGoal(userId: string): Promise<TrainingGoal | null> {
  try {
    const rows = await db
      .select()
      .from(trainingGoals)
      .where(and(eq(trainingGoals.userId, userId), eq(trainingGoals.status, "active")))
      .orderBy(desc(trainingGoals.createdAt))
      .limit(1)
    return rows[0] ?? null
  } catch {
    // Table may not exist yet on databases that haven't run migration 0007
    return null
  }
}

/** All goals for the athlete, newest first. */
export async function listGoals(userId: string): Promise<TrainingGoal[]> {
  try {
    return await db
      .select()
      .from(trainingGoals)
      .where(eq(trainingGoals.userId, userId))
      .orderBy(desc(trainingGoals.createdAt))
  } catch {
    return []
  }
}

export interface GoalInput {
  goalType: string
  title?: string | null
  targetDate?: string | null
  targetDistanceM?: number | null
  targetDurationSecs?: number | null
  targetPaceMinPerKm?: number | null
  targetRunsPerWeek?: number | null
  notes?: string | null
}

/**
 * Set the athlete's active goal.
 *
 * A goal is training state, so changes are not silent: the previous active
 * goal is retired to "superseded" rather than overwritten, preserving the
 * history of what the athlete was training for and when.
 */
export async function setActiveGoal(
  userId: string,
  input: GoalInput,
): Promise<TrainingGoal> {
  await db
    .update(trainingGoals)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(and(eq(trainingGoals.userId, userId), eq(trainingGoals.status, "active")))

  const rows = await db
    .insert(trainingGoals)
    .values({
      userId,
      goalType: input.goalType,
      title: input.title ?? null,
      targetDate: input.targetDate ?? null,
      targetDistanceM: input.targetDistanceM ?? null,
      targetDurationSecs: input.targetDurationSecs ?? null,
      targetPaceMinPerKm: input.targetPaceMinPerKm ?? null,
      targetRunsPerWeek: input.targetRunsPerWeek ?? null,
      notes: input.notes ?? null,
      status: "active",
    })
    .returning()

  return rows[0]
}

/** Update fields on an existing goal in place (no new row). */
export async function updateGoal(
  userId: string,
  goalId: string,
  input: Partial<GoalInput>,
): Promise<TrainingGoal | null> {
  const rows = await db
    .update(trainingGoals)
    .set({
      ...(input.goalType !== undefined ? { goalType: input.goalType } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
      ...(input.targetDistanceM !== undefined ? { targetDistanceM: input.targetDistanceM } : {}),
      ...(input.targetDurationSecs !== undefined ? { targetDurationSecs: input.targetDurationSecs } : {}),
      ...(input.targetPaceMinPerKm !== undefined ? { targetPaceMinPerKm: input.targetPaceMinPerKm } : {}),
      ...(input.targetRunsPerWeek !== undefined ? { targetRunsPerWeek: input.targetRunsPerWeek } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(trainingGoals.id, goalId), eq(trainingGoals.userId, userId)))
    .returning()
  return rows[0] ?? null
}

/** Mark a goal achieved or abandoned. */
export async function setGoalStatus(
  userId: string,
  goalId: string,
  status: "active" | "achieved" | "abandoned",
): Promise<void> {
  await db
    .update(trainingGoals)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(trainingGoals.id, goalId), eq(trainingGoals.userId, userId)))
}

/**
 * Compact goal shape for AI context snapshots. Returns null when no goal is
 * set so prompts can say "no goal declared" rather than inventing one.
 */
export function toGoalContext(goal: TrainingGoal | null): TrainingGoalLike | null {
  if (!goal) return null
  return {
    goalType: goal.goalType,
    title: goal.title,
    targetDate: goal.targetDate,
    targetDistanceM: goal.targetDistanceM,
    targetDurationSecs: goal.targetDurationSecs,
    targetPaceMinPerKm: goal.targetPaceMinPerKm,
    targetRunsPerWeek: goal.targetRunsPerWeek,
  }
}
