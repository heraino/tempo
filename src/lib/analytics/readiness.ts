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
  nextMilestoneName: string
  nextMilestoneTargets: MilestoneTarget[]
}

// ─── Speed / distance reference points ───────────────────────────────────────
// Easy pace at 140 bpm (m/s): 0% = 11:30/mi, 100% = 8:45/mi
const E_FLOOR = 1609.344 / (11.5 * 60)
const E_M1    = 1609.344 / (10.75 * 60)  // 10:45/mi
const E_M2    = 1609.344 / (10.0 * 60)   // 10:00/mi
const E_ADV   = 1609.344 / (8.75 * 60)   // 8:45/mi

// Threshold pace (m/s): 0% = 9:30/mi, 100% = 7:10/mi
const T_FLOOR = 1609.344 / (9.5 * 60)
const T_M1    = 1609.344 / (8.5 * 60)    // 8:30/mi
const T_M2    = 1609.344 / (8.0 * 60)    // 8:00/mi
const T_ADV   = 1609.344 / (7.167 * 60)  // 7:10/mi

// Long run (m): 0% = 5 miles, 100% = 14 miles
const LR_FLOOR = 5 * 1609.344
const LR_M1    = 8 * 1609.344
const LR_M2    = 10 * 1609.344
const LR_ADV   = 11 * 1609.344

// Weekly mileage (m): 0% = 0, 100% = 25 miles/week
const CON_TARGET = 25 * 1609.344

// Cadence (full spm): 0% = 150, 100% = 172
const CAD_FLOOR = 150
const CAD_ADV   = 172

function clamp(x: number) { return Math.max(0, Math.min(100, x)) }

function lerp(x: number, lo: number, hi: number) {
  return clamp(((x - lo) / (hi - lo)) * 100)
}

export function computeReadiness(kpis: KpiSnapshot): ReadinessResult {
  const ae  = kpis.easyPaceAt140Mps ? lerp(kpis.easyPaceAt140Mps, E_FLOOR, E_ADV) : 0
  const th  = kpis.thresholdSpeedMps ? lerp(kpis.thresholdSpeedMps, T_FLOOR, T_ADV) : 0
  const lr  = kpis.longRunDistanceM ? lerp(kpis.longRunDistanceM, LR_FLOOR, LR_ADV * 1609.344 / 1609.344) : 0
  const con = kpis.weeklyMileage ? clamp((kpis.weeklyMileage / CON_TARGET) * 100) : 0
  const cadSpm = (kpis.cadenceEasy ?? kpis.cadenceTempo)
    ? ((kpis.cadenceEasy ?? kpis.cadenceTempo)! * 2)
    : null
  const eco = cadSpm ? lerp(cadSpm, CAD_FLOOR, CAD_ADV) : 0

  const total = Math.round(ae * 0.35 + th * 0.25 + lr * 0.20 + con * 0.15 + eco * 0.05)

  const passM1 = (kpis.easyPaceAt140Mps ?? 0) >= E_M1 &&
                 (kpis.thresholdSpeedMps ?? 0) >= T_M1 &&
                 (kpis.longRunDistanceM ?? 0) >= LR_M1
  const passM2 = passM1 &&
                 (kpis.easyPaceAt140Mps ?? 0) >= E_M2 &&
                 (kpis.thresholdSpeedMps ?? 0) >= T_M2 &&
                 (kpis.longRunDistanceM ?? 0) >= LR_M2
  const passAdv = passM2 &&
                  (kpis.easyPaceAt140Mps ?? 0) >= E_ADV &&
                  (kpis.thresholdSpeedMps ?? 0) >= T_ADV &&
                  (kpis.longRunDistanceM ?? 0) >= LR_ADV

  const milestone: ReadinessResult["milestone"] =
    passAdv ? "advanced" : passM2 ? "m2" : passM1 ? "m1" : "pre-m1"

  const milestoneLabels = {
    "pre-m1": "Building base",
    "m1": "Milestone 1 reached",
    "m2": "Milestone 2 reached",
    "advanced": "Advanced",
  }

  let nextMilestoneName: string
  let nextMilestoneTargets: MilestoneTarget[]

  if (milestone === "advanced") {
    nextMilestoneName = "Goal: 7:20/mi half marathon by age 50"
    nextMilestoneTargets = []
  } else {
    const targets: [string, number | null, string, number][] = milestone === "m2"
      ? [
          ["Easy pace @140", kpis.easyPaceAt140Mps, "8:45/mi", E_ADV],
          ["Threshold pace", kpis.thresholdSpeedMps, "7:10/mi", T_ADV],
          ["Long run", kpis.longRunDistanceM, "11 mi", LR_ADV],
        ]
      : milestone === "m1"
      ? [
          ["Easy pace @140", kpis.easyPaceAt140Mps, "10:00/mi", E_M2],
          ["Threshold pace", kpis.thresholdSpeedMps, "8:00/mi", T_M2],
          ["Long run", kpis.longRunDistanceM, "10 mi", LR_M2],
        ]
      : [
          ["Easy pace @140", kpis.easyPaceAt140Mps, "10:45/mi", E_M1],
          ["Threshold pace", kpis.thresholdSpeedMps, "8:30/mi", T_M1],
          ["Long run", kpis.longRunDistanceM, "8 mi", LR_M1],
        ]

    nextMilestoneName = milestone === "m2" ? "Advanced readiness" : milestone === "m1" ? "Milestone 2" : "Milestone 1"
    nextMilestoneTargets = targets.map(([metric, value, target, threshold]) => {
      const isSpeed = metric !== "Long run"
      const current = isSpeed
        ? (value ? fmtPace(value) : "—")
        : (value ? fmtDistance(value) : "—")
      return { metric, current, target, achieved: (value ?? 0) >= threshold }
    })
  }

  return {
    total,
    milestone,
    milestoneLabel: milestoneLabels[milestone],
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
    nextMilestoneName,
    nextMilestoneTargets,
  }
}
