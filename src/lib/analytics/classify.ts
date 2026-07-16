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

export interface WorkoutForClassification {
  totalTimerSecs?: number | null
  totalDistanceM?: number | null
  avgHr?: number | null
  sessionKindOverride?: string | null
}

export function classifyWorkout(w: WorkoutForClassification): SessionKind {
  if (w.sessionKindOverride) return w.sessionKindOverride as SessionKind
  return heuristicClassify(w)
}

export function heuristicClassify(w: WorkoutForClassification): SessionKind {
  const durationMin = (w.totalTimerSecs ?? 0) / 60
  const distanceMi = (w.totalDistanceM ?? 0) / 1609.344
  const hr = w.avgHr ?? 0

  if (durationMin > 75 || distanceMi > 9) return "long"
  if (hr >= 168) return "threshold"
  if (hr >= 158) return "tempo"
  if (hr > 0 && hr <= 130) return "recovery"
  return "easy"
}
