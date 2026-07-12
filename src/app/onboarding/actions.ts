"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { trainingPlans } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function savePlan(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in" }

  const file = formData.get("planFile") as File | null
  const title = formData.get("title") as string
  const startDate = formData.get("startDate") as string
  const startWeek = formData.get("startWeek") as string

  if (!file || file.size === 0) return { error: "Please choose a .md file" }
  if (!startDate) return { error: "Please set a start date" }

  const content = await file.text()

  // Replace any existing plan for this user
  await db.delete(trainingPlans).where(eq(trainingPlans.userId, session.user.id))

  await db.insert(trainingPlans).values({
    userId: session.user.id,
    title: title || file.name,
    content,
    startDate,
    startWeek,
  })

  return { ok: true }
}
