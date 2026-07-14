"use server"

import { auth, signOut } from "@/auth"
import { db } from "@/lib/db"
import { trainingPlans } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { savePlanSchema } from "@/lib/validation/actions"
import { seedPlanVersion } from "@/lib/plan/seed"

export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}

export async function savePlan(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in" }

  const file = formData.get("planFile") as File | null
  if (!file || file.size === 0) return { error: "Please choose a .md file" }

  const parsed = savePlanSchema.safeParse({
    title: formData.get("title") || file.name,
    startDate: formData.get("startDate"),
    startWeek: formData.get("startWeek"),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }
  const { title, startDate, startWeek } = parsed.data

  const content = await file.text()

  await db.delete(trainingPlans).where(eq(trainingPlans.userId, session.user.id))

  await db.insert(trainingPlans).values({
    userId: session.user.id,
    title,
    content,
    startDate,
    startWeek,
  })

  // Seed plan version + generate 90 days of schedule on first save.
  // seedPlanVersion is idempotent — safe to call even if a version already exists.
  await seedPlanVersion(session.user.id, { startDate, startWeek })

  return { ok: true }
}
