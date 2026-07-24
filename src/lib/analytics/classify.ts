export type SessionKind =
  | "easy"
  | "long"
  | "tempo"
  | "threshold"
  | "recovery"
  | "other"

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  easy: "Easy",
  long: "Long run",
  tempo: "Tempo",
  threshold: "Threshold",
  recovery: "Recovery",
  other: "Other",
}

// Definitively non-running sports — these will never receive running-specific
// session kinds and are excluded from running KPI computation.
const NON_RUNNING_SPORTS = new Set([
  "cycling", "swimming", "walking", "fitness_equipment",
  "winter_sports", "snowboarding", "alpine_skiing", "cross_country_skiing",
  "golf", "mountaineering", "hiking", "training", "basketball",
  "soccer", "tennis", "rowing", "kayaking", "open_water",
  "stand_up_paddleboarding", "sailing", "yoga", "strength_training",
  "transition", "elliptical", "stair_climbing", "multisport",
])

// Returns true if this sport should be treated as a running activity.
// null/empty = legacy data without sport field → assume running.
export function isRunningSport(sport: string | null | undefined): boolean {
  if (!sport) return true
  return !NON_RUNNING_SPORTS.has(sport.toLowerCase())
}

export interface WorkoutForClassification {
  totalTimerSecs?: number | null
  totalDistanceM?: number | null
  avgHr?: number | null
  sessionKindOverride?: string | null
  sport?: string | null
}

export function classifyWorkout(w: WorkoutForClassification): SessionKind {
  if (w.sessionKindOverride) return w.sessionKindOverride as SessionKind
  return heuristicClassify(w)
}

export function heuristicClassify(w: WorkoutForClassification): SessionKind {
  if (!isRunningSport(w.sport)) return "other"

  const durationMin = (w.totalTimerSecs ?? 0) / 60
  const distanceMi = (w.totalDistanceM ?? 0) / 1609.344
  const hr = w.avgHr ?? 0

  if (durationMin > 75 || distanceMi > 9) return "long"
  if (hr >= 168) return "threshold"
  if (hr >= 158) return "tempo"
  if (hr > 0 && hr <= 130) return "recovery"
  return "easy"
}
