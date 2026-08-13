import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getScheduleRange } from "@/lib/services/plan.service"
import { mondayOfWeek, addDays } from "@/lib/plan/scheduler"
import { sessionKindMeta } from "@/lib/plan/sessionKinds"
import { AdjustWeekForm, type AdjustWeekDay } from "./AdjustWeekForm"

export default async function AdjustWeekPage({
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

  const schedule = await getScheduleRange(userId, monday, 7)
  if (!schedule) redirect("/onboarding")

  const days: AdjustWeekDay[] = schedule.scheduledDays.map((day) => ({
    weekday: day.weekday,
    date: day.date,
    sessions: day.sessions
      .filter((s) => s.status === "planned")
      .map((s) => ({
        label: sessionKindMeta(s.sessionKind).label,
        chipClass: sessionKindMeta(s.sessionKind).chipClass,
      })),
  }))

  const weekRangeLabel = `${new Date(`${monday}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${new Date(`${sunday}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-5">

        <Link
          href={`/plan/week/${monday}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          This week
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Adjust this week</h1>
          <p className="text-sm text-gray-400 mt-0.5">{weekRangeLabel}</p>
        </div>

        <AdjustWeekForm monday={monday} days={days} />

      </div>
    </main>
  )
}
