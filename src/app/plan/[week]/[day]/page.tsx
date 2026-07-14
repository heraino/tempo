import { redirect } from "next/navigation"

// Legacy route /plan/[week]/[day] — redirected to dashboard.
// Canonical schedule is now at /plan/[YYYY-MM-DD].
export default function LegacyPlanDayPage() {
  redirect("/dashboard")
}
