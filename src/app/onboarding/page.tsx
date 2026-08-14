import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import { getKpiSnapshot } from "@/lib/services/kpi.service"
import { getActiveGoal } from "@/lib/services/goal.service"
import { METERS_PER_MILE } from "@/lib/goals/goal"
import { OnboardingWizard } from "./OnboardingWizard"

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  const userId = session.user.id

  const [prefs, kpis, existingGoal] = await Promise.all([
    getUserPreferences(userId),
    getKpiSnapshot(userId).catch(() => null),
    getActiveGoal(userId).catch(() => null),
  ])

  return (
    <OnboardingWizard
      units={prefs.unitsSystem}
      kpiDefaults={{
        currentWeeklyMi: kpis?.weeklyMileage
          ? Math.round((kpis.weeklyMileage / METERS_PER_MILE) * 10) / 10
          : null,
        longestRecentRunMi: kpis?.longRunDistanceM
          ? Math.round((kpis.longRunDistanceM / METERS_PER_MILE) * 10) / 10
          : null,
      }}
      existingGoal={
        existingGoal
          ? {
              goalType: existingGoal.goalType,
              title: existingGoal.title,
              targetDate: existingGoal.targetDate,
              targetDistanceM: existingGoal.targetDistanceM,
              targetDurationSecs: existingGoal.targetDurationSecs,
              targetPaceMinPerKm: existingGoal.targetPaceMinPerKm,
              targetRunsPerWeek: existingGoal.targetRunsPerWeek,
              notes: existingGoal.notes,
            }
          : null
      }
      existingRunnerLevel={prefs.runnerLevel}
      existingDaysPerWeek={prefs.daysPerWeek}
      existingLongRunDay={prefs.longRunDay}
    />
  )
}
