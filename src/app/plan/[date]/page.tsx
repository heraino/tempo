import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getDayWithSessions } from "@/lib/services/plan.service"
import { addDays } from "@/lib/plan/scheduler"

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

          <div className="mt-6 pt-5 border-t border-gray-50">
            {day.isRestDay ? (
              <p className="text-sm text-gray-400">Rest day — no sessions scheduled.</p>
            ) : (
              <ul className="space-y-4">
                {day.sessions.map((s) => (
                  <li key={s.id} className="rounded-xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-orange-50 text-orange-500">
                            {s.sessionKind}
                          </span>
                          {s.isRunSession && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                              Run
                            </span>
                          )}
                          {s.isStrengthSession && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                              Strength
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-900">{s.label}</p>
                        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{s.prescription}</p>
                      </div>
                      <StatusPill status={s.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Log CTA */}
        <Link
          href="/log"
          className="block w-full text-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
        >
          + Log a workout
        </Link>

      </div>
    </main>
  )
}

function StatusPill({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-green-50 text-green-600">
        Done
      </span>
    )
  }
  if (status === "skipped") {
    return (
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-gray-100 text-gray-400">
        Skipped
      </span>
    )
  }
  if (status === "rescheduled") {
    return (
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-amber-50 text-amber-500">
        Moved
      </span>
    )
  }
  return null
}
