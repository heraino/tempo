// Calculates which week of the A/B/C/D rotation a given date falls in,
// based on the anchor date (the Monday that started a known rotation week).

const WEEKS = ["A", "B", "C", "D"] as const
export type RotationWeek = (typeof WEEKS)[number]

export function getRotationWeek(
  targetDate: Date,
  anchorDate: Date,        // Monday of the cycle that started on startWeek
  anchorWeek: RotationWeek // which rotation week anchorDate was
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

export function getTodayInfo(anchorDate: Date, anchorWeek: RotationWeek) {
  const today = new Date()
  const week = getRotationWeek(today, anchorDate, anchorWeek)
  const dayName = DAY_NAMES[today.getDay()]
  return { week, dayName, today }
}

export function getDateInfo(date: Date, anchorDate: Date, anchorWeek: RotationWeek) {
  const week = getRotationWeek(date, anchorDate, anchorWeek)
  const dayName = DAY_NAMES[date.getDay()]
  return { week, dayName }
}

// Extracts the section of the plan markdown for a given week and day.
export function extractWorkout(
  markdown: string,
  week: RotationWeek,
  dayName: string
): string {
  // Match the whole week section: "# Week A" up to the next "# Week" or end
  const weekRegex = new RegExp(
    `# Week ${week}[\\s\\S]*?(?=\\n# Week [ABCD]|$)`,
    "i"
  )
  const weekSection = markdown.match(weekRegex)?.[0] ?? ""
  if (!weekSection) return ""

  // Match the day subsection: "### Monday" up to the next "###" or "#" or end
  const dayRegex = new RegExp(
    `### ${dayName}[\\s\\S]*?(?=\\n###|\\n#|$)`,
    "i"
  )
  return weekSection.match(dayRegex)?.[0]?.trim() ?? ""
}
