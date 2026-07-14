/**
 * Athlete-local date resolver.
 *
 * All date arithmetic inside the scheduler stays in UTC (YYYY-MM-DD strings).
 * This module sits at the app/service boundary and converts the current instant
 * to the athlete's local calendar date.
 *
 * Do NOT use `new Date().toISOString().split("T")[0]` in app pages — that
 * returns the UTC date, which can be a different day for athletes in
 * non-UTC timezones (e.g. America/Los_Angeles at 10pm is still "today" locally
 * even though UTC is already tomorrow).
 */

/**
 * Return the current calendar date (YYYY-MM-DD) in the given IANA timezone.
 * Falls back to UTC if the timezone string is empty.
 */
export function resolveLocalDate(tz: string): string {
  const zone = tz || "UTC"
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === "year")!.value
  const m = parts.find((p) => p.type === "month")!.value
  const d = parts.find((p) => p.type === "day")!.value
  return `${y}-${m}-${d}`
}
