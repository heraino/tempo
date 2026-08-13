/**
 * Training goal domain logic — pure and deterministic.
 *
 * Canonical units are SI (meters, seconds, min/km). Conversion to miles and
 * min/mi happens at the display boundary only.
 */

export const GOAL_TYPES = [
  "race",
  "distance_milestone",
  "distance_at_pace",
  "habit",
] as const

export type GoalType = (typeof GOAL_TYPES)[number]

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  race: "Race",
  distance_milestone: "Distance milestone",
  distance_at_pace: "Pace or time goal",
  habit: "Consistency",
}

export const GOAL_TYPE_DESCRIPTIONS: Record<GoalType, string> = {
  race: "Train for a specific race on a specific date",
  distance_milestone: "Run a distance you haven't run before",
  distance_at_pace: "Hit a target pace, finish time, or both — no race required",
  habit: "Build a consistent running routine",
}

export const METERS_PER_MILE = 1609.344

/** Standard race distances in meters. */
export const RACE_PRESETS = [
  { key: "5k",       label: "5K",            meters: 5000 },
  { key: "10k",      label: "10K",           meters: 10000 },
  { key: "15k",      label: "15K",           meters: 15000 },
  { key: "10mi",     label: "10 miles",      meters: 10 * METERS_PER_MILE },
  { key: "half",     label: "Half marathon", meters: 21097.5 },
  { key: "marathon", label: "Marathon",      meters: 42195 },
  { key: "50k",      label: "50K ultra",     meters: 50000 },
] as const

/** Distance milestones aimed at newer runners, in meters. */
export const MILESTONE_PRESETS = [
  { key: "1mi",  label: "1 mile continuous",  meters: 1 * METERS_PER_MILE },
  { key: "5k",   label: "5K continuous",      meters: 5000 },
  { key: "10k",  label: "10K continuous",     meters: 10000 },
  { key: "10mi", label: "10 miles",           meters: 10 * METERS_PER_MILE },
  { key: "half", label: "Half marathon",      meters: 21097.5 },
] as const

export interface TrainingGoalLike {
  goalType: string
  title?: string | null
  targetDate?: string | null
  targetDistanceM?: number | null
  targetDurationSecs?: number | null
  targetPaceMinPerKm?: number | null
  targetRunsPerWeek?: number | null
}

// ─── Conversions ──────────────────────────────────────────────────────────────

export function minPerKmToMinPerMile(minPerKm: number): number {
  return minPerKm * (METERS_PER_MILE / 1000)
}

export function minPerMileToMinPerKm(minPerMile: number): number {
  return minPerMile / (METERS_PER_MILE / 1000)
}

/** Format a min/km pace as "M:SS" in the requested unit system. */
export function fmtGoalPace(
  minPerKm: number | null | undefined,
  units: "imperial" | "metric",
): string | null {
  if (minPerKm == null || !isFinite(minPerKm) || minPerKm <= 0) return null
  const value = units === "metric" ? minPerKm : minPerKmToMinPerMile(minPerKm)
  const totalSecs = Math.round(value * 60)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${String(secs).padStart(2, "0")}/${units === "metric" ? "km" : "mi"}`
}

/** Format a duration in seconds as "H:MM:SS" or "M:SS". */
export function fmtGoalDuration(secs: number | null | undefined): string | null {
  if (secs == null || !isFinite(secs) || secs <= 0) return null
  const total = Math.round(secs)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

/** Format a distance in meters for display. */
export function fmtGoalDistance(
  meters: number | null | undefined,
  units: "imperial" | "metric",
): string | null {
  if (meters == null || !isFinite(meters) || meters <= 0) return null
  // Prefer the canonical race label when it matches a standard distance
  const preset = RACE_PRESETS.find((p) => Math.abs(p.meters - meters) < 10)
  if (preset) return preset.label
  if (units === "metric") {
    const km = meters / 1000
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`
  }
  const mi = meters / METERS_PER_MILE
  return `${mi % 1 === 0 ? mi.toFixed(0) : mi.toFixed(1)} mi`
}

// ─── Input parsing ────────────────────────────────────────────────────────────

/**
 * Parse a colon-separated duration into seconds.
 * Accepts "H:MM:SS", "M:SS", or a bare number of minutes ("45").
 * Returns null for empty or malformed input.
 */
export function parseDurationToSecs(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const parts = trimmed.split(":")
  if (parts.length > 3) return null
  if (parts.some((p) => p.trim() === "" || !/^\d+$/.test(p.trim()))) return null

  const nums = parts.map((p) => parseInt(p.trim(), 10))
  if (nums.some((n) => isNaN(n))) return null

  // Minutes and seconds fields must be valid clock values
  if (nums.length >= 2 && nums[nums.length - 1] > 59) return null
  if (nums.length === 3 && nums[1] > 59) return null

  let secs: number
  if (nums.length === 1) secs = nums[0] * 60          // bare minutes
  else if (nums.length === 2) secs = nums[0] * 60 + nums[1]
  else secs = nums[0] * 3600 + nums[1] * 60 + nums[2]

  return secs > 0 ? secs : null
}

/**
 * Parse a "M:SS" pace in the given unit system into canonical min/km.
 * Returns null for empty or malformed input.
 */
export function parsePaceToMinPerKm(
  input: string,
  units: "imperial" | "metric",
): number | null {
  const secs = parseDurationToSecs(input)
  if (secs == null) return null
  const minutes = secs / 60
  return units === "metric" ? minutes : minPerMileToMinPerKm(minutes)
}

/** Format a min/km pace as a bare "M:SS" for use as a form input value. */
export function paceToInputValue(
  minPerKm: number | null | undefined,
  units: "imperial" | "metric",
): string {
  if (minPerKm == null || !isFinite(minPerKm) || minPerKm <= 0) return ""
  const value = units === "metric" ? minPerKm : minPerKmToMinPerMile(minPerKm)
  const totalSecs = Math.round(value * 60)
  return `${Math.floor(totalSecs / 60)}:${String(totalSecs % 60).padStart(2, "0")}`
}

/** Format seconds as a bare "H:MM:SS" / "M:SS" for use as a form input value. */
export function durationToInputValue(secs: number | null | undefined): string {
  return fmtGoalDuration(secs) ?? ""
}

// ─── Derived values ───────────────────────────────────────────────────────────

/**
 * Pace implied by a distance + finish time pair, in min/km.
 * Returns null when either input is missing or non-positive.
 */
export function impliedPaceMinPerKm(
  distanceM: number | null | undefined,
  durationSecs: number | null | undefined,
): number | null {
  if (!distanceM || !durationSecs || distanceM <= 0 || durationSecs <= 0) return null
  return durationSecs / 60 / (distanceM / 1000)
}

/**
 * The target pace for a goal — explicit if set, otherwise derived from
 * distance + finish time. Returns null when the goal implies no pace target.
 */
export function resolveTargetPaceMinPerKm(goal: TrainingGoalLike): number | null {
  if (goal.targetPaceMinPerKm != null && goal.targetPaceMinPerKm > 0) {
    return goal.targetPaceMinPerKm
  }
  return impliedPaceMinPerKm(goal.targetDistanceM, goal.targetDurationSecs)
}

/**
 * Whole weeks between two YYYY-MM-DD dates (may be negative if the target
 * is in the past). Uses UTC midnight to stay timezone-stable.
 */
export function weeksBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`)
  const to = Date.parse(`${toDate}T00:00:00Z`)
  if (isNaN(from) || isNaN(to)) return 0
  return Math.round((to - from) / (7 * 24 * 60 * 60 * 1000))
}

/** Days between two YYYY-MM-DD dates (negative when toDate is in the past). */
export function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`)
  const to = Date.parse(`${toDate}T00:00:00Z`)
  if (isNaN(from) || isNaN(to)) return 0
  return Math.round((to - from) / (24 * 60 * 60 * 1000))
}

/**
 * A one-line human summary of the goal, e.g.
 *   "Half marathon in 1:45:00 (8:00/mi) by Apr 12, 2026"
 *   "Run 5K continuous"
 *   "Run 4× per week"
 */
export function describeGoal(
  goal: TrainingGoalLike,
  units: "imperial" | "metric" = "imperial",
): string {
  const distance = fmtGoalDistance(goal.targetDistanceM, units)
  const duration = fmtGoalDuration(goal.targetDurationSecs)
  const pace = fmtGoalPace(resolveTargetPaceMinPerKm(goal), units)
  const by = goal.targetDate ? ` by ${fmtGoalDate(goal.targetDate)}` : ""

  switch (goal.goalType) {
    case "race": {
      const head = distance ?? "Race"
      if (duration) return `${head} in ${duration}${pace ? ` (${pace})` : ""}${by}`
      return `${head}${by}`
    }
    case "distance_milestone":
      return `Run ${distance ?? "a new distance"} continuous${by}`
    // "pace" was merged into "distance_at_pace" (the same fields, minus a finish
    // time) and is no longer selectable — kept so any already-saved goal of
    // this type still renders correctly.
    case "pace": {
      if (!pace) return `Get faster${by}`
      return distance ? `${distance} at ${pace}${by}` : `Run at ${pace}${by}`
    }
    case "distance_at_pace": {
      const head = distance ?? "Target distance"
      if (duration) return `${head} in ${duration}${pace ? ` (${pace})` : ""}${by}`
      return pace ? `${head} at ${pace}${by}` : `${head}${by}`
    }
    case "habit":
      return goal.targetRunsPerWeek
        ? `Run ${goal.targetRunsPerWeek}× per week`
        : "Build a consistent routine"
    default:
      return goal.title ?? "Training goal"
  }
}

/** Format a YYYY-MM-DD date as "Apr 12, 2026" without timezone drift. */
export function fmtGoalDate(dateStr: string): string {
  const parsed = new Date(`${dateStr}T00:00:00Z`)
  if (isNaN(parsed.getTime())) return dateStr
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

/**
 * Suggest a plan name from the goal. Used as the default training program
 * title; the athlete can always rename it.
 */
export function suggestPlanTitle(
  goal: TrainingGoalLike,
  units: "imperial" | "metric" = "imperial",
): string {
  const distance = fmtGoalDistance(goal.targetDistanceM, units)
  switch (goal.goalType) {
    case "race":
      return distance ? `${distance} Race Plan` : "Race Plan"
    case "distance_milestone":
      return distance ? `Road to ${distance}` : "Distance Build"
    // Legacy — see the matching comment in describeGoal().
    case "pace": {
      const pace = fmtGoalPace(resolveTargetPaceMinPerKm(goal), units)
      return pace ? `${pace} Project` : "Speed Project"
    }
    case "distance_at_pace": {
      const duration = fmtGoalDuration(goal.targetDurationSecs)
      if (distance && duration) return `${distance} in ${duration}`
      return distance ? `${distance} Project` : "Time Goal Project"
    }
    case "habit":
      return "Consistency Base"
    default:
      return "Training Plan"
  }
}
