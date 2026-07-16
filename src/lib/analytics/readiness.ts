import type { KpiSnapshot } from "./kpis"
import { fmtPace, fmtDistance } from "@/lib/fmt"

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
  id: "current" | "m1" | "m2" | "advanced" | "goal"
  label: string
  description: string
  completed: boolean   // all targets met
  active: boolean      // the stage the athlete is currently working toward
  targets: MilestoneTarget[]
}

export interface ReadinessResult {
  total: number
  milestone: "pre-m1" | "m1" | "m2" | "advanced"
  milestoneLabel: string
  components: {
    aerobicEngine: ReadinessComponent
    threshold: ReadinessComponent
    longRun: ReadinessComponent
    consistency: ReadinessComponent
    economy: ReadinessComponent
  }
  milestoneStages: MilestoneStage[]
}

// ─── Reference speeds / distances ─────────────────────────────────────────────
const E_FLOOR = 1609.344 / (11.5  * 60)   // 11:30/mi — score floor
const E_M1    = 1609.344 / (10.75 * 60)   // 10:45/mi
const E_M2    = 1609.344 / (10.0  * 60)   // 10:00/mi
const E_ADV   = 1609.344 / (8.75  * 60)   //  8:45/mi — score ceiling

const T_FLOOR = 1609.344 / (9.5   * 60)   //  9:30/mi
const T_M1    = 1609.344 / (8.5   * 60)   //  8:30/mi
const T_M2    = 1609.344 / (8.0   * 60)   //  8:00/mi
const T_ADV   = 1609.344 / (7.167 * 60)   //  7:10/mi

const LR_FLOOR = 5  * 1609.344
const LR_M1    = 8  * 1609.344
const LR_M2    = 10 * 1609.344
const LR_ADV   = 11 * 1609.344

const CON_TARGET = 25 * 1609.344

const CAD_FLOOR = 150
const CAD_ADV   = 172

function clamp(x: number) { return Math.max(0, Math.min(100, x)) }
function lerp(x: number, lo: number, hi: number) { return clamp(((x - lo) / (hi - lo)) * 100) }

function speedTarget(
  value: number | null,
  threshold: number,
  targetLabel: string,
  metricLabel: string,
): MilestoneTarget {
  return {
    metric: metricLabel,
    current: value ? fmtPace(value) : "—",
    target: targetLabel,
    achieved: (value ?? 0) >= threshold,
  }
}

function distTarget(
  value: number | null,
  threshold: number,
  targetLabel: string,
): MilestoneTarget {
  return {
    metric: "Long run",
    current: value ? fmtDistance(value) : "—",
    target: targetLabel,
    achieved: (value ?? 0) >= threshold,
  }
}

export function computeReadiness(kpis: KpiSnapshot): ReadinessResult {
  const ae  = kpis.easyPaceAt140Mps   ? lerp(kpis.easyPaceAt140Mps,   E_FLOOR, E_ADV)   : 0
  const th  = kpis.thresholdSpeedMps  ? lerp(kpis.thresholdSpeedMps,  T_FLOOR, T_ADV)   : 0
  const lr  = kpis.longRunDistanceM   ? lerp(kpis.longRunDistanceM,   LR_FLOOR, LR_ADV) : 0
  const con = kpis.weeklyMileage      ? clamp((kpis.weeklyMileage / CON_TARGET) * 100)    : 0
  const cadSpm = kpis.cadenceEasy != null
    ? kpis.cadenceEasy * 2
    : kpis.cadenceTempo != null
    ? kpis.cadenceTempo * 2
    : null
  const eco = cadSpm ? lerp(cadSpm, CAD_FLOOR, CAD_ADV) : 0

  const total = Math.round(ae * 0.35 + th * 0.25 + lr * 0.20 + con * 0.15 + eco * 0.05)

  // ── Milestone gates ──────────────────────────────────────────────────────────
  const passM1 = (kpis.easyPaceAt140Mps ?? 0) >= E_M1 &&
                 (kpis.thresholdSpeedMps ?? 0) >= T_M1 &&
                 (kpis.longRunDistanceM  ?? 0) >= LR_M1
  const passM2 = passM1 &&
                 (kpis.easyPaceAt140Mps ?? 0) >= E_M2 &&
                 (kpis.thresholdSpeedMps ?? 0) >= T_M2 &&
                 (kpis.longRunDistanceM  ?? 0) >= LR_M2
  const passAdv = passM2 &&
                  (kpis.easyPaceAt140Mps ?? 0) >= E_ADV &&
                  (kpis.thresholdSpeedMps ?? 0) >= T_ADV &&
                  (kpis.longRunDistanceM  ?? 0) >= LR_ADV

  const milestone: ReadinessResult["milestone"] =
    passAdv ? "advanced" : passM2 ? "m2" : passM1 ? "m1" : "pre-m1"

  // ── Build stage list ─────────────────────────────────────────────────────────

  const currentStage: MilestoneStage = {
    id: "current",
    label: "Current",
    description: "Where you are today",
    completed: false,
    active: false,
    targets: [
      {
        metric: "Easy pace @140 bpm",
        current: kpis.easyPaceAt140Mps ? fmtPace(kpis.easyPaceAt140Mps) : "—",
        target: "",
        achieved: true,
      },
      {
        metric: "Threshold pace",
        current: kpis.thresholdSpeedMps ? fmtPace(kpis.thresholdSpeedMps) : "—",
        target: "",
        achieved: true,
      },
      {
        metric: "Long run",
        current: kpis.longRunDistanceM ? fmtDistance(kpis.longRunDistanceM) : "—",
        target: "",
        achieved: true,
      },
      {
        metric: "Weekly mileage",
        current: kpis.weeklyMileage ? fmtDistance(kpis.weeklyMileage) + "/wk" : "—",
        target: "",
        achieved: true,
      },
    ],
  }

  const m1Stage: MilestoneStage = {
    id: "m1",
    label: "Milestone 1",
    description: "Aerobic base established",
    completed: passM1,
    active: !passM1,
    targets: [
      speedTarget(kpis.easyPaceAt140Mps, E_M1, "<10:45/mi", "Easy pace @140 bpm"),
      speedTarget(kpis.thresholdSpeedMps, T_M1, "<8:30/mi",  "Threshold pace"),
      distTarget(kpis.longRunDistanceM, LR_M1, "8–9 mi with minimal drift"),
      {
        metric: "Weekly mileage",
        current: kpis.weeklyMileage ? fmtDistance(kpis.weeklyMileage) + "/wk" : "—",
        target: "Consistent 5-run weeks",
        achieved: (kpis.weeklyMileage ?? 0) >= 20 * 1609.344,
      },
    ],
  }

  const m2Stage: MilestoneStage = {
    id: "m2",
    label: "Milestone 2",
    description: "Quality work taking hold",
    completed: passM2,
    active: passM1 && !passM2,
    targets: [
      speedTarget(kpis.easyPaceAt140Mps, E_M2, "~10:00/mi",  "Easy pace @140 bpm"),
      speedTarget(kpis.thresholdSpeedMps, T_M2, "<8:00/mi",   "Threshold pace"),
      distTarget(kpis.longRunDistanceM, LR_M2, "10–11 mi with good durability"),
      {
        metric: "Weekly mileage",
        current: kpis.weeklyMileage ? fmtDistance(kpis.weeklyMileage) + "/wk" : "—",
        target: "Stable 20–25 mi weeks",
        achieved: (kpis.weeklyMileage ?? 0) >= 20 * 1609.344,
      },
    ],
  }

  const advStage: MilestoneStage = {
    id: "advanced",
    label: "Race-ready",
    description: "7:20/mi half marathon plausible",
    completed: passAdv,
    active: passM2 && !passAdv,
    targets: [
      speedTarget(kpis.easyPaceAt140Mps, E_ADV, "8:45–9:30/mi",  "Easy pace @140 bpm"),
      speedTarget(kpis.thresholdSpeedMps, T_ADV, "6:55–7:10/mi",  "Threshold pace"),
      distTarget(kpis.longRunDistanceM, LR_ADV, "11–14 mi controlled"),
      {
        metric: "Race-specific work",
        current: "—",
        target: "7:20–7:30/mi pace work",
        achieved: false,
      },
    ],
  }

  const goalStage: MilestoneStage = {
    id: "goal",
    label: "Goal",
    description: "Half marathon · 7:20/mi · age 50",
    completed: false,
    active: false,
    targets: [],
  }

  return {
    total,
    milestone,
    milestoneLabel: {
      "pre-m1":   "Building base",
      "m1":       "Milestone 1 reached",
      "m2":       "Milestone 2 reached",
      "advanced": "Advanced",
    }[milestone],
    components: {
      aerobicEngine: {
        score: Math.round(ae), weight: 35, label: "Aerobic engine",
        detail: kpis.easyPaceAt140Mps ? `${fmtPace(kpis.easyPaceAt140Mps)} @140 bpm` : "No easy run data",
      },
      threshold: {
        score: Math.round(th), weight: 25, label: "Threshold",
        detail: kpis.thresholdSpeedMps ? fmtPace(kpis.thresholdSpeedMps) : "No threshold data",
      },
      longRun: {
        score: Math.round(lr), weight: 20, label: "Long run",
        detail: kpis.longRunDistanceM ? fmtDistance(kpis.longRunDistanceM) : "No long run data",
      },
      consistency: {
        score: Math.round(con), weight: 15, label: "Consistency",
        detail: kpis.weeklyMileage ? `${fmtDistance(kpis.weeklyMileage)}/wk` : "No recent runs",
      },
      economy: {
        score: Math.round(eco), weight: 5, label: "Economy",
        detail: cadSpm ? `${cadSpm} spm` : "No cadence data",
      },
    },
    milestoneStages: [currentStage, m1Stage, m2Stage, advStage, goalStage],
  }
}
