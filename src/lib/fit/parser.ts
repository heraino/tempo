// FIT file parser — runs server-side only.
// fit-file-parser is CommonJS so we dynamic-import it.

export interface ParsedWorkout {
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

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
}

function deriveHrMetrics(records: any[]) {
  const hrs = records.map((r: any) => r.heart_rate).filter((v: any) => typeof v === "number")
  if (hrs.length < 2) return { firstHalfAvgHr: null, secondHalfAvgHr: null, hrDriftBpm: null }

  const mid = Math.floor(hrs.length / 2)
  const firstHalfAvgHr = avg(hrs.slice(0, mid))!
  const secondHalfAvgHr = avg(hrs.slice(mid))!
  const hrDriftBpm = parseFloat((secondHalfAvgHr - firstHalfAvgHr).toFixed(1))

  return { firstHalfAvgHr, secondHalfAvgHr, hrDriftBpm }
}

function deriveRunWalk(records: any[], events: any[]) {
  // Garmin marks auto-pause (walk breaks) with timer events.
  // event_type "stop" = pause started (walk), "start" = running resumed.
  const timerEvents = (events ?? []).filter(
    (e: any) => e.event === "timer" && (e.event_type === "start" || e.event_type === "stop")
  )

  if (timerEvents.length === 0) {
    // No detected walk breaks — treat full session as run-only
    return {
      runOnlyDistanceM: null,
      runOnlyDurationSecs: null,
      runOnlyAvgSpeedMps: null,
      runOnlyAvgHr: null,
      walkDurationSecs: null,
    }
  }

  // Build run/walk intervals from events
  let runSecs = 0
  let walkSecs = 0
  const runRecords: any[] = []
  let isRunning = true
  let lastTimestamp: Date | null = null

  // Create a sorted list of events with their timestamps
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

  // Classify each record as run or walk based on whether its timestamp
  // falls during a run or walk interval
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

  const runOnlyDistanceM = runRecords.length > 0
    ? runRecords[runRecords.length - 1].distance - (runRecords[0].distance ?? 0)
    : null
  const runOnlyAvgSpeedMps = avg(
    runRecords.map((r: any) => r.speed).filter((v: any) => typeof v === "number")
  )
  const runOnlyAvgHr = avg(
    runRecords.map((r: any) => r.heart_rate).filter((v: any) => typeof v === "number")
  )

  return {
    runOnlyDistanceM,
    runOnlyDurationSecs: runSecs || null,
    runOnlyAvgSpeedMps,
    runOnlyAvgHr,
    walkDurationSecs: walkSecs || null,
  }
}

export async function parseFitBuffer(buffer: Buffer, fileName: string): Promise<ParsedWorkout> {
  // Dynamic import handles the CommonJS module
  const FitParser = (await import("fit-file-parser" as any)).default

  const parsed = await new Promise<any>((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: "m/s",
      lengthUnit: "m",
      temperatureUnit: "celsius",
      elapsedRecordField: true,
      mode: "cascade",
    })
    parser.parse(buffer, (err: any, data: any) => {
      if (err) reject(new Error(err))
      else resolve(data)
    })
  })

  const session = parsed?.activity?.sessions?.[0]
  if (!session) throw new Error("No session found in FIT file")

  // Flatten records from all laps for derived metric calculation
  const allRecords: any[] = (session.laps ?? []).flatMap((lap: any) => lap.records ?? [])
  const allEvents: any[] = parsed?.activity?.events ?? []
  const deviceInfo: any[] = parsed?.activity?.device_infos ?? []

  const hrMetrics = deriveHrMetrics(allRecords)
  const runWalk = deriveRunWalk(allRecords, allEvents)

  // Strip records out of laps for the laps JSON payload, then store records
  // separately so each JSON column stays focused.
  const lapsWithoutRecords = (session.laps ?? []).map((lap: any) => {
    const { records: _, ...rest } = lap
    return rest
  })

  const n = (v: any): number | null => (v != null && !Number.isNaN(v) ? Number(v) : null)
  const s = (v: any): string | null => (v != null ? String(v) : null)

  return {
    startTime: new Date(session.start_time),
    totalElapsedSecs: n(session.total_elapsed_time),
    totalTimerSecs: n(session.total_timer_time),

    sport: s(session.sport),
    subSport: s(session.sub_sport),

    totalDistanceM: n(session.total_distance),

    avgHr: n(session.avg_heart_rate),
    maxHr: n(session.max_heart_rate),

    avgSpeedMps: n(session.avg_speed),
    maxSpeedMps: n(session.max_speed),

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
    avgStrideLengthM: n(session.avg_step_length) != null
      ? (n(session.avg_step_length)! / 1000)  // mm → m
      : null,

    trainingLoad: n(session.training_load_peak),
    aerobicTrainingEffect: n(session.total_training_effect),
    anaerobicTrainingEffect: n(session.total_anaerobic_training_effect),
    aerobicTeMessage: s(session.aerobic_training_effect_message),
    anaerobicTeMessage: s(session.anaerobic_training_effect_message),

    avgRespirationRate: n(session.avg_respiration_rate),
    maxRespirationRate: n(session.max_respiration_rate),
    vo2Max: n(session.enhanced_avg_respiration_rate) ?? n(session.vo2_max_data),

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
