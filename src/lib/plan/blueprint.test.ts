import { describe, it, expect } from "vitest"
import {
  blueprintToPlanJson,
  summarizeBlueprint,
  checkBlueprintSafety,
  BlueprintError,
  ALL_WEEKDAYS,
  type ProgramBlueprint,
} from "./blueprint"
import { planJsonSchema } from "@/lib/validation/plan"

function blueprint(overrides: Partial<ProgramBlueprint> = {}): ProgramBlueprint {
  return {
    planName: "Road to 5K",
    summary: "A gentle build toward a continuous 5K.",
    cycleWeeks: [
      {
        id: "build",
        label: "Build",
        days: [
          { weekday: "Tuesday", sessionKinds: ["easy"] },
          { weekday: "Thursday", sessionKinds: ["tempo"] },
          { weekday: "Sunday", sessionKinds: ["long"] },
        ],
      },
      {
        id: "cutback",
        label: "Cutback",
        isCutback: true,
        days: [
          { weekday: "Tuesday", sessionKinds: ["easy"] },
          { weekday: "Sunday", sessionKinds: ["easy"] },
        ],
      },
    ],
    progressionBlocks: [
      { blockNumber: 1, buildMinMi: 12, buildMaxMi: 16, cutbackMinMi: 9, cutbackMaxMi: 12 },
    ],
    notes: ["Keep easy runs genuinely easy."],
    ...overrides,
  }
}

describe("blueprintToPlanJson", () => {
  it("produces a plan that passes plan validation", () => {
    const plan = blueprintToPlanJson(blueprint())
    expect(() => planJsonSchema.parse(plan)).not.toThrow()
  })

  it("fills every cycle week out to all seven weekdays", () => {
    const plan = blueprintToPlanJson(blueprint())
    for (const week of plan.cycleWeeks) {
      expect(week.days).toHaveLength(7)
      expect(week.days.map((d) => d.weekday)).toEqual(ALL_WEEKDAYS)
    }
  })

  it("turns unlisted weekdays into empty (rest) days", () => {
    const plan = blueprintToPlanJson(blueprint())
    const monday = plan.cycleWeeks[0].days.find((d) => d.weekday === "Monday")!
    expect(monday.sessions).toHaveLength(0)
  })

  it("expands a bare session kind into a full template", () => {
    const plan = blueprintToPlanJson(blueprint())
    const tuesday = plan.cycleWeeks[0].days.find((d) => d.weekday === "Tuesday")!
    expect(tuesday.sessions[0]).toMatchObject({
      sessionKind: "easy",
      isRunSession: true,
      isStrengthSession: false,
    })
    expect(tuesday.sessions[0].label.length).toBeGreaterThan(0)
    expect(tuesday.sessions[0].prescription.length).toBeGreaterThan(0)
  })

  it("sets run and strength flags from the session kind", () => {
    const plan = blueprintToPlanJson(
      blueprint({
        cycleWeeks: [
          {
            id: "a",
            label: "A",
            days: [{ weekday: "Monday", sessionKinds: ["strength"] }],
          },
        ],
      }),
    )
    const monday = plan.cycleWeeks[0].days.find((d) => d.weekday === "Monday")!
    expect(monday.sessions[0].isRunSession).toBe(false)
    expect(monday.sessions[0].isStrengthSession).toBe(true)
  })

  it("drops explicit 'rest' entries rather than creating a rest session", () => {
    const plan = blueprintToPlanJson(
      blueprint({
        cycleWeeks: [
          {
            id: "a",
            label: "A",
            days: [{ weekday: "Monday", sessionKinds: ["rest"] }],
          },
        ],
      }),
    )
    const monday = plan.cycleWeeks[0].days.find((d) => d.weekday === "Monday")!
    expect(monday.sessions).toHaveLength(0)
  })

  it("supports multiple sessions on one day", () => {
    const plan = blueprintToPlanJson(
      blueprint({
        cycleWeeks: [
          {
            id: "a",
            label: "A",
            days: [{ weekday: "Monday", sessionKinds: ["easy", "strength"] }],
          },
        ],
      }),
    )
    const monday = plan.cycleWeeks[0].days.find((d) => d.weekday === "Monday")!
    expect(monday.sessions).toHaveLength(2)
  })

  it("preserves the cutback flag", () => {
    const plan = blueprintToPlanJson(blueprint())
    expect(plan.cycleWeeks[0].isCutback).toBeUndefined()
    expect(plan.cycleWeeks[1].isCutback).toBe(true)
  })

  it("carries progression blocks through", () => {
    const plan = blueprintToPlanJson(blueprint())
    expect(plan.progressionBlocks).toHaveLength(1)
    expect(plan.progressionBlocks![0].buildMaxMi).toBe(16)
  })

  it("omits progressionBlocks entirely when there are none", () => {
    const plan = blueprintToPlanJson(blueprint({ progressionBlocks: [] }))
    expect(plan.progressionBlocks).toBeUndefined()
    expect(() => planJsonSchema.parse(plan)).not.toThrow()
  })

  it("rejects a blueprint with no cycle weeks", () => {
    expect(() => blueprintToPlanJson(blueprint({ cycleWeeks: [] }))).toThrow(BlueprintError)
  })

  it("rejects duplicate cycle week ids", () => {
    expect(() =>
      blueprintToPlanJson(
        blueprint({
          cycleWeeks: [
            { id: "a", label: "A", days: [] },
            { id: "a", label: "Also A", days: [] },
          ],
        }),
      ),
    ).toThrow(/Duplicate cycle week id/)
  })

  it("rejects a weekday listed twice in one cycle week", () => {
    expect(() =>
      blueprintToPlanJson(
        blueprint({
          cycleWeeks: [
            {
              id: "a",
              label: "A",
              days: [
                { weekday: "Monday", sessionKinds: ["easy"] },
                { weekday: "Monday", sessionKinds: ["long"] },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/more than once/)
  })
})

describe("summarizeBlueprint", () => {
  it("counts run, rest, and quality days per week", () => {
    const [build, cutback] = summarizeBlueprint(blueprint())
    expect(build.runDays).toBe(3)
    expect(build.restDays).toBe(4)
    expect(build.qualityDays).toBe(1) // the tempo session
    expect(cutback.runDays).toBe(2)
    expect(cutback.isCutback).toBe(true)
  })

  it("does not count strength-only days as run days", () => {
    const [week] = summarizeBlueprint(
      blueprint({
        cycleWeeks: [
          {
            id: "a",
            label: "A",
            days: [{ weekday: "Monday", sessionKinds: ["strength"] }],
          },
        ],
      }),
    )
    expect(week.runDays).toBe(0)
    expect(week.restDays).toBe(6)
  })
})

describe("checkBlueprintSafety", () => {
  it("passes a sane program", () => {
    expect(checkBlueprintSafety(blueprint())).toEqual([])
  })

  it("flags more than three hard sessions in a week", () => {
    const warnings = checkBlueprintSafety(
      blueprint({
        cycleWeeks: [
          {
            id: "a",
            label: "A",
            days: [
              { weekday: "Monday", sessionKinds: ["tempo"] },
              { weekday: "Tuesday", sessionKinds: ["threshold"] },
              { weekday: "Thursday", sessionKinds: ["tempo"] },
              { weekday: "Saturday", sessionKinds: ["threshold"] },
            ],
          },
        ],
      }),
    )
    expect(warnings.map((w) => w.code)).toContain("too_much_intensity")
  })

  it("flags a week with no rest day", () => {
    const warnings = checkBlueprintSafety(
      blueprint({
        cycleWeeks: [
          {
            id: "a",
            label: "A",
            days: ALL_WEEKDAYS.map((weekday) => ({
              weekday,
              sessionKinds: ["easy" as const],
            })),
          },
        ],
      }),
    )
    expect(warnings.map((w) => w.code)).toContain("no_rest_day")
  })

  it("holds beginners to a lower intensity ceiling", () => {
    const aggressive = blueprint({
      cycleWeeks: [
        {
          id: "a",
          label: "A",
          days: [
            { weekday: "Tuesday", sessionKinds: ["tempo"] },
            { weekday: "Thursday", sessionKinds: ["threshold"] },
            { weekday: "Saturday", sessionKinds: ["tempo"] },
          ],
        },
      ],
    })
    expect(checkBlueprintSafety(aggressive, { runnerLevel: "intermediate" }).map((w) => w.code))
      .not.toContain("beginner_intensity")
    expect(checkBlueprintSafety(aggressive, { runnerLevel: "beginner" }).map((w) => w.code))
      .toContain("beginner_intensity")
  })

  it("flags an opening volume far above current mileage", () => {
    const warnings = checkBlueprintSafety(blueprint(), { currentWeeklyMi: 8 })
    expect(warnings.map((w) => w.code)).toContain("volume_jump")
  })

  it("accepts an opening volume within reach", () => {
    const warnings = checkBlueprintSafety(blueprint(), { currentWeeklyMi: 14 })
    expect(warnings.map((w) => w.code)).not.toContain("volume_jump")
  })

  it("ignores the volume check when current mileage is unknown", () => {
    expect(checkBlueprintSafety(blueprint(), { currentWeeklyMi: null })).toEqual([])
  })

  it("flags an inverted mileage range", () => {
    const warnings = checkBlueprintSafety(
      blueprint({
        progressionBlocks: [
          { blockNumber: 1, buildMinMi: 20, buildMaxMi: 15, cutbackMinMi: 9, cutbackMaxMi: 12 },
        ],
      }),
    )
    expect(warnings.map((w) => w.code)).toContain("inverted_range")
  })

  it("flags cutback weeks that are not lighter than build weeks", () => {
    const warnings = checkBlueprintSafety(
      blueprint({
        progressionBlocks: [
          { blockNumber: 1, buildMinMi: 12, buildMaxMi: 16, cutbackMinMi: 16, cutbackMaxMi: 20 },
        ],
      }),
    )
    expect(warnings.map((w) => w.code)).toContain("cutback_not_lighter")
  })
})
