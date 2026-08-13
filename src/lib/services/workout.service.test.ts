import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  workoutLogs,
  trainingPlanVersions,
  trainingPlans,
  userPreferences,
  plannedWorkoutDays,
  plannedSessions,
  sessionCompletions,
} from "@/lib/db/schema"

// ─── Table-routed DB mock ───────────────────────────────────────────────────
// createWorkout's plan reconciliation chains through plan.service.ts and
// completion.service.ts, each issuing several sequential queries against
// different tables. Rather than an order-dependent mockResolvedValueOnce
// chain (fragile — breaks the moment call order shifts), each chain call is
// routed by the actual schema table object it targets, exactly as the real
// db does. Table objects are imported unmocked, so identity comparison works.

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
  // Makes `await chain` (without a terminal .returning()) resolve to `rows`,
  // matching real query builders — several call sites await directly after
  // .where()/.limit() with no explicit terminal method.
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
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
  },
}))

const { createWorkout } = await import("./workout.service")

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = "user-1"
const WORKOUT_ROW = {
  id: "workout-1",
  userId: USER_ID,
  sport: "running",
  startTime: new Date("2026-08-13T14:00:00.000Z"), // 2026-08-13 in UTC/most US zones
}

const ACTIVE_PLAN_VERSION = {
  id: "plan-version-1",
  userId: USER_ID,
  versionNumber: 1,
}

const PLANNED_DAY = { id: "day-1" }

const PLANNED_RUN_SESSION = {
  id: "session-1",
  userId: USER_ID,
  plannedDayId: "day-1",
  isRunSession: true,
  status: "planned",
  sequenceInDay: 1,
}

function setHappyPathPlan() {
  setRows(trainingPlanVersions, [ACTIVE_PLAN_VERSION])
  setRows(userPreferences, [{ timezone: "UTC" }])
  setRows(plannedWorkoutDays, [PLANNED_DAY])
  setRows(plannedSessions, [PLANNED_RUN_SESSION])
}

beforeEach(() => {
  vi.clearAllMocks()
  tableRows.clear()
  setRows(workoutLogs, [WORKOUT_ROW])
})

describe("createWorkout — plan reconciliation", () => {
  it("marks the matching planned session completed and links the workout", async () => {
    setHappyPathPlan()

    const result = await createWorkout(WORKOUT_ROW as never)

    expect(result).toEqual(WORKOUT_ROW)
    expect(mockUpdate).toHaveBeenCalledWith(plannedSessions)
    expect(mockInsert).toHaveBeenCalledWith(sessionCompletions)
  })

  it("does nothing when the sport is not a running sport", async () => {
    setHappyPathPlan()
    setRows(workoutLogs, [{ ...WORKOUT_ROW, sport: "cycling" }])

    await createWorkout({ ...WORKOUT_ROW, sport: "cycling" } as never)

    expect(mockUpdate).not.toHaveBeenCalledWith(plannedSessions)
    expect(mockInsert).not.toHaveBeenCalledWith(sessionCompletions)
  })

  it("does nothing when the athlete has no plan at all (e.g. 'just run' mode)", async () => {
    setRows(trainingPlanVersions, [])
    setRows(trainingPlans, [])

    const result = await createWorkout(WORKOUT_ROW as never)

    expect(result).toEqual(WORKOUT_ROW)
    expect(mockUpdate).not.toHaveBeenCalledWith(plannedSessions)
    expect(mockInsert).not.toHaveBeenCalledWith(sessionCompletions)
  })

  it("does nothing when the schedule has no entry for that date", async () => {
    setRows(trainingPlanVersions, [ACTIVE_PLAN_VERSION])
    setRows(userPreferences, [{ timezone: "UTC" }])
    setRows(plannedWorkoutDays, []) // no day generated for this date

    await createWorkout(WORKOUT_ROW as never)

    expect(mockUpdate).not.toHaveBeenCalledWith(plannedSessions)
  })

  it("does nothing when every session that day is already completed or skipped", async () => {
    setRows(trainingPlanVersions, [ACTIVE_PLAN_VERSION])
    setRows(userPreferences, [{ timezone: "UTC" }])
    setRows(plannedWorkoutDays, [PLANNED_DAY])
    // The real query filters on status="planned" — a day with only completed
    // sessions returns no rows, which is what this simulates directly (the
    // mock returns raw query results, not unfiltered table contents).
    setRows(plannedSessions, [])

    await createWorkout(WORKOUT_ROW as never)

    expect(mockUpdate).not.toHaveBeenCalledWith(plannedSessions)
  })

  it("still saves the workout when reconciliation itself throws", async () => {
    setRows(trainingPlanVersions, [ACTIVE_PLAN_VERSION])
    setRows(userPreferences, [{ timezone: "UTC" }])
    // findMatchingRunSession's plannedWorkoutDays query throws — this
    // function has no internal try/catch of its own, so it exercises
    // reconcileWithPlan's own catch rather than a callee swallowing it first.
    // Every select is routed the same way regardless of call order, so this
    // doesn't depend on exactly how many queries precede it.
    mockSelect.mockImplementation(() => ({
      from: vi.fn((table: unknown) => {
        if (table === plannedWorkoutDays) throw new Error("connection reset")
        return createChain(tableRows.get(table) ?? [])
      }),
    }))

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const result = await createWorkout(WORKOUT_ROW as never)

    expect(result).toEqual(WORKOUT_ROW)
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
