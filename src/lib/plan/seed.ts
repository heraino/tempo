/**
 * Seed plan and version bootstrapper.
 *
 * SEED_PLAN_JSON is the structured representation of the athlete's governing
 * plan. A/B/C/D are this athlete's specific cycle-week identifiers — they are
 * NOT hard-coded into any scheduling logic. Any future athlete can have a
 * "base/peak/cutback" cycle or any other set of IDs.
 *
 * seedPlanVersion() is idempotent: calling it on a user who already has a
 * plan version is a no-op.
 */

import { validatePlanJson } from "@/lib/validation/plan"
import { db } from "@/lib/db"
import { trainingPlanVersions } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { generateSchedule } from "./scheduler"
import type { PlanJson } from "./types"

// ─── Seed PlanJson ────────────────────────────────────────────────────────────
// Validated at module-load time. Any shape error surfaces immediately.

export const SEED_PLAN_JSON: PlanJson = validatePlanJson({
  version: 1,
  cycleWeeks: [
    {
      id: "A", label: "Threshold",
      days: [
        { weekday: "Monday", sessions: [
          { sessionKind: "easy",    label: "Easy aerobic", prescription: "Easy aerobic run", isRunSession: true,  isStrengthSession: false },
          { sessionKind: "elastic", label: "Elastic work", prescription: "Elastic/drills work", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Tuesday", sessions: [
          { sessionKind: "recovery", label: "Recovery run",  prescription: "Easy recovery run", isRunSession: true,  isStrengthSession: false },
          { sessionKind: "strength", label: "Pull strength", prescription: "Pull strength session", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Wednesday", sessions: [
          { sessionKind: "threshold", label: "Threshold intervals",
            prescription: "6 × 3:00 threshold, 2:00 easy recovery",
            isRunSession: true, isStrengthSession: false,
            intervals: [{ reps: 6, workDurationSecs: 180, recDurationSecs: 120, label: "3:00 threshold / 2:00 easy" }] },
        ]},
        { weekday: "Thursday", sessions: [
          { sessionKind: "strength", label: "Push strength", prescription: "Push strength session", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Friday",   sessions: [] },
        { weekday: "Saturday", sessions: [
          { sessionKind: "easy",    label: "Easy run", prescription: "40–45 min easy run", isRunSession: true, isStrengthSession: false },
          { sessionKind: "strides", label: "Strides",  prescription: "4–6 × 20 sec strides", isRunSession: true, isStrengthSession: false },
        ]},
        { weekday: "Sunday", sessions: [
          { sessionKind: "long", label: "Long run", prescription: "Long run", isRunSession: true, isStrengthSession: false },
        ]},
      ],
    },
    {
      id: "B", label: "Tempo",
      days: [
        { weekday: "Monday", sessions: [
          { sessionKind: "easy",    label: "Easy aerobic", prescription: "Easy aerobic run", isRunSession: true,  isStrengthSession: false },
          { sessionKind: "elastic", label: "Elastic work", prescription: "Elastic/drills work", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Tuesday", sessions: [
          { sessionKind: "recovery", label: "Recovery run",  prescription: "Easy recovery run", isRunSession: true,  isStrengthSession: false },
          { sessionKind: "strength", label: "Pull strength", prescription: "Pull strength session", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Wednesday", sessions: [
          { sessionKind: "tempo", label: "Tempo run",
            prescription: "10–12 min warm-up + 20 min continuous tempo + 10 min cooldown",
            isRunSession: true, isStrengthSession: false },
        ]},
        { weekday: "Thursday", sessions: [
          { sessionKind: "strength", label: "Push strength", prescription: "Push strength session", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Friday",   sessions: [] },
        { weekday: "Saturday", sessions: [
          { sessionKind: "progression", label: "Progression run",
            prescription: "45–50 min progression run", isRunSession: true, isStrengthSession: false },
        ]},
        { weekday: "Sunday", sessions: [
          { sessionKind: "long", label: "Long run", prescription: "Long run", isRunSession: true, isStrengthSession: false },
        ]},
      ],
    },
    {
      id: "C", label: "Progression",
      days: [
        { weekday: "Monday", sessions: [
          { sessionKind: "easy",    label: "Easy aerobic", prescription: "Easy aerobic run", isRunSession: true,  isStrengthSession: false },
          { sessionKind: "elastic", label: "Elastic work", prescription: "Elastic/drills work", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Tuesday", sessions: [
          { sessionKind: "recovery", label: "Recovery run",  prescription: "Easy recovery run", isRunSession: true,  isStrengthSession: false },
          { sessionKind: "strength", label: "Pull strength", prescription: "Pull strength session", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Wednesday", sessions: [
          { sessionKind: "progression", label: "Progression run",
            prescription: "45–50 min progression run", isRunSession: true, isStrengthSession: false },
        ]},
        { weekday: "Thursday", sessions: [
          { sessionKind: "strength", label: "Push strength", prescription: "Push strength session", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Friday",   sessions: [] },
        { weekday: "Saturday", sessions: [
          { sessionKind: "easy", label: "Easy aerobic", prescription: "40–45 min easy aerobic", isRunSession: true, isStrengthSession: false },
        ]},
        { weekday: "Sunday", sessions: [
          { sessionKind: "long", label: "Long run", prescription: "Long run", isRunSession: true, isStrengthSession: false },
        ]},
      ],
    },
    {
      id: "D", label: "Cutback",
      days: [
        { weekday: "Monday", sessions: [
          { sessionKind: "easy", label: "Easy aerobic",
            prescription: "Easy aerobic run + reduced elastic work (~80%)",
            isRunSession: true, isStrengthSession: false },
        ]},
        { weekday: "Tuesday", sessions: [
          { sessionKind: "strength", label: "Pull strength",
            prescription: "Pull strength (~80%)", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Wednesday", sessions: [] },
        { weekday: "Thursday", sessions: [
          { sessionKind: "strength", label: "Push strength",
            prescription: "Push strength (~80%)", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Friday",   sessions: [] },
        { weekday: "Saturday", sessions: [
          { sessionKind: "easy", label: "Easy aerobic",
            prescription: "Easy aerobic run", isRunSession: true, isStrengthSession: false },
        ]},
        { weekday: "Sunday", sessions: [
          { sessionKind: "long", label: "Cutback long run",
            prescription: "Cutback long run", isRunSession: true, isStrengthSession: false },
        ]},
      ],
    },
  ],
  mileageBands: [
    { cycleWeekId: "A", minMi: 20, maxMi: 22 },
    { cycleWeekId: "B", minMi: 22, maxMi: 24 },
    { cycleWeekId: "C", minMi: 24, maxMi: 26 },
    { cycleWeekId: "D", minMi: 15, maxMi: 17 },
  ],
})

// ─── Seed function ────────────────────────────────────────────────────────────

export interface TrainingPlanRow {
  startDate: string
  startWeek: string
}

/**
 * Create the first training_plan_version for a user and generate 90 days of
 * planned workouts. Safe to call multiple times — returns the existing version
 * without re-seeding if one already exists.
 */
export async function seedPlanVersion(
  userId: string,
  plan: TrainingPlanRow,
  daysToGenerate = 90
) {
  // Check whether a version already exists
  const existing = await db
    .select()
    .from(trainingPlanVersions)
    .where(eq(trainingPlanVersions.userId, userId))
    .orderBy(desc(trainingPlanVersions.versionNumber))
    .limit(1)

  if (existing.length > 0) return existing[0]

  const [version] = await db
    .insert(trainingPlanVersions)
    .values({
      userId,
      versionNumber: 1,
      effectiveFrom: plan.startDate,
      effectiveUntil: null,
      planJson: SEED_PLAN_JSON,
      cycleStartDate: plan.startDate,
      cycleStartWeekId: plan.startWeek,
      changeReason: "Initial seed from onboarding",
      changeAuthor: "system",
      priorVersionId: null,
    })
    .returning()

  await generateSchedule(
    userId,
    version.id,
    SEED_PLAN_JSON,
    plan.startDate,
    plan.startWeek,
    plan.startDate,
    daysToGenerate
  )

  return version
}
