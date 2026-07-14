import { auth } from "@/auth"
import { redirect } from "next/navigation"

// Redirect to the canonical /plan/[YYYY-MM-DD] URL for today (UTC date).
export default async function TodayRedirectPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const todayStr = new Date().toISOString().split("T")[0]
  redirect(`/plan/${todayStr}`)
}
