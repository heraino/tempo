import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"

const mockExecute = vi.fn()
vi.mock("@/lib/db", () => ({ db: { execute: mockExecute } }))

const {
  missingColumns,
  migrationsFor,
  probeQuery,
  resetSchemaCapabilitiesCache,
  SchemaDriftError,
  OPTIONAL_COLUMNS,
} = await import("./schemaCapabilities")

const ALL = Object.keys(OPTIONAL_COLUMNS).map((key) => {
  const [table_name, column_name] = key.split(".")
  return { table_name, column_name }
})
const withoutMaxHr = ALL.filter((r) => r.column_name !== "max_hr")

beforeEach(() => {
  vi.clearAllMocks()
  resetSchemaCapabilitiesCache()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("probeQuery", () => {
  it("reads every column of the probed tables in the public schema", () => {
    const { sql, params } = new PgDialect().sqlToQuery(probeQuery())
    expect(sql.replace(/\s+/g, " ")).toContain(
      "FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ($1)",
    )
    expect(params).toEqual(["user_preferences"])
  })
})

describe("missingColumns", () => {
  it("is empty when every optional column exists", async () => {
    mockExecute.mockResolvedValue({ rows: ALL })
    expect([...(await missingColumns())]).toEqual([])
  })

  it("reports a column the database lacks, and logs the migration that adds it", async () => {
    mockExecute.mockResolvedValue({ rows: withoutMaxHr })
    expect([...(await missingColumns())]).toEqual(["user_preferences.max_hr"])
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("0009_athlete_max_hr"))
  })

  it("probes once per process when the schema is complete", async () => {
    mockExecute.mockResolvedValue({ rows: ALL })
    await missingColumns()
    await missingColumns()
    await missingColumns()
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it("re-probes an incomplete schema after a minute, so a migration applied by hand is picked up", async () => {
    vi.useFakeTimers()
    mockExecute.mockResolvedValueOnce({ rows: withoutMaxHr }).mockResolvedValueOnce({ rows: ALL })

    expect((await missingColumns()).size).toBe(1)
    vi.advanceTimersByTime(30_000)
    expect((await missingColumns()).size).toBe(1) // still cached
    vi.advanceTimersByTime(31_000)
    expect((await missingColumns()).size).toBe(0) // re-probed
    expect(mockExecute).toHaveBeenCalledTimes(2)
  })

  it("does not cache a failed probe — the error propagates and the next call retries", async () => {
    mockExecute.mockRejectedValueOnce(new Error("connection reset")).mockResolvedValueOnce({ rows: ALL })
    await expect(missingColumns()).rejects.toThrow("connection reset")
    expect((await missingColumns()).size).toBe(0)
  })
})

describe("migrationsFor", () => {
  it("deduplicates columns added by the same migration", () => {
    expect(
      migrationsFor(["user_preferences.max_hr", "user_preferences.runner_level", "user_preferences.training_mode"]),
    ).toEqual(["0008_training_mode", "0009_athlete_max_hr"])
  })
})

describe("SchemaDriftError", () => {
  it("names what couldn't be saved and the missing migration", () => {
    const err = new SchemaDriftError(["0009_athlete_max_hr"], "Max heart rate")
    expect(err.message).toBe(
      "Max heart rate can't be saved: the app's database is missing migration 0009_athlete_max_hr.",
    )
  })
})
