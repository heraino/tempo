"use client"

import { useState, useTransition } from "react"
import { updateWorkoutAnnotations } from "@/app/workout/actions"

interface EditWorkoutPanelProps {
  workoutId: string
  initial: {
    sessionKindOverride: string | null
    perceivedEffort: number | null
    notes: string | null
    outsideTempC: number | null
  }
  units: "imperial" | "metric"
}

function toDisplayTemp(c: number | null, units: "imperial" | "metric"): string {
  if (c == null) return ""
  if (units === "metric") return Math.round(c).toString()
  return Math.round(c * 9 / 5 + 32).toString()
}

const SESSION_KINDS = [
  { value: "", label: "— auto-detect —" },
  { value: "easy", label: "Easy" },
  { value: "long", label: "Long run" },
  { value: "tempo", label: "Tempo" },
  { value: "threshold", label: "Threshold" },
  { value: "recovery", label: "Recovery" },
  { value: "other", label: "Other" },
]

const EFFORT_LABELS: Record<number, string> = {
  1: "1 — Very easy",
  2: "2 — Easy",
  3: "3 — Moderate",
  4: "4 — Hard",
  5: "5 — Very hard",
}

export function EditWorkoutPanel({ workoutId, initial, units }: EditWorkoutPanelProps) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const tempLabel = units === "metric" ? "Outside temp (°C)" : "Outside temp (°F)"
  const initialTemp = toDisplayTemp(initial.outsideTempC, units)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateWorkoutAnnotations(workoutId, formData)
      if (result.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        setError(result.error ?? "Save failed")
      }
    })
  }

  const inputCls = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
  const labelCls = "block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1"

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span>Edit workout details</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4 border-t border-gray-50">
          <input type="hidden" name="tempUnits" value={units} />

          <div className="pt-4">
            <label className={labelCls}>Session type</label>
            <select name="sessionKindOverride" defaultValue={initial.sessionKindOverride ?? ""} className={inputCls}>
              {SESSION_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Perceived effort</label>
            <select name="perceivedEffort" defaultValue={initial.perceivedEffort?.toString() ?? ""} className={inputCls}>
              <option value="">— not set —</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{EFFORT_LABELS[n]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>{tempLabel}</label>
            <input
              type="number"
              name="outsideTempDisplay"
              defaultValue={initialTemp}
              step="1"
              placeholder="e.g. 68"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              name="notes"
              defaultValue={initial.notes ?? ""}
              rows={3}
              placeholder="How did it feel?"
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            {saved && (
              <span className="text-sm font-medium text-green-600">Saved ✓</span>
            )}
            {error && (
              <span className="text-sm text-red-500">{error}</span>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
