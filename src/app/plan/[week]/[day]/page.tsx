import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { trainingPlans } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { extractWorkout, DAY_NAMES, type RotationWeek } from "@/lib/rotation"
import { WorkoutMarkdown } from "@/components/WorkoutMarkdown"

const VALID_WEEKS = ["A", "B", "C", "D"] as const

export default async function PlanDayPage({
  params,
}: {
  params: Promise<{ week: string; day: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const { week: weekParam, day: dayParam } = await params

  const week = weekParam.toUpperCase() as RotationWeek
  const dayName = dayParam.charAt(0).toUpperCase() + dayParam.slice(1).toLowerCase()

  if (!VALID_WEEKS.includes(week as (typeof VALID_WEEKS)[number])) notFound()
  if (!DAY_NAMES.includes(dayName as (typeof DAY_NAMES)[number])) notFound()

  const rows = await db
    .select()
    .from(trainingPlans)
    .where(eq(trainingPlans.userId, session.user.id))
    .limit(1)

  const plan = rows[0]
  if (!plan) redirect("/onboarding")

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
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500 mb-1">
            Week {week} · {dayName}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Workout</h1>

          {workout ? (
            <div className="mt-6 pt-5 border-t border-gray-50">
              <WorkoutMarkdown content={workout} />
            </div>
          ) : (
            <p className="mt-6 pt-5 border-t border-gray-50 text-sm text-gray-400">
              No entry found for {dayName} in Week {week}. Check that your plan uses{" "}
              <code className="bg-gray-100 px-1 rounded">### {dayName}</code> inside{" "}
              <code className="bg-gray-100 px-1 rounded"># Week {week}</code>.
            </p>
          )}
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
