/**
 * @legacy
 * Legacy adapter: A/B/C/D rotation and markdown extraction.
 *
 * This module is a compatibility shim used by the current dashboard and plan
 * pages. The canonical scheduling engine (Phase 3) reads
 * `training_plan_versions.plan_json` directly and does not call any function
 * here. Once all callers are migrated, this file is deleted.
 *
 * Do NOT add canonical scheduling logic here.
 * Do NOT expand this module's role.
 */

const WEEKS = ["A", "B", "C", "D"] as const
export type RotationWeek = (typeof WEEKS)[number]

/**
 * @legacy
 * Returns the rotation week (A/B/C/D) for a given target date, relative to an
 * anchor date and anchor week.
 */
export function getRotationWeek(
  targetDate: Date,
  anchorDate: Date,
  anchorWeek: RotationWeek
): RotationWeek {
  const msPerDay = 24 * 60 * 60 * 1000
  const daysDiff = Math.floor(
    (targetDate.getTime() - anchorDate.getTime()) / msPerDay
  )
  const weeksDiff = Math.floor(daysDiff / 7)
  const anchorIndex = WEEKS.indexOf(anchorWeek)
  const index = ((anchorIndex + weeksDiff) % 4 + 4) % 4
  return WEEKS[index]
}

export const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const

// Extracts the local calendar date for a given IANA timezone, avoiding UTC
// server-time drift for athletes in non-UTC timezones.
function getLocalDate(tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === "year")!.value
  const m = parts.find((p) => p.type === "month")!.value
  const d = parts.find((p) => p.type === "day")!.value
  return new Date(`${y}-${m}-${d}T00:00:00`)
}

/**
 * @legacy
 * Returns today's rotation week and day name. Pass `tz` (IANA timezone, e.g.
 * "America/New_York") to get the athlete's local date instead of UTC server
 * time.
 */
export function getTodayInfo(anchorDate: Date, anchorWeek: RotationWeek, tz?: string) {
  const today = tz ? getLocalDate(tz) : new Date()
  const week = getRotationWeek(today, anchorDate, anchorWeek)
  const dayName = DAY_NAMES[today.getDay()]
  return { week, dayName, today }
}

/**
 * @legacy
 */
export function getDateInfo(date: Date, anchorDate: Date, anchorWeek: RotationWeek) {
  const week = getRotationWeek(date, anchorDate, anchorWeek)
  const dayName = DAY_NAMES[date.getDay()]
  return { week, dayName }
}

/**
 * @legacy
 * Extracts the section of the plan markdown for a given week and day.
 */
export function extractWorkout(
  markdown: string,
  week: RotationWeek,
  dayName: string
): string {
  const weekRegex = new RegExp(
    `# Week ${week}[\\s\\S]*?(?=\\n# Week [ABCD]|$)`,
    "i"
  )
  const weekSection = markdown.match(weekRegex)?.[0] ?? ""
  if (!weekSection) return ""

  const dayRegex = new RegExp(
    `### ${dayName}[\\s\\S]*?(?=\\n###|\\n#|$)`,
    "i"
  )
  return weekSection.match(dayRegex)?.[0]?.trim() ?? ""
}
