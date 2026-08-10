import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getDayWithSessions } from "@/lib/services/plan.service"
import { addDays } from "@/lib/plan/scheduler"
import { PlanSessionCard } from "@/components/PlanSessionCard"
import { AddPlanSession } from "@/components/AddPlanSession"

export default async function PlanDatePage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const { date: dateParam } = await params

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) notFound()

  const day = await getDayWithSessions(session.user.id, dateParam)
  if (!day) redirect("/onboarding")

  const prevDate = addDays(dateParam, -1)
  const nextDate = addDays(dateParam, 1)

  const displayDate = new Date(dateParam + "T00:00:00.000Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Back */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Dashboard
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-500 mb-1">
                {day.weekday} · {day.cycleWeekId ? `Week ${day.cycleWeekId}` : ""}
              </p>
              <h1 className="text-2xl font-bold text-gray-900">{displayDate}</h1>
            </div>

            {/* Prev / Next navigation */}
            <div className="flex items-center gap-1 shrink-0">
              <Link
                href={`/plan/${prevDate}`}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                aria-label="Previous day"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
              <Link
                href={`/plan/${nextDate}`}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                aria-label="Next day"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-gray-50 space-y-4">
            {day.sessions.length === 0 ? (
              <p className="text-sm text-gray-400">Rest day — no sessions scheduled.</p>
            ) : (
              <ul className="space-y-4">
                {day.sessions.map((s) => (
                  <PlanSessionCard
                    key={s.id}
                    dateStr={dateParam}
                    session={{
                      id: s.id,
                      sessionKind: s.sessionKind,
                      label: s.label,
                      prescription: s.prescription,
                      isRunSession: s.isRunSession,
                      isStrengthSession: s.isStrengthSession,
                      status: s.status,
                    }}
                  />
                ))}
              </ul>
            )}

            <AddPlanSession dateStr={dateParam} />
          </div>
        </div>

        {/* Log CTA */}
        <Link
          href="/log"
          className="block w-full text-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
        >
          + Log a workout
        </Link>

        {/* Plan review CTA */}
        <Link
          href="/plan/review"
          className="flex items-center justify-between gap-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-orange-300 transition-colors group"
        >
          <div>
            <p className="text-sm font-semibold text-gray-800 group-hover:text-orange-600">
              How is my plan working?
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Ask your coach to review the last 4 weeks
            </p>
          </div>
          <svg className="text-gray-300 group-hover:text-orange-400 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>

      </div>
    </main>
  )
}

