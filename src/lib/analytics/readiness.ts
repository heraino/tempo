import type { KpiSnapshot } from "./kpis"
import { fmtPace, fmtDistance } from "@/lib/fmt"
import { resolveTargetPaceMinPerKm, describeGoal, METERS_PER_MILE, type TrainingGoalLike } from "@/lib/goals/goal"
import { validatePlanJson } from "@/lib/validation/plan"

export interface WellnessForReadiness {
  nightBefore: {
    hrv: number | null
    sleepScore: number | null
    bodyBatteryMorning: number | null
  } | null
  sevenDayAvg: {
    hrv: number | null
    sleepScore: number | null
  } | null
}

/** Peak weekly mileage from the athlete's active program, if any — used as a
 *  real, plan-derived mileage target in preference to a distance-based guess. */
export interface MilestoneProgramContext {
  peakWeeklyMileageM?: number | null
}

/**
 * Derive a MilestoneProgramContext from a plan version's raw plan_json —
 * the peak build-week mileage across its progression blocks, if any. Shared
 * by every page that computes goal-relative readiness against an active plan.
 */
export function programContextFromPlanJson(planJson: unknown): MilestoneProgramContext | null {
  try {
    const plan = validatePlanJson(planJson)
    const blocks = plan.progressionBlocks
    if (!blocks || blocks.length === 0) return null
    const peakMi = Math.max(...blocks.map((b) => b.buildMaxMi))
    return peakMi > 0 ? { peakWeeklyMileageM: peakMi * METERS_PER_MILE } : null
  } catch {
    return null
  }
}

export interface ReadinessComponent {
  score: number
  weight: number
  label: string
  detail: string
}

export interface MilestoneTarget {
  metric: string
  current: string
  target: string
  achieved: boolean
}

export interface MilestoneStage {
  id: "current" | "m1" | "m2" | "m3" | "goal"
  label: string
  description: string
  completed: boolean
  active: boolean
  targets: MilestoneTarget[]
}

export interface ReadinessResult {
  total: number
  milestone: "pre-m1" | "m1" | "m2" | "m3" | "goal"
  milestoneLabel: string
  confidence: number
  confidenceLabel: "Low" | "Moderate" | "High"
  components: {
    aerobicEngine: ReadinessComponent
    threshold: ReadinessComponent
    longRun: ReadinessComponent
    consistency: ReadinessComponent
    frequency: ReadinessComponent
    economy: ReadinessComponent
  }
  milestoneStages: MilestoneStage[]
}

function clamp(x: number) { return Math.max(0, Math.min(100, x)) }

// ─── Generic beginner floors ────────────────────────────────────────────────
// These represent a "just starting out" reference point and hold regardless
// of the athlete's specific goal — the low end of the scale doesn't need to
// change based on what you're training for.
const E_FLOOR = 1609.344 / (11.5 * 60)    // 11:30/mi
const T_FLOOR = 1609.344 / (9.5  * 60)    //  9:30/mi
const LR_FLOOR = 5 * 1609.344              //  5 mi
const MILEAGE_FLOOR = 0
const FREQ_FLOOR = 0
const CAD_FLOOR = 150

// ─── Generic ceilings, used only when no goal-derived target exists ────────
const E_ADV_FALLBACK = 1609.344 / (8.75 * 60)   //  8:45/mi
const T_ADV_FALLBACK = 1609.344 / (7.167 * 60)  //  7:10/mi
const LR_ADV_FALLBACK = 14 * 1609.344            // 14 mi
const MILEAGE_ADV_FALLBACK = 25 * 1609.344       // 25 mi/wk
const FREQ_FALLBACK = 4                          //  4 runs/wk
const CAD_ADV = 172

// Approximations used only to fill in a target the goal doesn't state
// directly — clearly a simplification, not a personalized prescription:
//   easy pace  ≈ 85% of threshold speed (a commonly used rough ratio)
//   peak weekly mileage ≈ 3× the long run, absent a real program to read from
const EASY_TO_THRESHOLD_RATIO = 0.85
const MILEAGE_TO_LONGRUN_RATIO = 3

// ─── Per-goal-type weighting ─────────────────────────────────────────────────
// Percentage points, summing to 100. "economy" (cadence) stays a small,
// constant slice everywhere — it's a supplementary signal, not goal-specific.
interface GoalWeights {
  aerobic: number
  threshold: number
  longRun: number
  mileage: number
  frequency: number
  economy: number
}

const WEIGHTS: Record<string, GoalWeights> = {
  race:               { aerobic: 30, threshold: 30, longRun: 20, mileage: 15, frequency: 0,  economy: 5 },
  distance_milestone: { aerobic: 30, threshold: 10, longRun: 40, mileage: 15, frequency: 0,  economy: 5 },
  distance_at_pace:   { aerobic: 25, threshold: 40, longRun: 15, mileage: 15, frequency: 0,  economy: 5 },
  habit:              { aerobic: 20, threshold: 0,  longRun: 5,  mileage: 20, frequency: 50, economy: 5 },
  // No goal set (or an unrecognized goal type) — the original general-fitness blend.
  default:            { aerobic: 35, threshold: 25, longRun: 20, mileage: 15, frequency: 0,  economy: 5 },
}

function weightsFor(goalType: string | null | undefined): GoalWeights {
  return WEIGHTS[goalType ?? "default"] ?? WEIGHTS.default
}

// ─── Scales: floor/ceiling per metric, ceiling derived from the goal when possible ──
interface MetricScale {
  floor: number
  ceiling: number
}

function scale(target: number | null, floor: number, fallbackCeiling: number): MetricScale {
  if (target != null && target > floor) return { floor, ceiling: target }
  return { floor, ceiling: fallbackCeiling }
}

interface Scales {
  aerobic: MetricScale
  threshold: MetricScale
  longRun: MetricScale
  mileage: MetricScale
  frequency: MetricScale
  economy: MetricScale
}

/** Derive goal-relative scales. All null/absent inputs fall back to the generic scale. */
function deriveScales(
  goal: TrainingGoalLike | null | undefined,
  program: MilestoneProgramContext | null | undefined,
): Scales {
  const targetThresholdPaceMinPerKm = goal ? resolveTargetPaceMinPerKm(goal) : null
  const targetThresholdSpeedMps = targetThresholdPaceMinPerKm ? 1000 / (targetThresholdPaceMinPerKm * 60) : null
  const targetEasySpeedMps = targetThresholdSpeedMps ? targetThresholdSpeedMps * EASY_TO_THRESHOLD_RATIO : null
  const targetLongRunM = goal?.targetDistanceM ?? null
  const targetMileageM =
    program?.peakWeeklyMileageM ?? (targetLongRunM ? targetLongRunM * MILEAGE_TO_LONGRUN_RATIO : null)
  const targetFrequency = goal?.goalType === "habit" ? (goal.targetRunsPerWeek ?? null) : null

  return {
    aerobic: scale(targetEasySpeedMps, E_FLOOR, E_ADV_FALLBACK),
    threshold: scale(targetThresholdSpeedMps, T_FLOOR, T_ADV_FALLBACK),
    longRun: scale(targetLongRunM, LR_FLOOR, LR_ADV_FALLBACK),
    mileage: scale(targetMileageM, MILEAGE_FLOOR, MILEAGE_ADV_FALLBACK),
    frequency: scale(targetFrequency, FREQ_FLOOR, FREQ_FALLBACK),
    economy: { floor: CAD_FLOOR, ceiling: CAD_ADV },
  }
}

function scoreOn(value: number | null, s: MetricScale): number {
  if (value == null) return 0
  if (s.ceiling <= s.floor) return value >= s.ceiling ? 100 : 0
  return clamp(((value - s.floor) / (s.ceiling - s.floor)) * 100)
}

function valueAtFraction(s: MetricScale, fraction: number): number {
  return s.floor + (s.ceiling - s.floor) * fraction
}

function computeConfidence(kpis: KpiSnapshot): { score: number; label: "Low" | "Moderate" | "High" } {
  let pts = 0
  if (kpis.easyPaceAt140Mps != null) pts += 25
  if (kpis.thresholdSpeedMps != null) pts += 20
  if (kpis.longRunDistanceM != null)  pts += 20
  if (kpis.weeklyMileage != null)     pts += 15
  if (kpis.cadenceEasy != null || kpis.cadenceTempo != null) pts += 10
  // Workout volume bonus: up to 10 points for ≥10 recent workouts
  pts += Math.min(kpis.recentWorkoutCount, 10)
  const score = Math.min(100, pts)
  const label: "Low" | "Moderate" | "High" = score >= 67 ? "High" : score >= 34 ? "Moderate" : "Low"
  return { score, label }
}

// Compute a freshness multiplier [0.75, 1.05] based on today's wellness data.
// Each factor nudges the modifier up or down; they stack.
function freshnessModifier(wellness: WellnessForReadiness | null | undefined): number {
  if (!wellness) return 1.0
  let mod = 1.0

  const nb = wellness.nightBefore
  const avg = wellness.sevenDayAvg

  // HRV: compare last-night to 7-day baseline
  if (nb?.hrv != null && avg?.hrv != null && avg.hrv > 0) {
    const delta = nb.hrv - avg.hrv
    if (delta >= 5) mod += 0.05
    else if (delta <= -5) mod -= 0.10
  }

  // Sleep score: 0–100 Garmin scale
  if (nb?.sleepScore != null) {
    if (nb.sleepScore >= 80) mod += 0.02
    else if (nb.sleepScore < 60) mod -= 0.05
  }

  // Body battery in the morning (Garmin 0–100)
  if (nb?.bodyBatteryMorning != null) {
    if (nb.bodyBatteryMorning > 75) mod += 0.02
    else if (nb.bodyBatteryMorning < 30) mod -= 0.05
  }

  return Math.max(0.75, Math.min(1.05, mod))
}

function fmtFrequency(runsPerWeek: number): string {
  const rounded = Math.round(runsPerWeek * 10) / 10
  return `${rounded}×/wk`
}

interface MetricRow {
  key: keyof GoalWeights
  label: string
  currentValue: number | null
  s: MetricScale
  fmt: (v: number) => string
}

export function computeReadiness(
  kpis: KpiSnapshot,
  wellness?: WellnessForReadiness | null,
  goal?: TrainingGoalLike | null,
  program?: MilestoneProgramContext | null,
): ReadinessResult {
  const weights = weightsFor(goal?.goalType)
  const scales = deriveScales(goal, program)

  const cadSpm = kpis.cadenceEasy != null
    ? kpis.cadenceEasy * 2
    : kpis.cadenceTempo != null
    ? kpis.cadenceTempo * 2
    : null

  const rows: MetricRow[] = [
    { key: "aerobic",   label: "Aerobic engine", currentValue: kpis.easyPaceAt140Mps,  s: scales.aerobic,   fmt: fmtPace },
    { key: "threshold", label: "Threshold",      currentValue: kpis.thresholdSpeedMps, s: scales.threshold, fmt: fmtPace },
    { key: "longRun",   label: "Long run",       currentValue: kpis.longRunDistanceM,  s: scales.longRun,   fmt: fmtDistance },
    { key: "mileage",   label: "Weekly mileage", currentValue: kpis.weeklyMileage,     s: scales.mileage,   fmt: (v) => `${fmtDistance(v)}/wk` },
    { key: "frequency", label: "Weekly frequency", currentValue: kpis.weeklyRunFrequency, s: scales.frequency, fmt: fmtFrequency },
    { key: "economy",   label: "Economy",        currentValue: cadSpm,                 s: scales.economy,   fmt: (v) => `${Math.round(v)} spm` },
  ]

  const scores: Record<string, number> = {}
  for (const row of rows) scores[row.key] = scoreOn(row.currentValue, row.s)

  const rawTotal = rows.reduce((sum, row) => sum + scores[row.key] * (weights[row.key] / 100), 0)
  const freshMod = freshnessModifier(wellness)
  const total = Math.min(100, Math.round(rawTotal * freshMod))

  const { score: confidence, label: confidenceLabel } = computeConfidence(kpis)

  // A metric only gates/appears in the milestone ladder when it actually
  // counts toward this goal type's score — a 0-weight metric isn't part of
  // what this goal is asking of the athlete.
  const relevantRows = rows.filter((row) => weights[row.key] > 0)

  function passesFraction(fraction: number): boolean {
    if (relevantRows.length === 0) return false
    return relevantRows.every(
      (row) => (row.currentValue ?? row.s.floor) >= valueAtFraction(row.s, fraction)
    )
  }

  const passM1 = passesFraction(0.25)
  const passM2 = passM1 && passesFraction(0.5)
  const passM3 = passM2 && passesFraction(0.75)
  const passGoal = passM3 && passesFraction(1.0)

  const milestone: ReadinessResult["milestone"] =
    passGoal ? "goal" : passM3 ? "m3" : passM2 ? "m2" : passM1 ? "m1" : "pre-m1"

  function targetsAtFraction(fraction: number): MilestoneTarget[] {
    return relevantRows.map((row) => {
      const targetValue = valueAtFraction(row.s, fraction)
      return {
        metric: row.label,
        current: row.currentValue != null ? row.fmt(row.currentValue) : "—",
        target: row.fmt(targetValue),
        achieved: (row.currentValue ?? row.s.floor) >= targetValue,
      }
    })
  }

  const currentStage: MilestoneStage = {
    id: "current",
    label: "Current",
    description: "Where you are today",
    completed: false,
    active: false,
    targets: relevantRows.map((row) => ({
      metric: row.label,
      current: row.currentValue != null ? row.fmt(row.currentValue) : "—",
      target: "",
      achieved: true,
    })),
  }

  // No goal → nothing to build a forward-looking ladder toward. Returning
  // just the "Current" stage lets the dashboard skip the milestone card
  // entirely rather than showing a ladder that leads nowhere.
  const milestoneStages: MilestoneStage[] = [currentStage]

  if (goal && relevantRows.length > 0) {
    milestoneStages.push(
      {
        id: "m1",
        label: "Milestone 1",
        description: "A quarter of the way there",
        completed: passM1,
        active: !passM1,
        targets: targetsAtFraction(0.25),
      },
      {
        id: "m2",
        label: "Milestone 2",
        description: "Halfway there",
        completed: passM2,
        active: passM1 && !passM2,
        targets: targetsAtFraction(0.5),
      },
      {
        id: "m3",
        label: "Milestone 3",
        description: "Closing in",
        completed: passM3,
        active: passM2 && !passM3,
        targets: targetsAtFraction(0.75),
      },
      {
        id: "goal",
        label: "Goal",
        description: describeGoal(goal, "imperial"),
        completed: passGoal,
        active: passM3 && !passGoal,
        targets: targetsAtFraction(1.0),
      },
    )
  }

  return {
    total,
    milestone,
    milestoneLabel: {
      "pre-m1": "Building base",
      "m1":     "Milestone 1 reached",
      "m2":     "Milestone 2 reached",
      "m3":     "Milestone 3 reached",
      "goal":   "Goal pace reached",
    }[milestone],
    confidence,
    confidenceLabel,
    components: {
      aerobicEngine: {
        score: Math.round(scores.aerobic), weight: weights.aerobic, label: "Aerobic engine",
        detail: kpis.easyPaceAt140Mps ? `${fmtPace(kpis.easyPaceAt140Mps)} @140 bpm` : "No easy run data",
      },
      threshold: {
        score: Math.round(scores.threshold), weight: weights.threshold, label: "Threshold",
        detail: kpis.thresholdSpeedMps ? fmtPace(kpis.thresholdSpeedMps) : "No threshold data",
      },
      longRun: {
        score: Math.round(scores.longRun), weight: weights.longRun, label: "Long run",
        detail: kpis.longRunDistanceM ? fmtDistance(kpis.longRunDistanceM) : "No long run data",
      },
      consistency: {
        score: Math.round(scores.mileage), weight: weights.mileage, label: "Consistency",
        detail: kpis.weeklyMileage ? `${fmtDistance(kpis.weeklyMileage)}/wk` : "No recent runs",
      },
      frequency: {
        score: Math.round(scores.frequency), weight: weights.frequency, label: "Weekly frequency",
        detail: kpis.weeklyRunFrequency != null ? fmtFrequency(kpis.weeklyRunFrequency) : "No recent runs",
      },
      economy: {
        score: Math.round(scores.economy), weight: weights.economy, label: "Economy",
        detail: cadSpm ? `${cadSpm} spm` : "No cadence data",
      },
    },
    milestoneStages,
  }
}
