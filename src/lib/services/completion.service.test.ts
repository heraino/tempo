import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  workoutLogs,
  sessionCompletions,
  trainingPlanVersions,
  userPreferences,
  plannedWorkoutDays,
  plannedSessions,
} from "@/lib/db/schema"

// Same table-routed mock approach as workout.service.test.ts — see that file
// for the rationale (multiple sequential queries against different tables,
// routed by table identity rather than call order).

const tableRows = new Map<unknown, unknown[]>()
function setRows(table: unknown, rows: unknown[]) {
  tableRows.set(table, rows)
}

function createChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.from = vi.fn((table: unknown) => createChain(tableRows.get(table) ?? []))
  chain.innerJoin = self
  chain.where = self
  chain.orderBy = self
  chain.limit = self
  chain.set = self
  chain.values = self
  chain.onConflictDoNothing = self
  chain.returning = vi.fn(() => Promise.resolve(rows))
  chain.then = (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(rows).then(resolve, reject)
  return chain
}

const mockSelect = vi.fn(() => ({
  from: vi.fn((table: unknown) => createChain(tableRows.get(table) ?? [])),
}))
const mockUpdate = vi.fn((table: unknown) => createChain(tableRows.get(table) ?? []))
const mockInsert = vi.fn((table: unknown) => createChain(tableRows.get(table) ?? []))

vi.mock("@/lib/db", () => ({
  db: { select: mockSelect, update: mockUpdate, insert: mockInsert },
}))

const { backfillPlanReconciliation } = await import("./completion.service")

const USER_ID = "user-1"
const ACTIVE_PLAN_VERSION = { id: "plan-version-1", userId: USER_ID, versionNumber: 1 }
const PLANNED_DAY = { id: "day-1" }
const PLANNED_RUN_SESSION = {
  id: "session-1",
  userId: USER_ID,
  plannedDayId: "day-1",
  isRunSession: true,
  status: "planned",
  sequenceInDay: 1,
}

const RUN_A = { id: "log-a", sport: "running", startTime: new Date("2026-08-10T14:00:00.000Z") }
const RUN_B = { id: "log-b", sport: "running", startTime: new Date("2026-08-11T14:00:00.000Z") }

beforeEach(() => {
  vi.clearAllMocks()
  tableRows.clear()
  setRows(trainingPlanVersions, [ACTIVE_PLAN_VERSION])
  setRows(userPreferences, [{ timezone: "UTC" }])
  setRows(plannedWorkoutDays, [PLANNED_DAY])
  setRows(plannedSessions, [PLANNED_RUN_SESSION])
})

describe("backfillPlanReconciliation", () => {
  it("reports scanned and matched counts for unlinked workouts", async () => {
    setRows(workoutLogs, [RUN_A, RUN_B])
    setRows(sessionCompletions, []) // nothing linked yet

    const result = await backfillPlanReconciliation(USER_ID, new Date("2026-08-01T00:00:00.000Z"))

    expect(result.scanned).toBe(2)
    expect(result.matched).toBeGreaterThan(0)
  })

  it("skips a workout that already has a session_completions row", async () => {
    setRows(workoutLogs, [RUN_A])
    setRows(sessionCompletions, [{ workoutLogId: "log-a" }])

    await backfillPlanReconciliation(USER_ID, new Date("2026-08-01T00:00:00.000Z"))

    // Already-linked workout must not trigger another completeSession write
    expect(mockUpdate).not.toHaveBeenCalledWith(plannedSessions)
  })

  it("is safe to re-run — a second pass finds nothing left to do once fully linked", async () => {
    setRows(workoutLogs, [RUN_A])
    setRows(sessionCompletions, [{ workoutLogId: "log-a" }])

    const result = await backfillPlanReconciliation(USER_ID, new Date("2026-08-01T00:00:00.000Z"))

    expect(result.scanned).toBe(1)
    expect(result.matched).toBe(0)
  })

  it("continues past a per-workout failure instead of aborting the whole backfill", async () => {
    setRows(workoutLogs, [RUN_A, RUN_B])
    setRows(sessionCompletions, [])
    // Every plannedWorkoutDays lookup throws — simulates a per-item failure
    // mode; the backfill must still finish and report what it scanned.
    mockSelect.mockImplementation(() => ({
      from: vi.fn((table: unknown) => {
        if (table === plannedWorkoutDays) throw new Error("connection reset")
        return createChain(tableRows.get(table) ?? [])
      }),
    }))

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const result = await backfillPlanReconciliation(USER_ID, new Date("2026-08-01T00:00:00.000Z"))
    consoleSpy.mockRestore()

    expect(result.scanned).toBe(2)
    expect(result.matched).toBe(0)
  })
})
