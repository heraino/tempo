import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ParseStatus } from "./fitFile.service"

// ─── DB mock ──────────────────────────────────────────────────────────────────
// We mock the entire db module so no Neon connection is needed in unit tests.

const mockReturning = vi.fn()
const mockWhere = vi.fn(() => ({ returning: mockReturning }))
const mockSet = vi.fn(() => ({ where: mockWhere }))
const mockUpdate = vi.fn(() => ({ set: mockSet }))
const mockLimit = vi.fn()
const mockSelectWhere = vi.fn(() => ({ limit: mockLimit }))
const mockFrom = vi.fn(() => ({ where: mockSelectWhere }))
const mockSelect = vi.fn(() => ({ from: mockFrom }))
const mockInsertReturning = vi.fn()
const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}))

// Import after mock is registered
const { updateFitFileParseStatus, createFitFile, findFitFileByUserAndSha256 } =
  await import("./fitFile.service")

// ─── updateFitFileParseStatus ─────────────────────────────────────────────────

describe("updateFitFileParseStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReturning.mockReset()
  })

  it("transitions to 'parsed' with no error message", async () => {
    mockReturning.mockResolvedValue([{ id: "fit-1", parseStatus: "parsed" }])

    const result = await updateFitFileParseStatus("fit-1", "parsed")

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({ parseStatus: "parsed", parseError: null })
    expect(result).toEqual({ id: "fit-1", parseStatus: "parsed" })
  })

  it("transitions to 'failed' and persists the error message", async () => {
    mockReturning.mockResolvedValue([{ id: "fit-2", parseStatus: "failed" }])

    const result = await updateFitFileParseStatus("fit-2", "failed", "Unexpected end of data")

    expect(mockSet).toHaveBeenCalledWith({
      parseStatus: "failed",
      parseError: "Unexpected end of data",
    })
    expect(result).toEqual({ id: "fit-2", parseStatus: "failed" })
  })

  it("transitions to 'workout_save_failed' and persists the error", async () => {
    mockReturning.mockResolvedValue([{ id: "fit-3", parseStatus: "workout_save_failed" }])

    await updateFitFileParseStatus("fit-3", "workout_save_failed", "duplicate key value")

    expect(mockSet).toHaveBeenCalledWith({
      parseStatus: "workout_save_failed",
      parseError: "duplicate key value",
    })
  })

  it("clears parseError when none supplied", async () => {
    mockReturning.mockResolvedValue([{ id: "fit-4", parseStatus: "parsed" }])

    await updateFitFileParseStatus("fit-4", "parsed")

    expect(mockSet).toHaveBeenCalledWith({ parseStatus: "parsed", parseError: null })
  })

  it("returns null when the row is not found", async () => {
    mockReturning.mockResolvedValue([])

    const result = await updateFitFileParseStatus("nonexistent", "parsed")

    expect(result).toBeNull()
  })
})

// ─── ParseStatus type guard ───────────────────────────────────────────────────

describe("ParseStatus type", () => {
  it("covers all four lifecycle states", () => {
    const states: ParseStatus[] = ["pending", "parsed", "failed", "workout_save_failed"]
    expect(states).toHaveLength(4)
  })
})

// ─── createFitFile — default parseStatus ─────────────────────────────────────

describe("createFitFile", () => {
  beforeEach(() => vi.clearAllMocks())

  it("inserts the provided values and returns the first row", async () => {
    const fakeRow = {
      id: "fit-10",
      userId: "user-1",
      sha256: "abc123",
      fileName: "run.fit",
      fileSizeBytes: 1024,
      blobUrl: "local://fit-files/user-1/abc123/run.fit",
      parserVersion: "fit-file-parser@3.0.2/v1",
      parseStatus: "pending",
      parseError: null,
      createdAt: new Date(),
    }
    mockInsertReturning.mockResolvedValue([fakeRow])

    const result = await createFitFile({
      userId: "user-1",
      sha256: "abc123",
      fileName: "run.fit",
      fileSizeBytes: 1024,
      blobUrl: "local://fit-files/user-1/abc123/run.fit",
      parserVersion: "fit-file-parser@3.0.2/v1",
    })

    expect(mockInsert).toHaveBeenCalled()
    expect(result.parseStatus).toBe("pending")
    expect(result.parseError).toBeNull()
  })
})

// ─── findFitFileByUserAndSha256 ───────────────────────────────────────────────

describe("findFitFileByUserAndSha256", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null when no match", async () => {
    mockLimit.mockResolvedValue([])

    const result = await findFitFileByUserAndSha256("user-1", "notfound")

    expect(result).toBeNull()
  })

  it("returns the row when found", async () => {
    const fakeRow = { id: "fit-99", sha256: "abc", parseStatus: "parsed" }
    mockLimit.mockResolvedValue([fakeRow])

    const result = await findFitFileByUserAndSha256("user-1", "abc")

    expect(result).toEqual(fakeRow)
  })
})
