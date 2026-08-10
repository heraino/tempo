"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { saveGoal } from "./actions"
import {
  GOAL_TYPES,
  GOAL_TYPE_LABELS,
  GOAL_TYPE_DESCRIPTIONS,
  RACE_PRESETS,
  MILESTONE_PRESETS,
  METERS_PER_MILE,
  paceToInputValue,
  durationToInputValue,
  type GoalType,
} from "@/lib/goals/goal"

interface InitialGoal {
  goalType: string
  title: string | null
  targetDate: string | null
  targetDistanceM: number | null
  targetDurationSecs: number | null
  targetPaceMinPerKm: number | null
  targetRunsPerWeek: number | null
  notes: string | null
}

interface Props {
  initial: InitialGoal | null
  units: "imperial" | "metric"
}

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
const labelCls =
  "block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5"

/** Match a stored distance to a preset key, or "custom" when it's non-standard. */
function distanceToPresetKey(
  meters: number | null,
  presets: readonly { key: string; meters: number }[],
): string {
  if (meters == null) return ""
  const match = presets.find((p) => Math.abs(p.meters - meters) < 10)
  return match ? String(match.meters) : "custom"
}

export function GoalForm({ initial, units }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [goalType, setGoalType] = useState<GoalType>(
    (initial?.goalType as GoalType) ?? "race",
  )

  const presets = goalType === "distance_milestone" ? MILESTONE_PRESETS : RACE_PRESETS
  const [distanceKey, setDistanceKey] = useState<string>(() =>
    distanceToPresetKey(initial?.targetDistanceM ?? null, presets),
  )
  const [customDistance, setCustomDistance] = useState<string>(() => {
    const m = initial?.targetDistanceM
    if (m == null) return ""
    const isPreset = presets.some((p) => Math.abs(p.meters - m) < 10)
    if (isPreset) return ""
    return (units === "metric" ? m / 1000 : m / METERS_PER_MILE).toFixed(2)
  })

  const distanceUnitLabel = units === "metric" ? "km" : "mi"
  const paceUnitLabel = units === "metric" ? "min/km" : "min/mi"

  // Which fields are meaningful for the selected goal type
  const showDistance = goalType !== "habit"
  const showDate = goalType !== "habit"
  const showDuration = goalType === "race" || goalType === "distance_at_pace"
  const showPace = goalType === "pace" || goalType === "distance_at_pace"
  const showRuns = goalType === "habit"

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await saveGoal(formData)
      if (result.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        router.refresh()
      } else {
        setError(result.error ?? "Could not save goal")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="units" value={units} />
      <input type="hidden" name="goalType" value={goalType} />

      {/* Goal type */}
      <div>
        <label className={labelCls}>What are you training for?</label>
        <div className="grid gap-2">
          {GOAL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setGoalType(t)}
              className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                goalType === t
                  ? "border-orange-400 bg-orange-50"
                  : "border-gray-200 bg-white hover:border-orange-200"
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  goalType === t ? "text-orange-700" : "text-gray-800"
                }`}
              >
                {GOAL_TYPE_LABELS[t]}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{GOAL_TYPE_DESCRIPTIONS[t]}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Distance */}
      {showDistance && (
        <div>
          <label className={labelCls}>
            {goalType === "pace" ? "At which distance?" : "Target distance"}
          </label>
          <select
            name="targetDistanceM"
            value={distanceKey}
            onChange={(e) => setDistanceKey(e.target.value)}
            className={inputCls}
          >
            <option value="">— choose —</option>
            {presets.map((p) => (
              <option key={p.key} value={String(p.meters)}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom distance…</option>
          </select>

          {distanceKey === "custom" && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                name="customDistance"
                value={customDistance}
                onChange={(e) => setCustomDistance(e.target.value)}
                step="0.01"
                min="0.1"
                placeholder={units === "metric" ? "e.g. 8" : "e.g. 5"}
                className={inputCls}
              />
              <span className="text-sm text-gray-400 shrink-0">{distanceUnitLabel}</span>
            </div>
          )}
        </div>
      )}

      {/* Finish time */}
      {showDuration && (
        <div>
          <label className={labelCls}>
            Target finish time{" "}
            <span className="text-gray-300 font-normal normal-case">(optional)</span>
          </label>
          <input
            type="text"
            name="targetDuration"
            defaultValue={durationToInputValue(initial?.targetDurationSecs)}
            placeholder="1:45:00"
            inputMode="numeric"
            className={inputCls}
          />
          <p className="text-xs text-gray-400 mt-1">
            Leave blank if you just want to finish.
          </p>
        </div>
      )}

      {/* Pace */}
      {showPace && (
        <div>
          <label className={labelCls}>Target pace ({paceUnitLabel})</label>
          <input
            type="text"
            name="targetPace"
            defaultValue={paceToInputValue(initial?.targetPaceMinPerKm ?? null, units)}
            placeholder={units === "metric" ? "5:00" : "8:00"}
            inputMode="numeric"
            className={inputCls}
          />
        </div>
      )}

      {/* Runs per week */}
      {showRuns && (
        <div>
          <label className={labelCls}>Runs per week</label>
          <select
            name="targetRunsPerWeek"
            defaultValue={initial?.targetRunsPerWeek?.toString() ?? "3"}
            className={inputCls}
          >
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}× per week
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Target date */}
      {showDate && (
        <div>
          <label className={labelCls}>
            {goalType === "race" ? "Race date" : "Target date"}{" "}
            <span className="text-gray-300 font-normal normal-case">
              {goalType === "race" ? "" : "(optional)"}
            </span>
          </label>
          <input
            type="date"
            name="targetDate"
            defaultValue={initial?.targetDate ?? ""}
            className={inputCls}
          />
        </div>
      )}

      {/* Name */}
      <div>
        <label className={labelCls}>
          Name this goal{" "}
          <span className="text-gray-300 font-normal normal-case">(optional)</span>
        </label>
        <input
          type="text"
          name="title"
          defaultValue={initial?.title ?? ""}
          placeholder="We'll name it for you if you leave this blank"
          className={inputCls}
        />
      </div>

      {/* Notes */}
      <div>
        <label className={labelCls}>
          Anything else your coach should know{" "}
          <span className="text-gray-300 font-normal normal-case">(optional)</span>
        </label>
        <textarea
          name="notes"
          defaultValue={initial?.notes ?? ""}
          rows={3}
          placeholder="Injury history, time constraints, past bests…"
          className={`${inputCls} resize-none`}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : initial ? "Update goal" : "Set goal"}
        </button>
        {saved && <span className="text-sm font-medium text-green-600">Saved ✓</span>}
      </div>

      {initial && (
        <p className="text-xs text-gray-400 text-center">
          Changing your goal keeps the old one on record — your training history stays intact.
        </p>
      )}
    </form>
  )
}
