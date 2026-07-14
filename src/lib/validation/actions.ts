import { z } from "zod"

export const uploadWorkoutSchema = z.object({
  perceivedEffort: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
})

export const savePlanSchema = z.object({
  title: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Free string; Phase 3 seed reads it as the starting cycle week ID
  startWeek: z.string().min(1).max(50),
})
