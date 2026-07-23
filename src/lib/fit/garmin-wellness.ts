/**
 * Garmin Connect wellness JSON parser.
 *
 * Garmin's data export format has changed many times; this parser tries multiple
 * key name variants for each metric and merges data from multiple files by date.
 *
 * Known file name patterns in the export:
 *   DI_CONNECT/DI-Connect-Journal/garmin_wellness_*.json
 *   DI_CONNECT/DI-Connect-Fitness-Extras/summarizedActivities*.json
 *   DI_CONNECT/DI-Connect-User/... (user profile — not wellness)
 *
 * Each JSON file may be a single-day object, an array of days, or an object
 * whose root value is an array.
 */

export interface WellnessDay {
  calendarDate: string        // "YYYY-MM-DD"
  totalSteps?: number
  totalDistanceMeters?: number
  activeCalories?: number
  totalCalories?: number
  avgStressLevel?: number
  maxStressLevel?: number
  bodyBatteryHigh?: number
  bodyBatteryLow?: number
  bodyBatteryLatest?: number
  restingHr?: number
  avgWakingHr?: number
  minHr?: number
  maxHr?: number
  hrvLastNightAvg?: number
  hrv5MinHigh?: number
  hrvWeeklyAvg?: number
  hrvStatus?: string
  sleepDurationSecs?: number
  sleepDeepSecs?: number
  sleepLightSecs?: number
  sleepRemSecs?: number
  sleepScore?: number
  sleepWindowStart?: string   // ISO string
  sleepWindowEnd?: string     // ISO string
  avgSpo2?: number
  avgRespiration?: number
}

// Accepts: a JSON file's parsed content (any shape)
// Returns: array of WellnessDay records found in the file
export function parseWellnessJson(raw: unknown): WellnessDay[] {
  if (!raw || typeof raw !== "object") return []

  // Normalize to an array of candidate day objects
  const candidates = toDayArray(raw)
  const results: WellnessDay[] = []

  for (const entry of candidates) {
    if (!entry || typeof entry !== "object") continue
    const day = parseDay(entry as Record<string, unknown>)
    if (day) results.push(day)
  }

  return results
}

// Merge multiple WellnessDay records for the same date, filling gaps from each source.
// Later entries overwrite earlier ones when both have a value.
export function mergeWellnessDays(days: WellnessDay[]): Map<string, WellnessDay> {
  const byDate = new Map<string, WellnessDay>()
  for (const day of days) {
    const existing = byDate.get(day.calendarDate)
    if (!existing) {
      byDate.set(day.calendarDate, { ...day })
    } else {
      // Fill in any fields the existing record is missing
      for (const key of Object.keys(day) as (keyof WellnessDay)[]) {
        if (key === "calendarDate") continue
        if (existing[key] == null && day[key] != null) {
          (existing as unknown as Record<string, unknown>)[key] = day[key]
        }
      }
    }
  }
  return byDate
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDayArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw

  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>

    // Try known root array keys (Garmin uses many different ones across versions)
    const rootKeys = [
      "dailySummaries",
      "dailyHealthSummaries",
      "userDailySummary",
      "healthSummaries",
      "wellnessDailySummaries",
      "wellnessData",
      "sleepData",
      "sleepLogs",
      "sleep",
      "hrvSummaries",
      "hrv",
      "activities",
    ]

    for (const k of rootKeys) {
      if (Array.isArray(obj[k])) return obj[k] as unknown[]
    }

    // If the object has a calendarDate directly, treat it as a single day
    if (obj.calendarDate || obj.summaryDate || obj.date) return [raw]

    // Try any array-valued top-level key
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) && v.length > 0) {
        const first = v[0]
        if (first && typeof first === "object" && hasDateField(first as Record<string, unknown>)) {
          return v as unknown[]
        }
      }
    }
  }

  return []
}

function hasDateField(obj: Record<string, unknown>): boolean {
  return !!(obj.calendarDate || obj.summaryDate || obj.date || obj.startGMT || obj.startLocal)
}

function parseDay(e: Record<string, unknown>): WellnessDay | null {
  const dateStr = dateOf(e)
  if (!dateStr) return null

  return {
    calendarDate: dateStr,
    totalSteps: num(e, ["totalSteps", "steps", "stepCount"]),
    totalDistanceMeters: num(e, ["totalDistanceMeters", "distanceMeters", "totalDistance"]),
    activeCalories: num(e, ["activeCalories", "activeKilocalories", "activeKcal"]),
    totalCalories: num(e, [
      "totalCalories", "totalKilocalories", "burnedCalories",
      "bmrCalories", // some versions list BMR, not total
    ]),
    avgStressLevel: num(e, ["averageStressLevel", "avgStressLevel", "averageStress", "stressLevel"]),
    maxStressLevel: num(e, ["maxStressLevel", "peakStressLevel", "highestStress"]),
    bodyBatteryHigh: num(e, ["bodyBatteryHighestValue", "bodyBatteryMax", "highBodyBattery"]),
    bodyBatteryLow: num(e, ["bodyBatteryLowestValue", "bodyBatteryMin", "lowBodyBattery"]),
    bodyBatteryLatest: num(e, ["bodyBatteryMostRecentValue", "bodyBattery", "bodyBatteryEnd"]),
    restingHr: num(e, ["restingHeartRate", "restingHR", "rhr"]),
    avgWakingHr: num(e, ["avgWakingHeartRate", "averageHeartRate", "avgWakingHR"]),
    minHr: num(e, ["minHeartRate", "minHR", "lowestHeartRate"]),
    maxHr: num(e, ["maxHeartRate", "maxHR", "highestHeartRate"]),
    hrvLastNightAvg: num(e, ["lastNight", "lastNightAvg", "lastNightAverage", "nightlyAvg"]),
    hrv5MinHigh: num(e, ["lastNight5MinHigh", "hrv5MinHigh", "fiveMinHigh", "lastNightHigh"]),
    hrvWeeklyAvg: num(e, ["weeklyAvg", "weeklyAverage", "hrvWeeklyAverage", "sevenDayAvg"]),
    hrvStatus: str(e, ["status", "hrvStatus", "feedbackPhrase"])?.replace(/^HRV_/i, "") ?? undefined,
    sleepDurationSecs: num(e, [
      "sleepTimeSeconds", "totalSleepSeconds", "sleepSeconds",
      "sleepingSeconds", "durationInSeconds",
    ]),
    sleepDeepSecs: num(e, ["deepSleepSeconds", "deepSleepDurationInSeconds"]),
    sleepLightSecs: num(e, ["lightSleepSeconds", "lightSleepDurationInSeconds"]),
    sleepRemSecs: num(e, ["remSleepSeconds", "remSleepDurationInSeconds"]),
    sleepScore: num(e, ["overallSleepScore", "sleepScore", "sleepQualityScore",
      "sleepScoreTotal", "averageSleepScore"]),
    sleepWindowStart: isoDate(e, ["sleepWindowConfirmedStart", "sleepWindowStart", "startGMT", "startLocal"]),
    sleepWindowEnd: isoDate(e, ["sleepWindowConfirmedEnd", "sleepWindowEnd", "endGMT", "endLocal"]),
    avgSpo2: num(e, ["averageSpO2Value", "avgSpo2", "avgSpO2", "spo2Average"]),
    avgRespiration: num(e, [
      "averageRespirationValue", "avgRespiration", "breathingAverage",
      "avgBreathingRate",
    ]),
  }
}

function dateOf(e: Record<string, unknown>): string | null {
  for (const k of ["calendarDate", "summaryDate", "date", "localDate"]) {
    const v = e[k]
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      return v.slice(0, 10) // ensure YYYY-MM-DD only
    }
  }
  // Garmin sometimes uses "startLocal" like "2024-01-15 22:30:00"
  for (const k of ["startLocal", "startGMT"]) {
    const v = e[k]
    if (typeof v === "string" && v.length >= 10) {
      const d = v.slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
    }
  }
  return null
}

function num(e: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = e[k]
    if (typeof v === "number" && isFinite(v)) return v
    if (typeof v === "string") {
      const n = parseFloat(v)
      if (isFinite(n)) return n
    }
  }
  // Try nested: some Garmin versions have { baseline: { markerValue: 61 } }
  return undefined
}

function str(e: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = e[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function isoDate(e: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = e[k]
    if (typeof v === "string" && v.length >= 10) return v
  }
  return undefined
}
