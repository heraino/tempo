import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { trainingPlans } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getTodayInfo, type RotationWeek } from "@/lib/rotation"

// Redirect to the canonical /plan/[week]/[day] URL for today.
export default async function TodayRedirectPage() {
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
  const { week, dayName } = getTodayInfo(anchorDate, plan.startWeek as RotationWeek)

  redirect(`/plan/${week}/${dayName}`)
}
