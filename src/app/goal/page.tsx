import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getActiveGoal } from "@/lib/services/goal.service"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import { getAthleteTimezone } from "@/lib/services/plan.service"
import { resolveLocalDate } from "@/lib/plan/localDate"
import { describeGoal, weeksBetween, daysBetween, fmtGoalDate } from "@/lib/goals/goal"
import { GoalForm } from "./GoalForm"

export default async function GoalPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  const userId = session.user.id

  const [goal, prefs, tz] = await Promise.all([
    getActiveGoal(userId),
    getUserPreferences(userId),
    getAthleteTimezone(userId),
  ])

  const units = prefs.unitsSystem as "imperial" | "metric"
  const todayStr = resolveLocalDate(tz)

  const weeksRemaining =
    goal?.targetDate != null ? weeksBetween(todayStr, goal.targetDate) : null
  const daysRemaining =
    goal?.targetDate != null ? daysBetween(todayStr, goal.targetDate) : null

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-5">

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your goal</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Everything your coach recommends is measured against this.
          </p>
        </div>

        {/* Current goal summary */}
        {goal && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-1">
              Current goal
            </p>
            <h2 className="text-lg font-bold text-gray-900">
              {goal.title ?? describeGoal(goal, units)}
            </h2>
            {goal.title && (
              <p className="text-sm text-gray-500 mt-0.5">{describeGoal(goal, units)}</p>
            )}

            {goal.targetDate && daysRemaining != null && (
              <div className="mt-4 pt-4 border-t border-gray-50">
                {daysRemaining >= 0 ? (
                  <p className="text-sm text-gray-600">
                    <span className="font-bold text-gray-900">
                      {daysRemaining === 0
                        ? "Today"
                        : weeksRemaining != null && weeksRemaining >= 2
                        ? `${weeksRemaining} weeks`
                        : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`}
                    </span>{" "}
                    {daysRemaining === 0 ? "is the day" : `until ${fmtGoalDate(goal.targetDate)}`}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">
                    Target date {fmtGoalDate(goal.targetDate)} has passed — set a new goal below.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Editor */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            {goal ? "Update your goal" : "Set your goal"}
          </h2>
          <p className="text-xs text-gray-400 mb-5">
            Your coach uses this to judge whether your training is on track.
          </p>
          <GoalForm
            initial={
              goal
                ? {
                    goalType: goal.goalType,
                    title: goal.title,
                    targetDate: goal.targetDate,
                    targetDistanceM: goal.targetDistanceM,
                    targetDurationSecs: goal.targetDurationSecs,
                    targetPaceMinPerKm: goal.targetPaceMinPerKm,
                    targetRunsPerWeek: goal.targetRunsPerWeek,
                    notes: goal.notes,
                  }
                : null
            }
            units={units}
          />
        </section>

      </div>
    </main>
  )
}
