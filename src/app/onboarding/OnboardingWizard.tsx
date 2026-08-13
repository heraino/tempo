"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { saveDetectedTimezone, completeJustRunOnboarding, signOutAction } from "./actions"
import { GoalForm } from "@/app/goal/GoalForm"
import { ProgramBuilder } from "@/app/goal/program/ProgramBuilder"

type RunnerLevel = "beginner" | "intermediate"
type TrainingMode = "just_run" | "goal_program"
type Step = "path" | "justRun" | "goal" | "program"

interface Props {
  units: "imperial" | "metric"
  kpiDefaults: {
    currentWeeklyMi: number | null
    longestRecentRunMi: number | null
  }
}

const LEVEL_OPTIONS: Array<{ value: RunnerLevel; title: string; detail: string }> = [
  {
    value: "beginner",
    title: "Beginner",
    detail: "New to running, or coming back after a long break",
  },
  {
    value: "intermediate",
    title: "Intermediate",
    detail: "Running consistently and comfortable with structured sessions",
  },
]

const MODE_OPTIONS: Array<{ value: TrainingMode; title: string; detail: string }> = [
  {
    value: "just_run",
    title: "Just run",
    detail: "Track workouts and get coaching insights. No assigned schedule.",
  },
  {
    value: "goal_program",
    title: "Build a training program",
    detail: "Your coach designs a plan around a goal. You review it before it starts.",
  },
]

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
const labelCls =
  "block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5"

function OptionCard<T extends string>({
  value,
  title,
  detail,
  selected,
  onSelect,
}: {
  value: T
  title: string
  detail: string
  selected: boolean
  onSelect: (v: T) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`text-left rounded-xl border px-4 py-3 transition-colors ${
        selected ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-orange-200"
      }`}
    >
      <p className={`text-sm font-semibold ${selected ? "text-orange-700" : "text-gray-800"}`}>
        {title}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">{detail}</p>
    </button>
  )
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    </div>
  )
}

export function OnboardingWizard({ units, kpiDefaults }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("path")
  const [level, setLevel] = useState<RunnerLevel | null>(null)
  const [mode, setMode] = useState<TrainingMode | null>(null)
  const [daysPerWeek, setDaysPerWeek] = useState("3")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Detect and persist the browser timezone once, silently — no question asked.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) void saveDetectedTimezone(tz)
  }, [])

  function continueFromPath() {
    if (!level || !mode) return
    setStep(mode === "just_run" ? "justRun" : "goal")
  }

  function finishJustRun() {
    if (!level) return
    setError(null)
    startTransition(async () => {
      const result = await completeJustRunOnboarding({
        runnerLevel: level,
        daysPerWeek: parseInt(daysPerWeek, 10),
      })
      if (result.ok) router.push("/dashboard")
      else setError(result.error ?? "Could not save — try again")
    })
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">

        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
            Getting started
          </p>
          <form action={signOutAction}>
            <button type="submit" className="text-sm text-gray-400 hover:text-gray-600">
              Sign out
            </button>
          </form>
        </div>

        {step === "path" && (
          <div className="space-y-6">
            <StepHeader
              title="Welcome to Tempo"
              subtitle="Two quick questions and you're set."
            />

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div>
                <label className={labelCls}>Where are you as a runner?</label>
                <div className="grid gap-2">
                  {LEVEL_OPTIONS.map((opt) => (
                    <OptionCard
                      key={opt.value}
                      value={opt.value}
                      title={opt.title}
                      detail={opt.detail}
                      selected={level === opt.value}
                      onSelect={setLevel}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>What do you want from Tempo?</label>
                <div className="grid gap-2">
                  {MODE_OPTIONS.map((opt) => (
                    <OptionCard
                      key={opt.value}
                      value={opt.value}
                      title={opt.title}
                      detail={opt.detail}
                      selected={mode === opt.value}
                      onSelect={setMode}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={continueFromPath}
                disabled={!level || !mode}
                className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
              >
                Continue
              </button>
            </section>
          </div>
        )}

        {step === "justRun" && (
          <div className="space-y-6">
            <StepHeader
              title="One last thing"
              subtitle="This just helps your coach calibrate — no schedule gets created."
            />

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div>
                <label className={labelCls}>How many days a week do you want to run?</label>
                <select
                  value={daysPerWeek}
                  onChange={(e) => setDaysPerWeek(e.target.value)}
                  className={inputCls}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n} day{n === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("path")}
                  className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={finishJustRun}
                  disabled={isPending}
                  className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Saving…" : "Start running"}
                </button>
              </div>
            </section>
          </div>
        )}

        {step === "goal" && (
          <div className="space-y-6">
            <StepHeader
              title="What are you training for?"
              subtitle="Your coach designs the program around this."
            />
            <button
              type="button"
              onClick={() => setStep("path")}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <GoalForm initial={null} units={units} onSaved={() => setStep("program")} />
            </section>
          </div>
        )}

        {step === "program" && (
          <div className="space-y-6">
            <StepHeader
              title="Build your program"
              subtitle="Your coach designs it, you review it before anything starts."
            />
            <button
              type="button"
              onClick={() => setStep("goal")}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              ← Back to goal
            </button>
            <ProgramBuilder
              units={units}
              hasGoal
              defaults={{
                runnerLevel: level,
                daysPerWeek: null,
                longRunDay: null,
                currentWeeklyMi: kpiDefaults.currentWeeklyMi,
                longestRecentRunMi: kpiDefaults.longestRecentRunMi,
              }}
            />
          </div>
        )}

      </div>
    </main>
  )
}
