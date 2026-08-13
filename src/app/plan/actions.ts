"use server"

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  skipSession,
  restoreSession,
  rescheduleSession,
  changeSessionType,
  addAdHocSession,
  completeSession,
} from "@/lib/services/completion.service"
import { getOrCreatePlanVersion } from "@/lib/services/plan.service"
import { SESSION_KINDS } from "@/lib/validation/plan"
import { sessionKindMeta } from "@/lib/plan/sessionKinds"

type Result = { ok: boolean; error?: string }

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
const kindSchema = z.enum(SESSION_KINDS)
const reasonSchema = z.string().trim().max(500).optional()

/** Revalidate the day being edited plus the views that summarize it. */
function revalidateDay(dateStr: string) {
  revalidatePath(`/plan/${dateStr}`)
  revalidatePath("/plan")
  revalidatePath("/dashboard")
}

export async function skipSessionAction(
  sessionId: string,
  dateStr: string,
  reason?: string,
): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const date = dateSchema.safeParse(dateStr)
  if (!date.success) return { ok: false, error: "Invalid date" }

  const parsedReason = reasonSchema.safeParse(reason)
  if (!parsedReason.success) return { ok: false, error: "Reason is too long" }

  const updated = await skipSession(sessionId, session.user.id, parsedReason.data)
  if (!updated) return { ok: false, error: "Session not found" }

  revalidateDay(date.data)
  return { ok: true }
}

export async function restoreSessionAction(
  sessionId: string,
  dateStr: string,
): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const date = dateSchema.safeParse(dateStr)
  if (!date.success) return { ok: false, error: "Invalid date" }

  const updated = await restoreSession(sessionId, session.user.id)
  if (!updated) return { ok: false, error: "Only skipped sessions can be restored" }

  revalidateDay(date.data)
  return { ok: true }
}

/**
 * Manually mark a session done without a linked workout log — for sessions
 * that never go through the FIT upload pipeline (strength, elastic, or any
 * run the athlete doesn't want to attach a file to).
 */
export async function completeSessionAction(
  sessionId: string,
  dateStr: string,
): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const date = dateSchema.safeParse(dateStr)
  if (!date.success) return { ok: false, error: "Invalid date" }

  const updated = await completeSession(sessionId, session.user.id, null, new Date())
  if (!updated) return { ok: false, error: "Session not found" }

  revalidateDay(date.data)
  return { ok: true }
}

export async function moveSessionAction(
  sessionId: string,
  fromDateStr: string,
  toDateStr: string,
  reason?: string,
): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const from = dateSchema.safeParse(fromDateStr)
  const to = dateSchema.safeParse(toDateStr)
  if (!from.success || !to.success) return { ok: false, error: "Invalid date" }
  if (from.data === to.data) return { ok: false, error: "Pick a different day" }

  const parsedReason = reasonSchema.safeParse(reason)
  if (!parsedReason.success) return { ok: false, error: "Reason is too long" }

  try {
    await rescheduleSession(sessionId, session.user.id, to.data, parsedReason.data)
  } catch {
    return { ok: false, error: "Could not move that session" }
  }

  revalidateDay(from.data)
  revalidateDay(to.data)
  return { ok: true }
}

export async function changeSessionTypeAction(
  sessionId: string,
  dateStr: string,
  newKind: string,
  reason?: string,
): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const date = dateSchema.safeParse(dateStr)
  if (!date.success) return { ok: false, error: "Invalid date" }

  const kind = kindSchema.safeParse(newKind)
  if (!kind.success) return { ok: false, error: "Unknown session type" }

  const parsedReason = reasonSchema.safeParse(reason)
  if (!parsedReason.success) return { ok: false, error: "Reason is too long" }

  const meta = sessionKindMeta(kind.data)
  const updated = await changeSessionType(sessionId, session.user.id, kind.data, {
    label: meta.label,
    prescription: meta.defaultPrescription,
    isRunSession: meta.isRunSession,
    isStrengthSession: meta.isStrengthSession,
    reason: parsedReason.data,
  })
  if (!updated) return { ok: false, error: "Session not found" }

  revalidateDay(date.data)
  return { ok: true }
}

const addSessionSchema = z.object({
  sessionKind: kindSchema,
  label: z.string().trim().min(1).max(200),
  prescription: z.string().trim().min(1).max(2000),
})

export async function addSessionAction(
  dateStr: string,
  input: { sessionKind: string; label?: string; prescription?: string },
): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Not signed in" }

  const date = dateSchema.safeParse(dateStr)
  if (!date.success) return { ok: false, error: "Invalid date" }

  const meta = sessionKindMeta(input.sessionKind)
  const parsed = addSessionSchema.safeParse({
    sessionKind: input.sessionKind,
    label: input.label?.trim() || meta.label,
    prescription: input.prescription?.trim() || meta.defaultPrescription,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid session" }
  }

  const planVersion = await getOrCreatePlanVersion(session.user.id)
  if (!planVersion) return { ok: false, error: "No active training plan" }

  const created = await addAdHocSession(
    session.user.id,
    planVersion.id,
    date.data,
    {
      sessionKind: parsed.data.sessionKind,
      label: parsed.data.label,
      prescription: parsed.data.prescription,
      isRunSession: meta.isRunSession,
      isStrengthSession: meta.isStrengthSession,
    },
  )
  if (!created) return { ok: false, error: "Could not add that session" }

  revalidateDay(date.data)
  return { ok: true }
}
