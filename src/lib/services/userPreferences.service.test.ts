import { describe, it, expect, vi, beforeEach } from "vitest"

// This test exists because upsertUserPreferences shipped a real production
// bug: it referenced max_hr unconditionally with no fallback, so any settings
// save crashed on a database that hadn't run migration 0009 yet. These tests
// pin down the fallback behavior on both the read and write side.

const mockSelect = vi.fn()
const mockInsert = vi.fn()

vi.mock("@/lib/db", () => ({
  db: { select: mockSelect, insert: mockInsert },
}))

const { getUserPreferences, upsertUserPreferences } = await import("./userPreferences.service")

function selectChain(rows: unknown[]) {
  return { from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(rows)) })) })) }
}

function throwingSelectChain(message: string) {
  return { from: vi.fn(() => { throw new Error(message) }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getUserPreferences", () => {
  it("returns full prefs including maxHr on a fully migrated database", async () => {
    mockSelect.mockReturnValueOnce(selectChain([{
      unitsSystem: "metric", timezone: "UTC", trainingMode: "goal_program",
      runnerLevel: "intermediate", daysPerWeek: 5, longRunDay: "Sunday", maxHr: 185,
    }]))

    const prefs = await getUserPreferences("user-1")

    expect(prefs.maxHr).toBe(185)
    expect(prefs.unitsSystem).toBe("metric")
  })

  it("falls back to pre-0009 columns when max_hr does not exist, defaulting maxHr to null", async () => {
    mockSelect
      .mockReturnValueOnce(throwingSelectChain('column "max_hr" does not exist'))
      .mockReturnValueOnce(selectChain([{
        unitsSystem: "imperial", timezone: null, trainingMode: "just_run",
        runnerLevel: "beginner", daysPerWeek: 3, longRunDay: null,
      }]))

    const prefs = await getUserPreferences("user-1")

    expect(prefs.maxHr).toBeNull()
    expect(prefs.trainingMode).toBe("just_run")
  })

  it("falls back further to pre-0008 columns when those are also missing", async () => {
    mockSelect
      .mockReturnValueOnce(throwingSelectChain('column "max_hr" does not exist'))
      .mockReturnValueOnce(throwingSelectChain('column "training_mode" does not exist'))
      .mockReturnValueOnce(selectChain([{ unitsSystem: "metric", timezone: "America/New_York" }]))

    const prefs = await getUserPreferences("user-1")

    expect(prefs.unitsSystem).toBe("metric")
    expect(prefs.trainingMode).toBe("goal_program") // default, since that tier can't read it
    expect(prefs.maxHr).toBeNull()
  })

  it("returns defaults when the user has no preferences row at all", async () => {
    mockSelect.mockReturnValueOnce(selectChain([]))

    const prefs = await getUserPreferences("user-1")

    expect(prefs).toEqual({
      unitsSystem: "imperial", timezone: null, trainingMode: "goal_program",
      runnerLevel: null, daysPerWeek: null, longRunDay: null, maxHr: null,
    })
  })
})

describe("upsertUserPreferences", () => {
  it("writes maxHr in a single attempt on a fully migrated database", async () => {
    mockInsert.mockReturnValueOnce({
      values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => Promise.resolve()) })),
    })

    await upsertUserPreferences("user-1", { maxHr: 190 })

    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  /** Routes db.insert(...).values(...).onConflictDoUpdate(...) calls to a
   *  per-attempt outcome list, recording every values() payload along the way. */
  function mockCascade(outcomes: Array<"fail" | "succeed">, valuesCalls: unknown[]) {
    let call = 0
    mockInsert.mockImplementation(() => ({
      values: vi.fn((v: unknown) => {
        valuesCalls.push(v)
        const outcome = outcomes[call]
        call++
        return {
          onConflictDoUpdate: vi.fn(() => {
            if (outcome === "fail") throw new Error("column does not exist")
            return Promise.resolve()
          }),
        }
      }),
    }))
  }

  it("retries without maxHr when only migration 0009 is missing, so the rest of the save still succeeds", async () => {
    const valuesCalls: unknown[] = []
    mockCascade(["fail", "succeed"], valuesCalls)

    await expect(
      upsertUserPreferences("user-1", { unitsSystem: "metric", maxHr: 190 })
    ).resolves.toBeUndefined()

    expect(mockInsert).toHaveBeenCalledTimes(2)
    expect(valuesCalls[0]).toHaveProperty("maxHr", 190)
    expect(valuesCalls[1]).not.toHaveProperty("maxHr")
    expect(valuesCalls[1]).toHaveProperty("unitsSystem", "metric")
    expect(valuesCalls[1]).toHaveProperty("trainingMode")
  })

  it("falls back to core columns only when migrations 0008 and 0009 are both missing", async () => {
    const valuesCalls: unknown[] = []
    mockCascade(["fail", "fail", "succeed"], valuesCalls)

    await expect(
      upsertUserPreferences("user-1", { unitsSystem: "metric", trainingMode: "just_run", maxHr: 190 })
    ).resolves.toBeUndefined()

    expect(mockInsert).toHaveBeenCalledTimes(3)
    expect(valuesCalls[2]).not.toHaveProperty("maxHr")
    expect(valuesCalls[2]).not.toHaveProperty("trainingMode")
    expect(valuesCalls[2]).toHaveProperty("unitsSystem", "metric")
  })

  it("propagates the error when even the core-only write fails", async () => {
    const valuesCalls: unknown[] = []
    mockCascade(["fail", "fail", "fail"], valuesCalls)

    await expect(upsertUserPreferences("user-1", { maxHr: 190 })).rejects.toThrow("column does not exist")
    expect(mockInsert).toHaveBeenCalledTimes(3)
  })
})
