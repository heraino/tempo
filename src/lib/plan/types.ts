// Approved generic cycle/session architecture — rev 2.
// A/B/C/D are seed data only; the type system uses generic string IDs.

export type PlanJsonVersion = 1

export interface PlanJson {
  version: PlanJsonVersion
  cycleWeeks: CycleWeek[]
  mileageBands?: MileageBand[]
}

export interface CycleWeek {
  id: string       // user-defined: "A", "base", "peak", etc.
  label: string    // display name: "Threshold", "Tempo", "Cutback", etc.
  days: DayTemplate[]
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
