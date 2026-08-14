import { describe, it, expect, vi, beforeEach } from "vitest"
import { trainingPlanVersions } from "@/lib/db/schema"
import type { ProgramBlueprint } from "@/lib/plan/blueprint"
import type { PlanJson } from "@/lib/plan/types"

// activateProgram's own logic (version numbering, priorVersionId linkage,
// closing out the replaced version's effective window) is what changed here —
// generateSchedule's internal writes are a separate, already-exercised
// concern, so it's mocked out to keep this test scoped to that logic.
const generateScheduleMock = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/plan/scheduler", () => ({
  generateSchedule: generateScheduleMock,
}))

const tableRows = new Map<unknown, unknown[]>()
function setRows(table: unknown, rows: unknown[]) {
  tableRows.set(table, rows)
}

const updateCalls: Array<{ table: unknown; set: unknown }> = []
const insertCalls: Array<{ table: unknown; values: unknown }> = []

function createChain(rows: unknown[], table: unknown, kind: "select" | "insert" | "update") {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(() => chain)
  chain.limit = self
  chain.set = vi.fn((values: unknown) => {
    if (kind === "update") updateCalls.push({ table, set: values })
    return chain
  })
  chain.values = vi.fn((values: unknown) => {
    if (kind === "insert") insertCalls.push({ table, values })
    return chain
  })
  chain.returning = vi.fn(() => Promise.resolve(rows))
  chain.then = (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(rows).then(resolve, reject)
  return chain
}

const mockSelect = vi.fn(() => ({
  from: vi.fn((table: unknown) => createChain(tableRows.get(table) ?? [], table, "select")),
}))
// Insert-returning is intentionally decoupled from tableRows (which seeds the
// prior-version *lookup*) — otherwise a seeded "old-version" row would also
// be echoed back as the newly-inserted row's id, masking exactly the bug
// these tests exist to catch (the new version must never equal the old one).
const mockInsert = vi.fn((table: unknown) => createChain([{ id: "new-version" }], table, "insert"))
const mockUpdate = vi.fn((table: unknown) => createChain([], table, "update"))
const mockDelete = vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) }))

vi.mock("@/lib/db", () => ({
  db: { select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete },
}))

const { activateProgram } = await import("./program.service")

const USER_ID = "user-1"

function blueprint(): ProgramBlueprint {
  return {
    planName: "Test Plan",
    summary: "A test program.",
    cycleWeeks: [{ id: "a", label: "A", days: [{ weekday: "Monday", sessionKinds: ["easy"] }] }],
    progressionBlocks: [],
    notes: [],
  }
}

function planJson(): PlanJson {
  return {
    version: 1,
    cycleWeeks: [
      {
        id: "a",
        label: "A",
        days: [
          { weekday: "Monday", sessions: [{ sessionKind: "easy", label: "Easy", prescription: "Easy run", isRunSession: true, isStrengthSession: false }] },
          { weekday: "Tuesday", sessions: [] },
          { weekday: "Wednesday", sessions: [] },
          { weekday: "Thursday", sessions: [] },
          { weekday: "Friday", sessions: [] },
          { weekday: "Saturday", sessions: [] },
          { weekday: "Sunday", sessions: [] },
        ],
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  tableRows.clear()
  updateCalls.length = 0
  insertCalls.length = 0
  generateScheduleMock.mockClear()
})

describe("activateProgram", () => {
  it("starts at version 1 with no priorVersionId when the athlete has no plan yet", async () => {
    setRows(trainingPlanVersions, []) // no existing version

    await activateProgram(USER_ID, blueprint(), planJson(), "2026-08-17", "UTC", null)

    const versionInsert = insertCalls.find((c) => c.table === trainingPlanVersions)
    expect(versionInsert?.values).toMatchObject({ versionNumber: 1, priorVersionId: null })
    expect(updateCalls.filter((c) => c.table === trainingPlanVersions)).toHaveLength(0)
  })

  it("links priorVersionId and increments the version number when replacing an existing plan", async () => {
    setRows(trainingPlanVersions, [{ id: "old-version", versionNumber: 3 }])

    await activateProgram(USER_ID, blueprint(), planJson(), "2026-08-17", "UTC", null)

    const versionInsert = insertCalls.find((c) => c.table === trainingPlanVersions)
    expect(versionInsert?.values).toMatchObject({ versionNumber: 4, priorVersionId: "old-version" })
  })

  it("closes out the replaced version's effective window at the new start date", async () => {
    setRows(trainingPlanVersions, [{ id: "old-version", versionNumber: 1 }])

    await activateProgram(USER_ID, blueprint(), planJson(), "2026-08-17", "UTC", null)

    const closeOut = updateCalls.find((c) => c.table === trainingPlanVersions)
    expect(closeOut?.set).toEqual({ effectiveUntil: "2026-08-17" })
  })

  it("only generates forward schedule under the new version, never touching the old one", async () => {
    setRows(trainingPlanVersions, [{ id: "old-version", versionNumber: 1 }])

    const result = await activateProgram(USER_ID, blueprint(), planJson(), "2026-08-17", "UTC", null)

    expect(generateScheduleMock).toHaveBeenCalledTimes(1)
    expect(generateScheduleMock.mock.calls[0][1]).toBe(result.planVersionId)
    expect(generateScheduleMock.mock.calls[0][1]).not.toBe("old-version")
  })
})
