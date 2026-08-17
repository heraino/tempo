/**
 * Deterministic per-session distance, pace, duration, and heart-rate targets.
 *
 * These are coaching heuristics, not measured physiology: mileage is split
 * across a week's sessions by a fixed relative-weight table, pace is a ratio
 * of a threshold-equivalent reference pace — mirroring the 0.85 easy:threshold
 * ratio already used in readiness.ts — and HR range is a %-of-max-HR band.
 * They only ever fill a gap; an explicit value already on a session template
 * always wins. And they are omitted entirely wherever an input they'd need (a
 * progression block, a reference pace, a max HR) doesn't exist, rather than
 * guessed.
 */

import type { SessionKind, ProgressionBlock } from "./types"
import { METERS_PER_MILE, resolveTargetPaceMinPerKm, type TrainingGoalLike } from "@/lib/goals/goal"
import type { KpiSnapshot } from "@/lib/analytics/kpis"

/** Ratio of easy-effort speed to threshold speed, mirroring readiness.ts's own EASY_TO_THRESHOLD_RATIO — used here in reverse, to back into an estimated threshold pace from a measured easy pace. */
const MEASURED_EASY_TO_THRESHOLD_RATIO = 0.85

/**
 * The threshold-equivalent pace training targets should actually be built
 * from — the athlete's CURRENT fitness, not their goal. A generated program
 * exists to progress someone FROM where they are TO their goal; prescribing
 * goal pace from day one ignores real, already-available evidence of what
 * they can do today.
 *
 * Prefers, in order: a directly measured threshold-effort pace from a recent
 * logged workout; an estimate derived from a measured easy-effort pace; and
 * only when neither exists (e.g. a brand-new athlete with no logged running
 * history at all) falls back to the goal's own target pace as a starting
 * scaffold, since there is nothing measured to go on yet.
 */
export function resolveCurrentThresholdPaceMinPerKm(
  kpis: KpiSnapshot | null | undefined,
  goal: TrainingGoalLike | null | undefined,
): number | null {
  if (kpis?.thresholdSpeedMps) {
    return 1000 / (kpis.thresholdSpeedMps * 60)
  }
  if (kpis?.easyPaceAt140Mps) {
    const estimatedThresholdSpeedMps = kpis.easyPaceAt140Mps / MEASURED_EASY_TO_THRESHOLD_RATIO
    return 1000 / (estimatedThresholdSpeedMps * 60)
  }
  return goal ? resolveTargetPaceMinPerKm(goal) : null
}

/** Relative share of weekly running volume by kind. Long runs and quality sessions carry more of the week's total than easy volume; non-running kinds carry none. */
const DISTANCE_WEIGHT: Partial<Record<SessionKind, number>> = {
  long: 3,
  threshold: 1.5,
  tempo: 1.5,
  progression: 1.5,
  easy: 1,
  recovery: 0.6,
  strides: 0.8,
}

/** Pace as a ratio of the goal's threshold-equivalent speed (higher = faster). */
const SPEED_RATIO: Partial<Record<SessionKind, number>> = {
  threshold: 1.0,
  tempo: 0.93,
  progression: 0.9,
  long: 0.83,
  easy: 0.85,
  recovery: 0.75,
  strides: 0.85,
}

/** Heart-rate zone as a fraction of max HR, by kind. Long run's lower bound matches easy (same target effort); its upper bound runs a little higher to allow for cardiac drift over the extra duration. */
const HR_ZONE_PCT: Partial<Record<SessionKind, { min: number; max: number }>> = {
  recovery: { min: 0.6, max: 0.68 },
  easy: { min: 0.65, max: 0.75 },
  long: { min: 0.65, max: 0.78 },
  strides: { min: 0.65, max: 0.8 },
  progression: { min: 0.7, max: 0.88 },
  tempo: { min: 0.8, max: 0.87 },
  threshold: { min: 0.82, max: 0.9 },
}

export interface WeeklyMileageTarget {
  targetMi: number
  isCutback: boolean
}

/**
 * Resolve the week's target mileage from the progression block that applies
 * at weekOrdinal weeks since the plan's first cycle week — one block per full
 * pass through the repeating cycle. Clamps to the last authored block once
 * the plan outlasts them, rather than inventing further progression. Null
 * when the plan defines no progression at all.
 */
export function resolveWeeklyMileageTarget(
  progressionBlocks: ProgressionBlock[] | undefined,
  cycleWeeksLen: number,
  weekOrdinal: number,
  isCutback: boolean,
): WeeklyMileageTarget | null {
  if (!progressionBlocks || progressionBlocks.length === 0 || cycleWeeksLen <= 0) return null
  const passNumber = Math.floor(weekOrdinal / cycleWeeksLen)
  const blockIndex = Math.min(Math.max(passNumber, 0), progressionBlocks.length - 1)
  const block =
    progressionBlocks.find((b) => b.blockNumber === blockIndex + 1) ?? progressionBlocks[blockIndex]
  if (!block) return null
  const targetMi = isCutback
    ? (block.cutbackMinMi + block.cutbackMaxMi) / 2
    : (block.buildMinMi + block.buildMaxMi) / 2
  return { targetMi, isCutback }
}

export interface SessionTargets {
  targetDistanceM?: number
  targetPaceMinPerKm?: number
  targetDurationSecs?: number
  targetHrMin?: number
  targetHrMax?: number
}

/**
 * Derive distance/pace/duration/HR for one session of a given kind.
 * weekSessionKinds is every session kind the recurring cycle week template
 * schedules across all seven days — the basis for splitting the week's
 * mileage target by relative weight.
 */
export function computeSessionTargets(
  kind: SessionKind,
  weekSessionKinds: SessionKind[],
  weeklyTarget: WeeklyMileageTarget | null,
  thresholdPaceMinPerKm: number | null,
  maxHr: number | null = null,
): SessionTargets {
  const weight = DISTANCE_WEIGHT[kind]
  let targetDistanceM: number | undefined
  if (weight != null && weeklyTarget) {
    const totalWeight = weekSessionKinds.reduce((sum, k) => sum + (DISTANCE_WEIGHT[k] ?? 0), 0)
    if (totalWeight > 0) {
      targetDistanceM = weeklyTarget.targetMi * (weight / totalWeight) * METERS_PER_MILE
    }
  }

  const ratio = SPEED_RATIO[kind]
  const targetPaceMinPerKm =
    ratio != null && thresholdPaceMinPerKm != null ? thresholdPaceMinPerKm / ratio : undefined

  const targetDurationSecs =
    targetDistanceM != null && targetPaceMinPerKm != null
      ? (targetDistanceM / 1000) * targetPaceMinPerKm * 60
      : undefined

  const hrZone = HR_ZONE_PCT[kind]
  const targetHrMin = hrZone != null && maxHr != null ? Math.round(maxHr * hrZone.min) : undefined
  const targetHrMax = hrZone != null && maxHr != null ? Math.round(maxHr * hrZone.max) : undefined

  return { targetDistanceM, targetPaceMinPerKm, targetDurationSecs, targetHrMin, targetHrMax }
}
