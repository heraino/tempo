// Shared display formatters used across workout list and detail views.

// Returns avgSpeedMps when available, otherwise derives it from distance ÷ time.
// Covers workouts uploaded before the parser fix (treadmill/indoor activities
// where avg_speed was null but distance and time were recorded).
export function resolveSpeedMps(
  avgSpeedMps: number | null | undefined,
  totalDistanceM: number | null | undefined,
  totalTimerSecs: number | null | undefined,
): number | null {
  if (avgSpeedMps != null && avgSpeedMps > 0) return avgSpeedMps
  if (totalDistanceM && totalTimerSecs && totalTimerSecs > 0) {
    return totalDistanceM / totalTimerSecs
  }
  return null
}

export function fmtPace(avgSpeedMps: number | null | undefined): string {
  if (!avgSpeedMps || avgSpeedMps <= 0) return "—"
  const secsPerMile = 1609.344 / avgSpeedMps
  const mins = Math.floor(secsPerMile / 60)
  const secs = Math.round(secsPerMile % 60)
  return `${mins}:${secs.toString().padStart(2, "0")} /mi`
}

export function fmtDistance(meters: number | null | undefined): string {
  if (meters == null) return "—"
  return `${(meters / 1609.344).toFixed(2)} mi`
}

export function fmtDuration(secs: number | null | undefined): string {
  if (secs == null) return "—"
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.round(secs % 60)
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

export function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  })
}

export function fmtTemp(c: number | null | undefined): string {
  if (c == null) return "—"
  return `${Math.round(c * 9 / 5 + 32)}°F`
}

export function fmtTempDisplay(c: number | null | undefined, units: "imperial" | "metric" = "imperial"): string {
  if (c == null) return "—"
  if (units === "metric") return `${Math.round(c)}°C`
  return `${Math.round(c * 9 / 5 + 32)}°F`
}

export function fmtNum(
  v: number | null | undefined,
  decimals = 1,
  unit = "",
): string {
  if (v == null) return "—"
  return `${v.toFixed(decimals)}${unit ? " " + unit : ""}`
}
