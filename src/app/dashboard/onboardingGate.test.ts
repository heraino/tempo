import { describe, it, expect } from "vitest"
import { needsOnboarding } from "./onboardingGate"

describe("needsOnboarding", () => {
  it("sends a program athlete with no plan to onboarding", () => {
    expect(needsOnboarding({ hasSchedule: false, scheduleFailed: false, trainingMode: "goal_program" })).toBe(true)
  })

  it("keeps an athlete with a plan on the dashboard", () => {
    expect(needsOnboarding({ hasSchedule: true, scheduleFailed: false, trainingMode: "goal_program" })).toBe(false)
  })

  it("keeps a just-run athlete on the dashboard, since they have no plan by design", () => {
    expect(needsOnboarding({ hasSchedule: false, scheduleFailed: false, trainingMode: "just_run" })).toBe(false)
  })

  it("never redirects when the schedule failed to load", () => {
    expect(needsOnboarding({ hasSchedule: false, scheduleFailed: true, trainingMode: "goal_program" })).toBe(false)
  })

  it("never redirects when preferences failed to load and the mode is unknown", () => {
    expect(needsOnboarding({ hasSchedule: false, scheduleFailed: false, trainingMode: null })).toBe(false)
  })
})
