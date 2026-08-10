/**
 * Plan adherence analytics — pure and deterministic.
 *
 * Adherence is evidence, not interpretation: this module counts what happened
 * against what was planned. The coaching layer reads these numbers; it never
 * recomputes them.
 */

export interface AdherenceSessionRecord {
  scheduledDate: string // YYYY-MM-DD
  sessionKind: string
  status: string // planned | completed | skipped | rescheduled
  isRunSession: boolean
}

export interface KindAdherence {
  planned: number
  completed: number
  skipped: number
  /** completed / (completed + skipped); null when nothing has been decided yet. */
  completionRate: number | null
}

export interface AdherenceSummary {
  totalScheduled: number
  completed: number
  skipped: number
  rescheduled: number
  /** Still "planned" and in the past — neither done nor explicitly skipped. */
  missed: number
  /** Still "planned" and in the future. */
  upcoming: number
  /**
   * completed / (completed + skipped + missed) over dates that have passed.
   * Null when no session has come due yet.
   */
  completionRate: number | null
  byKind: Record<string, KindAdherence>
  /** Longest run of consecutive due sessions that were skipped or missed. */
  longestMissStreak: number
  /** Distinct dates in the window on which at least one session came due. */
  daysWithScheduledWork: number
}

const DECIDED_AS_MISS = new Set(["skipped"])

/**
 * Summarize adherence for sessions in a window.
 *
 * `asOfDate` splits due from upcoming: a session still marked "planned" on a
 * date at or before asOfDate counts as missed, not upcoming. Rescheduled
 * sessions are excluded from the rate — the work moved rather than vanished,
 * and its replacement is counted on the target date.
 */
export function computeAdherence(
  sessions: AdherenceSessionRecord[],
  asOfDate: string,
): AdherenceSummary {
  const byKind: Record<string, KindAdherence> = {}
  const dueDates = new Set<string>()

  let completed = 0
  let skipped = 0
  let rescheduled = 0
  let missed = 0
  let upcoming = 0

  function kindEntry(kind: string): KindAdherence {
    if (!byKind[kind]) {
      byKind[kind] = { planned: 0, completed: 0, skipped: 0, completionRate: null }
    }
    return byKind[kind]
  }

  for (const s of sessions) {
    const entry = kindEntry(s.sessionKind)
    entry.planned++

    const isDue = s.scheduledDate <= asOfDate

    if (s.status === "completed") {
      completed++
      entry.completed++
      dueDates.add(s.scheduledDate)
    } else if (DECIDED_AS_MISS.has(s.status)) {
      skipped++
      entry.skipped++
      dueDates.add(s.scheduledDate)
    } else if (s.status === "rescheduled") {
      rescheduled++
    } else if (isDue) {
      missed++
      entry.skipped++
      dueDates.add(s.scheduledDate)
    } else {
      upcoming++
    }
  }

  for (const entry of Object.values(byKind)) {
    const decided = entry.completed + entry.skipped
    entry.completionRate = decided > 0 ? entry.completed / decided : null
  }

  const decidedTotal = completed + skipped + missed
  const completionRate = decidedTotal > 0 ? completed / decidedTotal : null

  return {
    totalScheduled: sessions.length,
    completed,
    skipped,
    rescheduled,
    missed,
    upcoming,
    completionRate,
    byKind,
    longestMissStreak: computeLongestMissStreak(sessions, asOfDate),
    daysWithScheduledWork: dueDates.size,
  }
}

/**
 * Longest streak of consecutive due sessions (in date order) that were not
 * completed. Rescheduled sessions are transparent — they neither break nor
 * extend a streak.
 */
export function computeLongestMissStreak(
  sessions: AdherenceSessionRecord[],
  asOfDate: string,
): number {
  const due = sessions
    .filter((s) => s.scheduledDate <= asOfDate && s.status !== "rescheduled")
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : 0))

  let longest = 0
  let current = 0
  for (const s of due) {
    if (s.status === "completed") {
      current = 0
    } else {
      current++
      if (current > longest) longest = current
    }
  }
  return longest
}

/** Round a 0–1 rate to a whole percentage, or null when undefined. */
export function ratePct(rate: number | null): number | null {
  return rate == null ? null : Math.round(rate * 100)
}
