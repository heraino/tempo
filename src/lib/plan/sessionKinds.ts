import type { SessionKind } from "./types"

/**
 * Display metadata and sensible defaults for each session kind.
 *
 * These defaults are used when an athlete swaps a session's type on a single
 * day. They are starting points the athlete can edit — they are NOT plan
 * structure, and changing a day's session does not alter the plan version.
 */
export interface SessionKindMeta {
  label: string
  defaultPrescription: string
  isRunSession: boolean
  isStrengthSession: boolean
  chipClass: string
}

export const SESSION_KIND_META: Record<SessionKind, SessionKindMeta> = {
  easy: {
    label: "Easy run",
    defaultPrescription: "Easy conversational effort. Keep heart rate aerobic throughout.",
    isRunSession: true,
    isStrengthSession: false,
    chipClass: "bg-green-50 text-green-700",
  },
  recovery: {
    label: "Recovery run",
    defaultPrescription: "Very easy shakeout. Short and slow — the goal is blood flow, not fitness.",
    isRunSession: true,
    isStrengthSession: false,
    chipClass: "bg-gray-100 text-gray-500",
  },
  long: {
    label: "Long run",
    defaultPrescription: "Steady aerobic long run. Hold an easy effort and finish feeling strong.",
    isRunSession: true,
    isStrengthSession: false,
    chipClass: "bg-blue-50 text-blue-700",
  },
  threshold: {
    label: "Threshold",
    defaultPrescription: "Warm up, then sustained comfortably-hard work at threshold effort. Cool down.",
    isRunSession: true,
    isStrengthSession: false,
    chipClass: "bg-red-50 text-red-700",
  },
  tempo: {
    label: "Tempo",
    defaultPrescription: "Warm up, then a controlled tempo block at moderately hard effort. Cool down.",
    isRunSession: true,
    isStrengthSession: false,
    chipClass: "bg-orange-50 text-orange-700",
  },
  progression: {
    label: "Progression",
    defaultPrescription: "Start easy and progressively increase pace, finishing the final third strongest.",
    isRunSession: true,
    isStrengthSession: false,
    chipClass: "bg-amber-50 text-amber-700",
  },
  strides: {
    label: "Strides",
    defaultPrescription: "Easy run with short controlled accelerations. Full recovery between reps.",
    isRunSession: true,
    isStrengthSession: false,
    chipClass: "bg-purple-50 text-purple-700",
  },
  strength: {
    label: "Strength",
    defaultPrescription: "Strength session. Focus on quality of movement over load.",
    isRunSession: false,
    isStrengthSession: true,
    chipClass: "bg-indigo-50 text-indigo-700",
  },
  elastic: {
    label: "Elastic / plyo",
    defaultPrescription: "Low-volume elasticity work. Quality reps, full recovery, stop before fatigue.",
    isRunSession: false,
    isStrengthSession: true,
    chipClass: "bg-teal-50 text-teal-700",
  },
  rest: {
    label: "Rest",
    defaultPrescription: "Full rest day. Recovery is where adaptation happens.",
    isRunSession: false,
    isStrengthSession: false,
    chipClass: "bg-gray-100 text-gray-400",
  },
  custom: {
    label: "Custom",
    defaultPrescription: "Custom session.",
    isRunSession: true,
    isStrengthSession: false,
    chipClass: "bg-gray-100 text-gray-500",
  },
}

/** Kinds an athlete can pick when swapping a session on a single day. */
export const SWAPPABLE_KINDS: SessionKind[] = [
  "easy", "recovery", "long", "tempo", "threshold",
  "progression", "strides", "strength", "elastic",
]

export function sessionKindMeta(kind: string): SessionKindMeta {
  return SESSION_KIND_META[kind as SessionKind] ?? SESSION_KIND_META.custom
}
