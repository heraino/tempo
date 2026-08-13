import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getScheduleRange, getAthleteTimezone } from "@/lib/services/plan.service"
import { getWorkoutsBetween } from "@/lib/services/workout.service"
import { mondayOfWeek, addDays } from "@/lib/plan/scheduler"
import { resolveLocalDateForInstant } from "@/lib/plan/localDate"
import { fmtPace, fmtDistance, fmtDuration, resolveSpeedMps } from "@/lib/fmt"
import { sessionKindMeta } from "@/lib/plan/sessionKinds"
import type { ScheduledSession } from "@/lib/services/plan.service"

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-green-500"
      : status === "skipped"
      ? "bg-gray-300"
      : status === "rescheduled"
      ? "bg-amber-400"
      : "bg-orange-200" // still planned, due or upcoming

  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />
}

export default async function WeekViewPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  const userId = session.user.id

  const { date: dateParam } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) notFound()

  const monday = mondayOfWeek(dateParam)
  const sunday = addDays(monday, 6)
  const prevMonday = addDays(monday, -7)
  const nextMonday = addDays(monday, 7)

  const tz = await getAthleteTimezone(userId)

  // Pad the fetch window by a day on each side so no local-day boundary is
  // ever cut off by the UTC instant range, then bucket by local date below.
  const fromInstant = new Date(`${addDays(monday, -1)}T00:00:00.000Z`)
  const toInstant = new Date(`${addDays(sunday, 1)}T23:59:59.999Z`)

  const [scheduleResult, actualWorkouts] = await Promise.all([
    getScheduleRange(userId, monday, 7),
    getWorkoutsBetween(userId, fromInstant, toInstant),
  ])

  if (!scheduleResult) redirect("/onboarding")

  const actualByDate = new Map<string, typeof actualWorkouts>()
  for (const w of actualWorkouts) {
    const localDate = resolveLocalDateForInstant(new Date(w.startTime), tz)
    const list = actualByDate.get(localDate) ?? []
    list.push(w)
    actualByDate.set(localDate, list)
  }

  const weekRangeLabel = `${new Date(`${monday}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${new Date(`${sunday}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-5">

        <Link
          href={`/plan/${dateParam}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Day view
        </Link>

        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">This week</h1>
            <p className="text-sm text-gray-400 mt-0.5">{weekRangeLabel}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href={`/plan/week/${prevMonday}`}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              aria-label="Previous week"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <Link
              href={`/plan/week/${nextMonday}`}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              aria-label="Next week"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Adjust this week */}
        <Link
          href={`/plan/week/${monday}/adjust`}
          className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 hover:border-orange-300 transition-colors group"
        >
          <div>
            <p className="text-sm font-semibold text-gray-800 group-hover:text-orange-600">
              Adjust this week
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Traveling, injured, or fatigued? Tell us which days and we&apos;ll rebalance the rest.
            </p>
          </div>
          <svg className="text-gray-300 group-hover:text-orange-400 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>

        {/* Week grid */}
        <div className="space-y-3">
          {scheduleResult.scheduledDays.map((day) => {
            const actual = actualByDate.get(day.date) ?? []
            const dateObj = new Date(`${day.date}T00:00:00Z`)
            const isToday = day.date === new Date().toISOString().slice(0, 10) // rough; header is a visual aid only

            return (
              <section
                key={day.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 ${
                  isToday ? "border-orange-200" : "border-gray-100"
                }`}
              >
                <div className="flex items-baseline gap-2 mb-3">
                  <p className="text-sm font-bold text-gray-900">{day.weekday}</p>
                  <p className="text-xs text-gray-400">
                    {dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Planned column */}
                  <div className="space-y-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-300">
                      Planned
                    </p>
                    {day.isRestDay || day.sessions.length === 0 ? (
                      <p className="text-xs text-gray-300 italic">Rest</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {day.sessions.map((s: ScheduledSession) => {
                          const meta = sessionKindMeta(s.sessionKind)
                          return (
                            <li key={s.id} className="flex items-start gap-1.5">
                              <div className="mt-1.5">
                                <StatusDot status={s.status} />
                              </div>
                              <div className="min-w-0">
                                <span
                                  className={`inline-block text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${meta.chipClass}`}
                                >
                                  {meta.label}
                                </span>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Actual column */}
                  <div className="space-y-2 border-l border-gray-50 pl-3">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-300">
                      Actual
                    </p>
                    {actual.length === 0 ? (
                      <p className="text-xs text-gray-300">—</p>
                    ) : (
                      <ul className="space-y-2">
                        {actual.map((w) => {
                          const speedMps = resolveSpeedMps(w.avgSpeedMps, w.totalDistanceM, w.totalTimerSecs)
                          return (
                            <li key={w.id}>
                              <Link href={`/workout/${w.id}`} className="block hover:opacity-70 transition-opacity">
                                <p className="text-xs font-semibold text-gray-800">
                                  {fmtDistance(w.totalDistanceM)}
                                </p>
                                <p className="text-[10px] text-gray-400">
                                  {fmtDuration(w.totalTimerSecs)} · {fmtPace(speedMps)}
                                </p>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )
          })}
        </div>

      </div>
    </main>
  )
}
