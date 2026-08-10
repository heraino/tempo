import { z } from "zod"
import { SESSION_KINDS, WEEKDAYS } from "./plan"
import type { ProgramBlueprint } from "@/lib/plan/blueprint"

/**
 * The shape the coach must return when generating a program.
 *
 * Deliberately narrow: session kinds and weekdays are enums, and the model
 * supplies no labels, prescriptions, or flags. Everything else is derived
 * deterministically when the blueprint is expanded into a plan.
 */
export const blueprintDaySchema = z.object({
  weekday: z.enum(WEEKDAYS),
  sessionKinds: z.array(z.enum(SESSION_KINDS)).max(3),
})

export const blueprintWeekSchema = z.object({
  id: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  isCutback: z.boolean().optional(),
  days: z.array(blueprintDaySchema).max(7),
})

export const blueprintProgressionBlockSchema = z.object({
  blockNumber: z.number().int().min(1).max(20),
  buildMinMi: z.number().min(0).max(200),
  buildMaxMi: z.number().min(0).max(200),
  cutbackMinMi: z.number().min(0).max(200),
  cutbackMaxMi: z.number().min(0).max(200),
})

export const programBlueprintSchema = z.object({
  planName: z.string().min(1).max(120),
  summary: z.string().min(1).max(1500),
  cycleWeeks: z.array(blueprintWeekSchema).min(1).max(6),
  progressionBlocks: z.array(blueprintProgressionBlockSchema).max(12).default([]),
  notes: z.array(z.string().max(400)).max(6).default([]),
})

export function validateProgramBlueprint(data: unknown): ProgramBlueprint {
  return programBlueprintSchema.parse(data) as ProgramBlueprint
}
