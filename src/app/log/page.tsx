import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import { LogWorkoutForm } from "./LogWorkoutForm"

export default async function LogPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const prefs = await getUserPreferences(session.user.id)

  return <LogWorkoutForm unitsSystem={prefs.unitsSystem} />
}
