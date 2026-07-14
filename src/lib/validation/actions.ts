import { z } from "zod"

// ─── Coercion helper ──────────────────────────────────────────────────────────
// FormData values arrive as strings (or null). Empty strings should map to
// undefined so optional fields aren't coerced to 0 / NaN.
const optionalInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().optional()
)

const optionalFloat = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().optional()
)

// ─── Pain observation entry ───────────────────────────────────────────────────

export const painEntrySchema = z.object({
  location: z.string().min(1, "Location is required").max(100),
  side: z.enum(["left", "right", "bilateral", "none"]).optional(),
  level0to10: z.coerce.number().int().min(0).max(10),
  character: z.enum(["ache", "sharp", "tight", "burning", "fatigue", "other"]).optional(),
  onset: z.enum(["during_warmup", "mid_run", "post_run", "at_rest", "other"]).optional(),
  walkingScore: optionalInt.pipe(z.number().int().min(0).max(10).optional()),
  runningScore: optionalInt.pipe(z.number().int().min(0).max(10).optional()),
  gaitChange: z.boolean().optional().default(false),
  notes: z.string().max(500).optional(),
})

export type PainEntry = z.infer<typeof painEntrySchema>

// ─── Upload workout ───────────────────────────────────────────────────────────

export const uploadWorkoutSchema = z.object({
  // Existing fields
  perceivedEffort: optionalInt.pipe(
    z.number().int().min(1).max(5).optional()
  ),
  notes: z.string().max(2000).optional(),

  // Timezone — IANA tz name captured from the browser at upload time
  timezone: z.string().max(100).optional(),

  // Athlete context — subjective workout conditions
  feel: z.string().max(500).optional(),
  outsideTempC: optionalFloat.pipe(z.number().min(-50).max(60).optional()),
  humidityPct: optionalFloat.pipe(z.number().min(0).max(100).optional()),
  sleepQuality: optionalInt.pipe(z.number().int().min(1).max(5).optional()),
  // Checkboxes arrive as "on" when checked, absent when unchecked
  travel: z.preprocess((v) => v === "on" || v === true, z.boolean()).optional().default(false),
  massage: z.preprocess((v) => v === "on" || v === true, z.boolean()).optional().default(false),
  illness: z.preprocess((v) => v === "on" || v === true, z.boolean()).optional().default(false),
  nutritionNotes: z.string().max(500).optional(),
  contextFreeText: z.string().max(1000).optional(),

  // Pain observations — JSON-encoded array written by the client before submit
  painEntriesJson: z
    .string()
    .optional()
    .default("[]")
    .transform((v) => {
      try {
        return JSON.parse(v) as unknown[]
      } catch {
        return []
      }
    })
    .pipe(z.array(painEntrySchema).max(10)),
})

export type UploadWorkoutInput = z.infer<typeof uploadWorkoutSchema>

// ─── Save plan ────────────────────────────────────────────────────────────────

export const savePlanSchema = z.object({
  title: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Free string; Phase 3 seed reads it as the starting cycle week ID
  startWeek: z.string().min(1).max(50),
  // IANA timezone (e.g. "America/Los_Angeles"), captured from the browser.
  // Used to resolve the athlete's local calendar date. Defaults to UTC.
  timezone: z.string().max(100).optional().default("UTC"),
})
