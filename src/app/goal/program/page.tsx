import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getActiveGoal } from "@/lib/services/goal.service"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import { getActivePlanVersion } from "@/lib/services/plan.service"
import { getKpiSnapshot } from "@/lib/services/kpi.service"
import { describeGoal, METERS_PER_MILE } from "@/lib/goals/goal"
import { ProgramBuilder } from "./ProgramBuilder"

// Program generation can make up to two sequential Nebius calls (a retry on
// a malformed first response) — extend the platform's function timeout so a
// legitimate, just-slow generation isn't killed mid-flight.
export const maxDuration = 120

export default async function ProgramPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  const userId = session.user.id

  const [goal, prefs, planVersion, kpis] = await Promise.all([
    getActiveGoal(userId),
    getUserPreferences(userId),
    getActivePlanVersion(userId),
    getKpiSnapshot(userId).catch(() => null),
  ])

  const units = prefs.unitsSystem as "imperial" | "metric"

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-5">

        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Settings
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Build a training program</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Your coach designs a program around your goal and your week. You review
            it before anything starts.
          </p>
        </div>

        {planVersion && (
          <section className="bg-amber-50 rounded-2xl border border-amber-200 px-5 py-4">
            <p className="text-sm font-medium text-amber-800">
              You already have a training plan.
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Building a new program below will replace it — we&apos;ll confirm before
              anything changes. Your workout history stays intact either way. To
              adjust the current plan instead of replacing it, use{" "}
              <Link href="/plan/review" className="font-semibold underline">
                How is my plan working?
              </Link>
              .
            </p>
          </section>
        )}

        {/* Goal context */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Training toward
          </p>
          {goal ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold text-gray-900">
                {describeGoal(goal, units)}
              </p>
              <Link
                href="/goal"
                className="text-sm font-semibold text-orange-500 hover:underline shrink-0"
              >
                Change
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-gray-500">
                No goal yet — setting one makes the program much more specific.
              </p>
              <Link
                href="/goal"
                className="text-sm font-semibold text-orange-500 hover:underline shrink-0"
              >
                Set a goal
              </Link>
            </div>
          )}
        </section>

        <ProgramBuilder
          units={units}
          hasGoal={goal != null}
          hasExistingPlan={planVersion != null}
          defaults={{
            runnerLevel: prefs.runnerLevel,
            daysPerWeek: prefs.daysPerWeek,
            longRunDay: prefs.longRunDay,
            currentWeeklyMi: kpis?.weeklyMileage
              ? Math.round((kpis.weeklyMileage / METERS_PER_MILE) * 10) / 10
              : null,
            longestRecentRunMi: kpis?.longRunDistanceM
              ? Math.round((kpis.longRunDistanceM / METERS_PER_MILE) * 10) / 10
              : null,
          }}
        />

      </div>
    </main>
  )
}
