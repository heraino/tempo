import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getAthleteTimezone } from "@/lib/services/plan.service"
import { resolveLocalDate } from "@/lib/plan/localDate"

// Redirect to the canonical /plan/[YYYY-MM-DD] URL for the athlete's local today.
export default async function TodayRedirectPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const tz = await getAthleteTimezone(session.user.id)
  const todayStr = resolveLocalDate(tz)
  redirect(`/plan/${todayStr}`)
}
