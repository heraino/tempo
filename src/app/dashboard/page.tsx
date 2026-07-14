import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { getScheduleRange, getAthleteTimezone } from "@/lib/services/plan.service"
import { resolveLocalDate } from "@/lib/plan/localDate"
import { RecentWorkoutsCard } from "@/components/RecentWorkoutsCard"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const userId = session.user.id

  const tz = await getAthleteTimezone(userId)
  const todayStr = resolveLocalDate(tz)

  const [scheduleResult, recentLogs] = await Promise.all([
    getScheduleRange(userId, todayStr, 8),
    db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.userId, userId))
      .orderBy(desc(workoutLogs.startTime))
      .limit(10),
  ])

  if (!scheduleResult) redirect("/onboarding")

  const { cycleWeekLabels, scheduledDays } = scheduleResult
  const todayDay = scheduledDays[0]
  const upcomingDays = scheduledDays.slice(1)

  const todayLabel = todayDay
    ? `Week ${todayDay.cycleWeekId} · ${todayDay.weekday}`
    : ""

  const todaySessionSummary = todayDay && !todayDay.isRestDay && todayDay.sessions.length > 0
    ? todayDay.sessions.map((s) => s.label).join(" + ")
    : null

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tempo</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(todayStr + "T00:00:00.000Z").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </p>
        </div>

        {/* Today's workout */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
                {todayLabel}
              </p>
              <h2 className="text-lg font-bold text-gray-900 mt-1">Today&apos;s workout</h2>
            </div>
            <Link
              href="/log"
              className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
            >
              + Log workout
            </Link>
          </div>

          {todayDay ? (
            <Link href={`/plan/${todayStr}`} className="block mt-4 group">
              {todayDay.isRestDay ? (
                <p className="text-sm text-gray-400">Rest day — no sessions scheduled.</p>
              ) : (
                <div className="text-gray-700 text-sm leading-relaxed">
                  {todaySessionSummary ?? "View sessions"}
                </div>
              )}
              <p className="mt-3 text-sm font-medium text-orange-500 group-hover:underline">
                View full workout →
              </p>
            </Link>
          ) : (
            <p className="mt-4 text-sm text-gray-400">No schedule found for today.</p>
          )}
        </section>

        {/* Upcoming workouts */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Next 7 days</h2>
          <ul className="space-y-0">
            {upcomingDays.map((day) => {
              const dateObj = new Date(day.date + "T00:00:00.000Z")
              const weekLabel = cycleWeekLabels[day.cycleWeekId] ?? `Week ${day.cycleWeekId}`
              const firstSession = day.sessions[0]
              const firstLine = firstSession ? firstSession.label : null

              return (
                <li key={day.id}>
                  <Link
                    href={`/plan/${day.date}`}
                    className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded-xl transition-colors"
                  >
                    {/* Date column */}
                    <div className="w-10 shrink-0 text-center">
                      <p className="text-[11px] font-semibold uppercase text-gray-400 leading-none">
                        {dateObj.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                      </p>
                      <p className="text-lg font-bold text-gray-800 leading-tight mt-0.5">
                        {dateObj.getUTCDate()}
                      </p>
                    </div>

                    {/* Workout info */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-1">
                        {weekLabel}
                      </span>
                      {day.isRestDay ? (
                        <p className="text-sm text-gray-300">Rest</p>
                      ) : firstLine ? (
                        <p className="text-sm text-gray-700 truncate">{firstLine}</p>
                      ) : (
                        <p className="text-sm text-gray-300">No sessions</p>
                      )}
                    </div>

                    {/* Chevron */}
                    <svg className="shrink-0 text-gray-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Recent workouts */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent workouts</h2>
          <RecentWorkoutsCard logs={recentLogs} />
        </section>

      </div>
    </main>
  )
}
