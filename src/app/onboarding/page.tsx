import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import { getKpiSnapshot } from "@/lib/services/kpi.service"
import { METERS_PER_MILE } from "@/lib/goals/goal"
import { OnboardingWizard } from "./OnboardingWizard"

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  const userId = session.user.id

  const [prefs, kpis] = await Promise.all([
    getUserPreferences(userId),
    getKpiSnapshot(userId).catch(() => null),
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
    />
  )
}
