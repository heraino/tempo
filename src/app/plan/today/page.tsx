import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { trainingPlans } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getTodayInfo, extractWorkout, type RotationWeek } from "@/lib/rotation"

export default async function TodayWorkoutPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const rows = await db
    .select()
    .from(trainingPlans)
    .where(eq(trainingPlans.userId, session.user.id))
    .limit(1)

  const plan = rows[0]
  if (!plan) redirect("/onboarding")

  const anchorDate = new Date(plan.startDate + "T00:00:00")
  const { week, dayName, today } = getTodayInfo(anchorDate, plan.startWeek as RotationWeek)
  const workout = extractWorkout(plan.content, week, dayName)

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Back */}
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Dashboard
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
            Week {week} · {dayName}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Today&apos;s workout</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {today.toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
          </p>

          {workout ? (
            <div className="mt-6 pt-5 border-t border-gray-50 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {workout}
            </div>
          ) : (
            <p className="mt-6 pt-5 border-t border-gray-50 text-sm text-gray-400">
              No entry found for {dayName} in Week {week}. Check that your plan uses{" "}
              <code className="bg-gray-100 px-1 rounded">### {dayName}</code> inside{" "}
              <code className="bg-gray-100 px-1 rounded"># Week {week}</code>.
            </p>
          )}
        </div>

        {/* Log this workout CTA */}
        <Link
          href="/log"
          className="block w-full text-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
        >
          + Log this workout
        </Link>

      </div>
    </main>
  )
}
