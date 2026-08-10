import { z } from "zod"
import { SESSION_KINDS, WEEKDAYS } from "./plan"
import type { PlanMutationOp } from "@/lib/plan/mutations"

const sessionKind = z.enum(SESSION_KINDS)
const weekday = z.enum(WEEKDAYS)
const cycleWeekId = z.string().min(1).max(50)

/**
 * The complete set of structural changes the coach may propose.
 *
 * This is the boundary between model output and plan state: anything the model
 * emits that does not parse here is discarded, so no free-form text can ever
 * reach plan_json.
 */
export const planMutationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("swap_session_kind"),
    cycleWeekId,
    weekday,
    fromKind: sessionKind,
    toKind: sessionKind,
  }),
  z.object({
    op: z.literal("remove_session"),
    cycleWeekId,
    weekday,
    sessionKind,
  }),
  z.object({
    op: z.literal("add_session"),
    cycleWeekId,
    weekday,
    sessionKind,
  }),
  z.object({
    op: z.literal("move_session"),
    cycleWeekId,
    fromWeekday: weekday,
    toWeekday: weekday,
    sessionKind,
  }),
  z.object({
    op: z.literal("scale_mileage"),
    blockNumber: z.number().int().min(1).optional(),
    factorPct: z.number().min(-50).max(50),
  }),
  z.object({
    op: z.literal("set_cutback"),
    cycleWeekId,
    isCutback: z.boolean(),
  }),
])

export function validatePlanMutation(data: unknown): PlanMutationOp {
  return planMutationSchema.parse(data) as PlanMutationOp
}
