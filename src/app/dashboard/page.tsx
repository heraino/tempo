import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { trainingPlans, workoutLogs } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { getTodayInfo, getDateInfo, extractWorkout, type RotationWeek } from "@/lib/rotation"
import { fmtPace, fmtDistance, fmtDuration, fmtDate } from "@/lib/fmt"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const userId = session.user.id

  // Load training plan and recent workouts in parallel
  const [planRows, recentLogs] = await Promise.all([
    db.select().from(trainingPlans).where(eq(trainingPlans.userId, userId)).limit(1),
    db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.userId, userId))
      .orderBy(desc(workoutLogs.startTime))
      .limit(10),
  ])

  const plan = planRows[0]

  // No plan yet → prompt onboarding
  if (!plan) redirect("/onboarding")

  const anchorDate = new Date(plan.startDate + "T00:00:00")
  const { week, dayName, today } = getTodayInfo(anchorDate, plan.startWeek as RotationWeek)
  const todaysWorkout = extractWorkout(plan.content, week, dayName)

  // Build the next 7 days
  const upcomingDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today)
    date.setDate(today.getDate() + i + 1)
    const { week: w, dayName: dn } = getDateInfo(date, anchorDate, plan.startWeek as RotationWeek)
    const workout = extractWorkout(plan.content, w, dn)
    const firstLine = workout.split("\n").find(l => l.trim() && !l.startsWith("#"))?.trim() ?? ""
    return { date, week: w, dayName: dn, firstLine }
  })

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tempo</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Today's workout */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
                Week {week} · {dayName}
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

          {todaysWorkout ? (
            <div className="mt-4 prose prose-sm prose-gray max-w-none text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
              {todaysWorkout}
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-400">
              Could not find today&apos;s section in your plan. Check that your plan uses the
              headings <code>### {dayName}</code> inside <code># Week {week}</code>.
            </p>
          )}
        </section>

        {/* Upcoming workouts */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Next 7 days</h2>
          <ul className="space-y-0">
            {upcomingDays.map(({ date, week: w, dayName: dn, firstLine }) => (
              <li
                key={date.toISOString()}
                className="flex items-start gap-4 py-3 border-b border-gray-50 last:border-0"
              >
                {/* Date column */}
                <div className="w-10 shrink-0 text-center">
                  <p className="text-[11px] font-semibold uppercase text-gray-400 leading-none">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <p className="text-lg font-bold text-gray-800 leading-tight mt-0.5">
                    {date.getDate()}
                  </p>
                </div>

                {/* Workout info */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-1">
                    Week {w}
                  </span>
                  {firstLine ? (
                    <p className="text-sm text-gray-700 truncate">{firstLine}</p>
                  ) : (
                    <p className="text-sm text-gray-300">Rest or no entry</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Plan info */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Active plan
              </p>
              <p className="text-sm font-medium text-gray-800 mt-1">{plan.title}</p>
            </div>
            <Link href="/onboarding" className="text-sm text-orange-500 hover:underline">
              Update plan
            </Link>
          </div>
        </section>

        {/* Recent workouts */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent workouts</h2>

          {recentLogs.length === 0 ? (
            <p className="text-sm text-gray-400">
              No workouts logged yet.{" "}
              <Link href="/log" className="text-orange-500 hover:underline">
                Upload your first one →
              </Link>
            </p>
          ) : (
            <ul className="space-y-0 divide-y divide-gray-50">
              {recentLogs.map((log) => {
                const sport = log.sport
                  ? log.sport.charAt(0).toUpperCase() + log.sport.slice(1)
                  : "Activity"
                return (
                  <li key={log.id}>
                    <Link
                      href={`/workout/${log.id}`}
                      className="flex items-center justify-between py-4 gap-4 hover:bg-gray-50 -mx-2 px-2 rounded-xl transition-colors"
                    >
                      {/* Left: sport, date, effort */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{sport}</p>
                          {log.perceivedEffort && (
                            <span className="text-[10px] font-semibold bg-orange-50 text-orange-500 rounded-full px-2 py-0.5">
                              {log.perceivedEffort}/5
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {fmtDate(new Date(log.startTime))}
                        </p>
                        {/* Key stats row */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                          <span className="font-semibold text-gray-800">{fmtDistance(log.totalDistanceM)}</span>
                          <span className="text-gray-300">·</span>
                          <span>{fmtDuration(log.totalTimerSecs)}</span>
                          <span className="text-gray-300">·</span>
                          <span>{fmtPace(log.avgSpeedMps)}</span>
                        </div>
                        {/* HR row */}
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          {log.avgHr && <span>HR {log.avgHr} bpm</span>}
                          {log.hrDriftBpm != null && (
                            <span className={log.hrDriftBpm > 5 ? "text-amber-500" : ""}>
                              drift {log.hrDriftBpm > 0 ? "+" : ""}{log.hrDriftBpm.toFixed(1)} bpm
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: chevron */}
                      <svg className="shrink-0 text-gray-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

      </div>
    </main>
  )
}
