// FIT file parser — runs server-side only.
// fit-file-parser is CommonJS so we dynamic-import it.

import { createHash } from "crypto"

export const PARSER_VERSION = "fit-file-parser@3.0.2/v1"

// ─── Raw FIT data shapes ──────────────────────────────────────────────────────

interface FitRecord {
  timestamp: string
  heart_rate?: number
  speed?: number
  distance?: number
  [key: string]: unknown
}

interface FitEvent {
  event: string
  event_type: string
  timestamp: string
}

interface FitLap {
  records?: FitRecord[]
  [key: string]: unknown
}

interface FitSession {
  laps?: FitLap[]
  start_time: string
  [key: string]: unknown
}

interface FitData {
  activity?: {
    sessions?: FitSession[]
    events?: FitEvent[]
    device_infos?: unknown[]
  }
}

// ─── Output interface ─────────────────────────────────────────────────────────

export interface ParsedWorkout {
  sha256: string
  parserVersion: string

  // Timing
  startTime: Date
  totalElapsedSecs: number | null
  totalTimerSecs: number | null

  // Sport
  sport: string | null
  subSport: string | null

  // Distance
  totalDistanceM: number | null

  // Heart rate
  avgHr: number | null
  maxHr: number | null

  // Speed
  avgSpeedMps: number | null
  maxSpeedMps: number | null

  // Cadence
  avgCadence: number | null
  maxCadence: number | null

  // Elevation
  totalAscentM: number | null
  totalDescentM: number | null
  avgAltitudeM: number | null
  maxAltitudeM: number | null
  minAltitudeM: number | null

  // Calories
  totalCalories: number | null

  // Temperature
  avgTemperatureC: number | null
  maxTemperatureC: number | null

  // Running dynamics
  avgVerticalOscillationMm: number | null
  avgStanceTimeMs: number | null
  avgStanceTimePct: number | null
  avgVerticalRatio: number | null
  avgStrideLengthM: number | null

  // Training load
  trainingLoad: number | null
  aerobicTrainingEffect: number | null
  anaerobicTrainingEffect: number | null
  aerobicTeMessage: string | null
  anaerobicTeMessage: string | null

  // Physiology
  avgRespirationRate: number | null
  maxRespirationRate: number | null
  vo2Max: number | null

  // GPS bounds
  necLat: number | null
  necLong: number | null
  swcLat: number | null
  swcLong: number | null

  // Derived: HR analysis
  firstHalfAvgHr: number | null
  secondHalfAvgHr: number | null
  hrDriftBpm: number | null

  // Derived: run-walk splits
  runOnlyDistanceM: number | null
  runOnlyDurationSecs: number | null
  runOnlyAvgSpeedMps: number | null
  runOnlyAvgHr: number | null
  walkDurationSecs: number | null

  // JSON payloads (stored as-is)
  laps: unknown[]
  records: unknown[]
  events: unknown[]
  deviceInfo: unknown[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
}

// Accept unknown; return null for non-numeric values
const n = (v: unknown): number | null =>
  v != null && !Number.isNaN(Number(v)) ? Number(v) : null

const s = (v: unknown): string | null => (v != null ? String(v) : null)

// ─── Derived metric calculators ───────────────────────────────────────────────

function deriveHrMetrics(records: FitRecord[]) {
  const hrs = records
    .map((r) => r.heart_rate)
    .filter((v): v is number => typeof v === "number")
  if (hrs.length < 2) return { firstHalfAvgHr: null, secondHalfAvgHr: null, hrDriftBpm: null }

  const mid = Math.floor(hrs.length / 2)
  const firstHalfAvgHr = avg(hrs.slice(0, mid))!
  const secondHalfAvgHr = avg(hrs.slice(mid))!
  const hrDriftBpm = parseFloat((secondHalfAvgHr - firstHalfAvgHr).toFixed(1))

  return { firstHalfAvgHr, secondHalfAvgHr, hrDriftBpm }
}

function deriveRunWalk(records: FitRecord[], events: FitEvent[]) {
  const timerEvents = (events ?? []).filter(
    (e) => e.event === "timer" && (e.event_type === "start" || e.event_type === "stop")
  )

  if (timerEvents.length === 0) {
    return {
      runOnlyDistanceM: null,
      runOnlyDurationSecs: null,
      runOnlyAvgSpeedMps: null,
      runOnlyAvgHr: null,
      walkDurationSecs: null,
    }
  }

  let runSecs = 0
  let walkSecs = 0
  const runRecords: FitRecord[] = []
  let isRunning = true
  let lastTimestamp: Date | null = null

  const sortedEvents = [...timerEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  for (const evt of sortedEvents) {
    const evtTime = new Date(evt.timestamp)
    if (lastTimestamp) {
      const diffSecs = (evtTime.getTime() - lastTimestamp.getTime()) / 1000
      if (isRunning) runSecs += diffSecs
      else walkSecs += diffSecs
    }
    lastTimestamp = evtTime
    isRunning = evt.event_type === "start"
  }

  const runIntervals: Array<{ start: Date; end: Date }> = []
  let intervalStart: Date | null = null
  let inRun = false

  for (const evt of sortedEvents) {
    if (evt.event_type === "start") {
      intervalStart = new Date(evt.timestamp)
      inRun = true
    } else if (evt.event_type === "stop" && inRun && intervalStart) {
      runIntervals.push({ start: intervalStart, end: new Date(evt.timestamp) })
      inRun = false
    }
  }

  for (const rec of records) {
    const t = new Date(rec.timestamp).getTime()
    const duringRun = runIntervals.some(
      (i) => t >= i.start.getTime() && t <= i.end.getTime()
    )
    if (duringRun) runRecords.push(rec)
  }

  const runOnlyDistanceM =
    runRecords.length > 0
      ? (runRecords[runRecords.length - 1].distance ?? 0) - (runRecords[0].distance ?? 0)
      : null
  const runOnlyAvgSpeedMps = avg(
    runRecords.map((r) => r.speed).filter((v): v is number => typeof v === "number")
  )
  const runOnlyAvgHr = avg(
    runRecords.map((r) => r.heart_rate).filter((v): v is number => typeof v === "number")
  )

  return {
    runOnlyDistanceM,
    runOnlyDurationSecs: runSecs || null,
    runOnlyAvgSpeedMps,
    runOnlyAvgHr,
    walkDurationSecs: walkSecs || null,
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parseFitBuffer(buffer: Buffer): Promise<ParsedWorkout> {
  const sha256 = createHash("sha256").update(buffer).digest("hex")

  const FitParser = (await import("fit-file-parser")).default

  const parsed = await new Promise<FitData>((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: "m/s",
      lengthUnit: "m",
      temperatureUnit: "celsius",
      elapsedRecordField: true,
      mode: "cascade",
    })
    parser.parse(buffer, (err, data) => {
      if (err) reject(new Error(err))
      else resolve(data as FitData)
    })
  })

  const session = parsed?.activity?.sessions?.[0]
  if (!session) throw new Error("No session found in FIT file")

  const allRecords: FitRecord[] = (session.laps ?? []).flatMap(
    (lap) => (lap.records ?? []) as FitRecord[]
  )
  const allEvents: FitEvent[] = (parsed?.activity?.events ?? []) as FitEvent[]
  const deviceInfo: unknown[] = parsed?.activity?.device_infos ?? []

  const hrMetrics = deriveHrMetrics(allRecords)
  const runWalk = deriveRunWalk(allRecords, allEvents)

  const lapsWithoutRecords = (session.laps ?? []).map((lap) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { records: _records, ...rest } = lap
    return rest
  })

  return {
    sha256,
    parserVersion: PARSER_VERSION,

    startTime: new Date(session.start_time),
    totalElapsedSecs: n(session.total_elapsed_time),
    totalTimerSecs: n(session.total_timer_time),

    sport: s(session.sport),
    subSport: s(session.sub_sport),

    totalDistanceM: n(session.total_distance),

    avgHr: n(session.avg_heart_rate),
    maxHr: n(session.max_heart_rate),

    avgSpeedMps:
      n(session.avg_speed) ??
      n(session.enhanced_avg_speed) ??
      (n(session.total_distance) != null &&
       n(session.total_timer_time) != null &&
       n(session.total_timer_time)! > 0
        ? n(session.total_distance)! / n(session.total_timer_time)!
        : null),
    maxSpeedMps: n(session.max_speed) ?? n(session.enhanced_max_speed),

    avgCadence: n(session.avg_cadence),
    maxCadence: n(session.max_cadence),

    totalAscentM: n(session.total_ascent),
    totalDescentM: n(session.total_descent),
    avgAltitudeM: n(session.avg_altitude),
    maxAltitudeM: n(session.max_altitude),
    minAltitudeM: n(session.min_altitude),

    totalCalories: n(session.total_calories),

    avgTemperatureC: n(session.avg_temperature),
    maxTemperatureC: n(session.max_temperature),

    avgVerticalOscillationMm: n(session.avg_vertical_oscillation),
    avgStanceTimeMs: n(session.avg_stance_time),
    avgStanceTimePct: n(session.avg_stance_time_percent),
    avgVerticalRatio: n(session.avg_vertical_ratio),
    avgStrideLengthM:
      n(session.avg_step_length) != null
        ? n(session.avg_step_length)! / 1000  // mm → m
        : null,

    // training_load_peak is a scaled uint32 in the FIT SDK (scale=65536)
    trainingLoad: n(session.training_load_peak) != null
      ? n(session.training_load_peak)! / 65536
      : null,
    aerobicTrainingEffect: n(session.total_training_effect),
    anaerobicTrainingEffect: n(session.total_anaerobic_training_effect),
    aerobicTeMessage: s(session.aerobic_training_effect_message),
    anaerobicTeMessage: s(session.anaerobic_training_effect_message),

    avgRespirationRate: n(session.avg_respiration_rate),
    maxRespirationRate: n(session.max_respiration_rate),
    // VO2max: use vo2_max_data only — enhanced_avg_respiration_rate is NOT VO2max
    vo2Max: n(session.vo2_max_data),

    necLat: n(session.nec_lat),
    necLong: n(session.nec_long),
    swcLat: n(session.swc_lat),
    swcLong: n(session.swc_long),

    ...hrMetrics,
    ...runWalk,

    laps: lapsWithoutRecords,
    records: allRecords,
    events: allEvents,
    deviceInfo,
  }
}
