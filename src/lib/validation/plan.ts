import { z } from "zod"
import type { PlanJson } from "@/lib/plan/types"

export const SESSION_KINDS = [
  "easy", "recovery", "long", "threshold", "tempo", "progression",
  "strides", "strength", "elastic", "rest", "custom",
] as const

export const WEEKDAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const

export const intervalBlockSchema = z.object({
  reps: z.number().int().min(1),
  workDurationSecs: z.number().positive().optional(),
  workDistanceM: z.number().positive().optional(),
  recDurationSecs: z.number().positive().optional(),
  recDistanceM: z.number().positive().optional(),
  label: z.string().max(200).optional(),
  targetHrMin: z.number().int().min(0).max(300).optional(),
  targetHrMax: z.number().int().min(0).max(300).optional(),
})

export const sessionTemplateSchema = z.object({
  sessionKind: z.enum(SESSION_KINDS),
  customType: z.string().max(100).optional(),
  label: z.string().min(1).max(200),
  prescription: z.string().min(1).max(2000),
  isRunSession: z.boolean(),
  isStrengthSession: z.boolean(),
  targetDistanceM: z.number().positive().optional(),
  targetDurationSecs: z.number().positive().optional(),
  targetHrMin: z.number().int().min(0).max(300).optional(),
  targetHrMax: z.number().int().min(0).max(300).optional(),
  targetPaceMinPerKm: z.number().positive().optional(),
  intervals: z.array(intervalBlockSchema).optional(),
})

export const dayTemplateSchema = z.object({
  weekday: z.enum(WEEKDAYS),
  sessions: z.array(sessionTemplateSchema),
})

export const cycleWeekSchema = z.object({
  id: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  days: z.array(dayTemplateSchema),
  isCutback: z.boolean().optional(),
})

/** @deprecated Use progressionBlockSchema. */
export const mileageBandSchema = z.object({
  cycleWeekId: z.string().min(1).max(50),
  minMi: z.number().min(0),
  maxMi: z.number().min(0),
})

export const progressionBlockSchema = z.object({
  blockNumber: z.number().int().min(1),
  buildMinMi: z.number().min(0),
  buildMaxMi: z.number().min(0),
  cutbackMinMi: z.number().min(0),
  cutbackMaxMi: z.number().min(0),
})

export const planJsonSchema = z.object({
  version: z.literal(1),
  cycleWeeks: z.array(cycleWeekSchema).min(1, "Plan must have at least one cycle week"),
  mileageBands: z.array(mileageBandSchema).optional(),
  progressionBlocks: z.array(progressionBlockSchema).optional(),
})

/** Throws a ZodError if invalid; returns a typed PlanJson if valid. */
export function validatePlanJson(data: unknown): PlanJson {
  return planJsonSchema.parse(data) as PlanJson
}
