// Approved generic cycle/session architecture — rev 3.
// A/B/C/D are seed data only; the type system uses generic string IDs.

export type PlanJsonVersion = 1

export interface PlanJson {
  version: PlanJsonVersion
  cycleWeeks: CycleWeek[]
  /** @deprecated Use progressionBlocks instead. Retained for backward compat. */
  mileageBands?: MileageBand[]
  /**
   * Canonical mileage progression model.
   * Each block defines target mileage for build weeks (isCutback=false) and
   * cutback weeks (isCutback=true). Phase 5 derives the live target from
   * trainingState.currentBlock + cycleWeek.isCutback.
   */
  progressionBlocks?: ProgressionBlock[]
}

export interface CycleWeek {
  id: string       // user-defined: "A", "base", "peak", etc.
  label: string    // display name: "Threshold", "Tempo", "Cutback", etc.
  days: DayTemplate[]
  /**
   * True for cutback/recovery cycle weeks (e.g. Week D).
   * Build weeks omit this field or set it to false.
   * Phase 5 uses this to select the correct mileage band from ProgressionBlock.
   */
  isCutback?: boolean
}

export interface DayTemplate {
  weekday: Weekday
  sessions: SessionTemplate[]  // zero = rest, 1 = single, 2+ = doubles/mixed
}

export interface SessionTemplate {
  sessionKind: SessionKind
  customType?: string    // only when sessionKind === "custom"
  label: string
  prescription: string
  isRunSession: boolean
  isStrengthSession: boolean
  targetDistanceM?: number
  targetDurationSecs?: number
  targetHrMin?: number
  targetHrMax?: number
  targetPaceMinPerKm?: number
  intervals?: IntervalBlock[]
}

// Stable analytics taxonomy. New kinds require deliberate extension here.
// Custom semantics use sessionKind="custom" + customType string.
export type SessionKind =
  | "easy"
  | "recovery"
  | "long"
  | "threshold"
  | "tempo"
  | "progression"
  | "strides"
  | "strength"
  | "elastic"
  | "rest"
  | "custom"

export interface IntervalBlock {
  reps: number
  workDurationSecs?: number
  workDistanceM?: number
  recDurationSecs?: number
  recDistanceM?: number
  label?: string
  targetHrMin?: number
  targetHrMax?: number
}

/**
 * Mileage target for one progression block.
 * blockNumber is 1-indexed (Block 1 = first build cycle).
 * Phase 5 resolves the live target:
 *   isCutback=false → buildMinMi..buildMaxMi
 *   isCutback=true  → cutbackMinMi..cutbackMaxMi
 */
export interface ProgressionBlock {
  blockNumber: number
  buildMinMi: number
  buildMaxMi: number
  cutbackMinMi: number
  cutbackMaxMi: number
}

/** @deprecated Use ProgressionBlock. Retained for backward compat. */
export interface MileageBand {
  cycleWeekId: string
  minMi: number
  maxMi: number
}

export type Weekday =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday"
