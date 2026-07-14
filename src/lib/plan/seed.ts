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
          { sessionKind: "easy",    label: "Easy aerobic run", prescription: "Easy aerobic run", isRunSession: true,  isStrengthSession: false },
          { sessionKind: "elastic", label: "Elastic work",     prescription: "Elastic/drills work", isRunSession: false, isStrengthSession: true },
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
          // Strides are performed at the end of the easy run — one Garmin activity,
          // one planned session. Strides are encoded as intervals within this session.
          { sessionKind: "easy", label: "Easy run with strides",
            prescription: "40–45 min easy run + 4–6 × 20 sec strides",
            isRunSession: true, isStrengthSession: false,
            intervals: [{ reps: 5, workDurationSecs: 20, label: "20 sec stride" }] },
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
          { sessionKind: "easy",    label: "Easy aerobic run", prescription: "Easy aerobic run", isRunSession: true,  isStrengthSession: false },
          { sessionKind: "elastic", label: "Elastic work",     prescription: "Elastic/drills work", isRunSession: false, isStrengthSession: true },
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
          { sessionKind: "easy",    label: "Easy aerobic run", prescription: "Easy aerobic run", isRunSession: true,  isStrengthSession: false },
          { sessionKind: "elastic", label: "Elastic work",     prescription: "Elastic/drills work", isRunSession: false, isStrengthSession: true },
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
          { sessionKind: "easy", label: "Easy aerobic run", prescription: "40–45 min easy aerobic run", isRunSession: true, isStrengthSession: false },
        ]},
        { weekday: "Sunday", sessions: [
          { sessionKind: "long", label: "Long run", prescription: "Long run", isRunSession: true, isStrengthSession: false },
        ]},
      ],
    },
    {
      id: "D", label: "Cutback",
      isCutback: true,
      days: [
        { weekday: "Monday", sessions: [
          { sessionKind: "easy", label: "Easy run",
            prescription: "35–40 min easy run",
            isRunSession: true, isStrengthSession: false },
        ]},
        { weekday: "Tuesday", sessions: [
          { sessionKind: "strength", label: "Pull strength",
            prescription: "Pull strength (~80% volume)", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Wednesday", sessions: [
          // One running session; strides are workout components of the same Garmin activity.
          { sessionKind: "easy", label: "Easy run with strides",
            prescription: "35–40 min easy run + 4 × 20 sec strides",
            isRunSession: true, isStrengthSession: false,
            intervals: [{ reps: 4, workDurationSecs: 20, label: "20 sec stride" }] },
        ]},
        { weekday: "Thursday", sessions: [
          { sessionKind: "strength", label: "Push strength",
            prescription: "Push strength (~80% volume)", isRunSession: false, isStrengthSession: true },
        ]},
        { weekday: "Friday",   sessions: [] },
        { weekday: "Saturday", sessions: [
          { sessionKind: "easy", label: "Easy run",
            prescription: "35–40 min easy run", isRunSession: true, isStrengthSession: false },
        ]},
        { weekday: "Sunday", sessions: [
          { sessionKind: "long", label: "Cutback long run",
            prescription: "Cutback long run", isRunSession: true, isStrengthSession: false },
        ]},
      ],
    },
  ],
  progressionBlocks: [
    { blockNumber: 1, buildMinMi: 20, buildMaxMi: 22, cutbackMinMi: 15, cutbackMaxMi: 17 },
    { blockNumber: 2, buildMinMi: 22, buildMaxMi: 24, cutbackMinMi: 17, cutbackMaxMi: 19 },
    { blockNumber: 3, buildMinMi: 24, buildMaxMi: 26, cutbackMinMi: 19, cutbackMaxMi: 21 },
    { blockNumber: 4, buildMinMi: 26, buildMaxMi: 28, cutbackMinMi: 20, cutbackMaxMi: 22 },
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
