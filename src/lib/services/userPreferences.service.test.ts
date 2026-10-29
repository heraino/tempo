import { describe, it, expect, vi, beforeEach } from "vitest"

// The schema probe decides which columns exist; these tests pin down what the
// service does with that answer. A read never selects a missing column, and a
// write never reports success for a field the database can't store. (The SQL
// these paths generate was also run against real Postgres with max_hr absent:
// drizzle's INSERT always names every schema column, which is why the update
// path below exists.)

let missing = new Set<string>()
vi.mock("@/lib/db/schemaCapabilities", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/db/schemaCapabilities")>()),
  missingColumns: vi.fn(async () => missing),
}))

const selected: Array<Record<string, unknown>> = []
const inserts: Array<{ values: Record<string, unknown>; set: Record<string, unknown> }> = []
const updates: Array<Record<string, unknown>> = []
let selectRows: unknown[] = []
let selectError: Error | null = null
let updatedRows: unknown[] = [{ id: "p1" }]

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn((fields: Record<string, unknown>) => {
      selected.push(fields)
      return {
        from: () => ({
          where: () => ({
            limit: () => (selectError ? Promise.reject(selectError) : Promise.resolve(selectRows)),
          }),
        }),
      }
    }),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
          inserts.push({ values, set })
          return Promise.resolve()
        },
      }),
    })),
    update: vi.fn(() => ({
      set: (set: Record<string, unknown>) => ({
        where: () => ({
          returning: () => {
            updates.push(set)
            return Promise.resolve(updatedRows)
          },
        }),
      }),
    })),
  },
}))

const { getUserPreferences, upsertUserPreferences, prefsWriteErrorMessage } = await import(
  "./userPreferences.service"
)
const { SchemaDriftError } = await import("@/lib/db/schemaCapabilities")

beforeEach(() => {
  missing = new Set()
  selected.length = 0
  inserts.length = 0
  updates.length = 0
  selectRows = []
  selectError = null
  updatedRows = [{ id: "p1" }]
})

describe("getUserPreferences", () => {
  it("reads every preference in a single query on a complete schema", async () => {
    selectRows = [{
      unitsSystem: "metric", timezone: "UTC", trainingMode: "just_run",
      runnerLevel: "intermediate", daysPerWeek: 5, longRunDay: "Sunday", maxHr: 185,
    }]
    const prefs = await getUserPreferences("u1")

    expect(selected).toHaveLength(1)
    expect(Object.keys(selected[0])).toEqual([
      "unitsSystem", "timezone", "trainingMode", "runnerLevel", "daysPerWeek", "longRunDay", "maxHr",
    ])
    expect(prefs).toEqual({
      unitsSystem: "metric", timezone: "UTC", trainingMode: "just_run",
      runnerLevel: "intermediate", daysPerWeek: 5, longRunDay: "Sunday", maxHr: 185,
    })
  })

  it("never selects a column the database lacks, and reads it as its default", async () => {
    missing = new Set(["user_preferences.max_hr"])
    selectRows = [{ unitsSystem: "imperial", timezone: null, trainingMode: "goal_program" }]
    const prefs = await getUserPreferences("u1")

    expect(Object.keys(selected[0])).not.toContain("maxHr")
    expect(prefs.maxHr).toBeNull()
    expect(prefs.trainingMode).toBe("goal_program")
  })

  it("returns defaults when the athlete has no preferences row", async () => {
    expect(await getUserPreferences("u1")).toEqual({
      unitsSystem: "imperial", timezone: null, trainingMode: "goal_program",
      runnerLevel: null, daysPerWeek: null, longRunDay: null, maxHr: null,
    })
  })

  it("propagates a genuine database error instead of masking it as defaults", async () => {
    selectError = new Error("connection reset")
    await expect(getUserPreferences("u1")).rejects.toThrow("connection reset")
  })
})

describe("upsertUserPreferences", () => {
  it("upserts only the given fields on a complete schema", async () => {
    await upsertUserPreferences("u1", { timezone: "America/Los_Angeles" })

    expect(inserts).toHaveLength(1)
    expect(Object.keys(inserts[0].set).sort()).toEqual(["timezone", "updatedAt"])
    expect(inserts[0].values).toMatchObject({ userId: "u1", timezone: "America/Los_Angeles" })
    expect(updates).toHaveLength(0)
  })

  it("passes null through, so a field can be cleared", async () => {
    await upsertUserPreferences("u1", { maxHr: null })
    expect(inserts[0].set).toHaveProperty("maxHr", null)
  })

  it("refuses to write a field whose column is missing, naming the migration, and writes nothing", async () => {
    missing = new Set(["user_preferences.max_hr"])
    const write = upsertUserPreferences("u1", { unitsSystem: "metric", maxHr: 190 })

    await expect(write).rejects.toBeInstanceOf(SchemaDriftError)
    await expect(write).rejects.toThrow(
      "Max heart rate can't be saved: the app's database is missing migration 0009_athlete_max_hr.",
    )
    expect(inserts).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  it("still saves unaffected fields while a column is missing, via an UPDATE", async () => {
    missing = new Set(["user_preferences.max_hr"])
    await upsertUserPreferences("u1", { timezone: "America/Los_Angeles" })

    expect(inserts).toHaveLength(0)
    expect(Object.keys(updates[0]).sort()).toEqual(["timezone", "updatedAt"])
  })

  it("refuses to create a new row while a column is missing, since drizzle's INSERT needs every column", async () => {
    missing = new Set(["user_preferences.max_hr"])
    updatedRows = []
    await expect(upsertUserPreferences("u1", { timezone: "UTC" })).rejects.toThrow(
      "Your preferences can't be saved: the app's database is missing migration 0009_athlete_max_hr.",
    )
  })
})

describe("prefsWriteErrorMessage", () => {
  it("shows a schema drift error as-is", () => {
    const err = new SchemaDriftError(["0008_training_mode"], "Training mode")
    expect(prefsWriteErrorMessage(err)).toBe(err.message)
  })

  it("logs any other error and shows a generic retry message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(prefsWriteErrorMessage(new Error("connection reset"))).toBe(
      "Couldn't save your preferences. Try again shortly.",
    )
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
