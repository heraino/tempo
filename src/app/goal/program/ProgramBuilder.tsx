"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { buildProgram, startProgram, saveProgramInputs } from "../program-actions"
import type { GeneratedProgram } from "@/lib/services/program.service"

const WEEKDAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const

const KIND_CHIP: Record<string, string> = {
  easy: "bg-green-50 text-green-700",
  recovery: "bg-gray-100 text-gray-500",
  long: "bg-blue-50 text-blue-700",
  tempo: "bg-orange-50 text-orange-700",
  threshold: "bg-red-50 text-red-700",
  progression: "bg-amber-50 text-amber-700",
  strides: "bg-purple-50 text-purple-700",
  strength: "bg-indigo-50 text-indigo-700",
  elastic: "bg-teal-50 text-teal-700",
}

interface Props {
  units: "imperial" | "metric"
  defaults: {
    runnerLevel: string | null
    daysPerWeek: number | null
    longRunDay: string | null
    currentWeeklyMi: number | null
    longestRecentRunMi: number | null
  }
  hasGoal: boolean
  /** When true, starting this program replaces an already-active one. */
  hasExistingPlan?: boolean
}

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
const labelCls =
  "block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5"

export function ProgramBuilder({ units, defaults, hasGoal, hasExistingPlan }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [program, setProgram] = useState<GeneratedProgram | null>(null)
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const [confirmingReplace, setConfirmingReplace] = useState(false)

  const [runnerLevel, setRunnerLevel] = useState(defaults.runnerLevel ?? "beginner")
  const [daysPerWeek, setDaysPerWeek] = useState(String(defaults.daysPerWeek ?? 3))
  const [longRunDay, setLongRunDay] = useState(defaults.longRunDay ?? "Sunday")
  const [weeklyMi, setWeeklyMi] = useState(
    defaults.currentWeeklyMi != null ? defaults.currentWeeklyMi.toFixed(0) : "",
  )
  const [longestRun, setLongestRun] = useState(
    defaults.longestRecentRunMi != null ? defaults.longestRecentRunMi.toFixed(1) : "",
  )

  const distanceUnit = units === "metric" ? "km" : "mi"

  function currentInputs() {
    const parsedWeekly = parseFloat(weeklyMi)
    const parsedLongest = parseFloat(longestRun)
    return {
      runnerLevel,
      daysPerWeek: parseInt(daysPerWeek, 10),
      longRunDay: longRunDay || null,
      currentWeeklyMi: isNaN(parsedWeekly) ? null : parsedWeekly,
      longestRecentRunMi: isNaN(parsedLongest) ? null : parsedLongest,
    }
  }

  function generate(withFeedback?: string) {
    setError(null)
    setConfirmingReplace(false)
    startTransition(async () => {
      const inputs = currentInputs()
      try {
        const result = await buildProgram(inputs, withFeedback ?? null)
        if (result.ok && result.program) {
          setProgram(result.program)
          setShowFeedback(false)
          setFeedback("")
          void saveProgramInputs(inputs)
        } else {
          setError(result.error ?? "Could not build a program")
        }
      } catch {
        setError("The coach is taking too long to respond. Try again in a moment.")
      }
    })
  }

  function handleStartClick() {
    if (hasExistingPlan && !confirmingReplace) {
      setConfirmingReplace(true)
      return
    }
    accept()
  }

  function accept() {
    if (!program) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await startProgram(program.blueprint)
        if (result.ok) router.push("/dashboard")
        else setError(result.error ?? "Could not start that program")
      } catch {
        setError("Could not start that program. Try again in a moment.")
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Inputs */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">A few things about you</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            This is all your coach needs to design a program.
          </p>
        </div>

        <div>
          <label className={labelCls}>Where are you as a runner?</label>
          <div className="grid gap-2">
            {[
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
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRunnerLevel(opt.value)}
                className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                  runnerLevel === opt.value
                    ? "border-orange-400 bg-orange-50"
                    : "border-gray-200 hover:border-orange-200"
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    runnerLevel === opt.value ? "text-orange-700" : "text-gray-800"
                  }`}
                >
                  {opt.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{opt.detail}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Days per week</label>
            <select
              value={daysPerWeek}
              onChange={(e) => setDaysPerWeek(e.target.value)}
              className={inputCls}
            >
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Long run day</label>
            <select
              value={longRunDay}
              onChange={(e) => setLongRunDay(e.target.value)}
              className={inputCls}
            >
              <option value="">No preference</option>
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Weekly {distanceUnit} now</label>
            <input
              type="number"
              value={weeklyMi}
              onChange={(e) => setWeeklyMi(e.target.value)}
              step="1"
              min="0"
              placeholder="e.g. 12"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Longest recent run</label>
            <input
              type="number"
              value={longestRun}
              onChange={(e) => setLongestRun(e.target.value)}
              step="0.5"
              min="0"
              placeholder="e.g. 4"
              className={inputCls}
            />
          </div>
        </div>
        {defaults.currentWeeklyMi != null && (
          <p className="text-xs text-gray-400">
            Pre-filled from your recent training — adjust if it doesn&apos;t look right.
          </p>
        )}

        <button
          type="button"
          onClick={() => generate()}
          disabled={isPending}
          className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {isPending && !program
            ? "Designing your program…"
            : program
            ? "Start over with these answers"
            : "Build my program"}
        </button>

        {!hasGoal && (
          <p className="text-xs text-gray-400 text-center">
            No goal set — your coach will build a general base program.
          </p>
        )}
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </section>

      {/* Preview */}
      {program && (
        <>
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-1">
              Your program
            </p>
            <h2 className="text-xl font-bold text-gray-900">
              {program.blueprint.planName}
            </h2>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              {program.blueprint.summary}
            </p>

            {program.blueprint.notes.length > 0 && (
              <ul className="mt-4 pt-4 border-t border-gray-50 space-y-2">
                {program.blueprint.notes.map((n, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-orange-400 shrink-0">•</span>
                    <span className="leading-relaxed">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {program.warnings.length > 0 && (
            <section className="bg-amber-50 rounded-2xl border border-amber-200 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
                Worth a look before you start
              </p>
              <ul className="space-y-1.5">
                {program.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-amber-800 leading-relaxed">
                    {w.message}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-700 mt-3">
                You can ask for a change below, or start anyway if this suits you.
              </p>
            </section>
          )}

          {/* Week-by-week */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              The repeating cycle
            </h2>
            {program.weekSummaries.map((week) => (
              <div
                key={week.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
              >
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{week.label}</p>
                  {week.isCutback && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-50 text-blue-600 rounded-full px-2 py-0.5">
                      Cutback
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {week.runDays} run{week.runDays === 1 ? "" : "s"} · {week.restDays} rest
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {week.sessionsByDay.map((day) => (
                    <div key={day.weekday} className="text-center">
                      <p className="text-[9px] font-semibold uppercase text-gray-400 mb-1">
                        {day.weekday.slice(0, 3)}
                      </p>
                      <div className="space-y-0.5">
                        {day.kinds.length === 0 ? (
                          <div className="h-5 rounded bg-gray-50" />
                        ) : (
                          day.kinds.map((k, i) => (
                            <div
                              key={i}
                              className={`text-[8px] font-semibold rounded px-0.5 py-1 leading-tight ${
                                KIND_CHIP[k] ?? "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {k.slice(0, 5)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {program.blueprint.progressionBlocks.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-3">
                  Weekly mileage progression
                </p>
                <div className="space-y-2">
                  {program.blueprint.progressionBlocks.map((b) => (
                    <div
                      key={b.blockNumber}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-500">Block {b.blockNumber}</span>
                      <span className="text-gray-800 font-medium tabular-nums">
                        {b.buildMinMi}–{b.buildMaxMi} mi
                        <span className="text-gray-300"> · </span>
                        <span className="text-gray-400 font-normal">
                          cutback {b.cutbackMinMi}–{b.cutbackMaxMi}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Feedback + accept */}
          <section className="space-y-3">
            {showFeedback ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <label className={labelCls}>What would you change?</label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  placeholder="e.g. I can't run on Wednesdays, or this feels like too much too soon"
                  className={`${inputCls} resize-none`}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => generate(feedback)}
                    disabled={isPending || feedback.trim().length === 0}
                    className="flex-1 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? "Revising…" : "Revise the program"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFeedback(false)}
                    className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowFeedback(true)}
                disabled={isPending}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-600 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50 transition-colors"
              >
                Ask for a change
              </button>
            )}

            {confirmingReplace ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800">
                  This replaces your current training plan.
                </p>
                <p className="text-xs text-amber-700">
                  Your workout history and everything you&apos;ve already completed stay
                  exactly as they are — only the upcoming schedule changes.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={accept}
                    disabled={isPending}
                    className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? "Replacing…" : "Yes, replace my plan"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingReplace(false)}
                    disabled={isPending}
                    className="rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartClick}
                disabled={isPending}
                className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Starting…" : "Start this program"}
              </button>
            )}
            <p className="text-xs text-gray-400 text-center">
              Your schedule starts next Monday. You can change any session later.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
