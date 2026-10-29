import type { TrainingMode } from "@/lib/services/userPreferences.service"

/**
 * Whether the dashboard should send the athlete to onboarding.
 *
 * Only when we positively know they have no plan and aren't in "just run"
 * mode. A failed load is evidence of neither: redirecting on one sends a
 * settled athlete back to the first-run wizard, a click away from replacing
 * their plan, because of a transient database error.
 */
export function needsOnboarding(load: {
  hasSchedule: boolean
  scheduleFailed: boolean
  /** null when preferences failed to load — the mode is unknown, not the default. */
  trainingMode: TrainingMode | null
}): boolean {
  if (load.scheduleFailed || load.trainingMode === null) return false
  return !load.hasSchedule && load.trainingMode !== "just_run"
}
