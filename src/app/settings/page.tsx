import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import { getActiveGoal } from "@/lib/services/goal.service"
import { getActivePlanVersion } from "@/lib/services/plan.service"
import { describeGoal } from "@/lib/goals/goal"
import { TrainingModeSection } from "@/components/TrainingModeSection"
import { SettingsForm } from "@/components/SettingsForm"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const [prefs, goal, planVersion] = await Promise.all([
    getUserPreferences(session.user.id),
    getActiveGoal(session.user.id),
    getActivePlanVersion(session.user.id),
  ])

  const units = prefs.unitsSystem as "imperial" | "metric"

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">

        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        {/* Training mode */}
        <TrainingModeSection
          mode={prefs.trainingMode}
          hasPlan={planVersion != null}
          goalSummary={goal ? describeGoal(goal, units) : null}
        />

        {/* Goal */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Training goal</h2>
          <p className="text-xs text-gray-400 mb-4">
            {goal
              ? describeGoal(goal, units)
              : "You haven't set a goal yet. Your coach needs one to judge whether training is on track."}
          </p>
          <Link
            href="/goal"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-orange-300 hover:text-orange-600 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4" />
            </svg>
            {goal ? "Edit goal" : "Set your goal"}
          </Link>
        </section>

        <SettingsForm unitsSystem={units} timezone={prefs.timezone} maxHr={prefs.maxHr} />

        {/* Data import */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Import workout history</h2>
          <p className="text-xs text-gray-400 mb-4">
            Upload a Garmin Connect data export to import your full workout history in bulk.
          </p>
          <Link
            href="/settings/import"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-orange-300 hover:text-orange-600 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Import from Garmin Connect
          </Link>
        </section>

      </div>
    </main>
  )
}
