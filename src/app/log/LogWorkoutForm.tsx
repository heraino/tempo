"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { uploadWorkout } from "./actions"
import type { UnitsSystem } from "@/lib/services/userPreferences.service"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PainEntry {
  location: string
  side: "" | "left" | "right" | "bilateral" | "none"
  level0to10: number
  character: "" | "ache" | "sharp" | "tight" | "burning" | "fatigue" | "other"
  onset: "" | "during_warmup" | "mid_run" | "post_run" | "at_rest" | "other"
  notes: string
}

function emptyPain(): PainEntry {
  return { location: "", side: "", level0to10: 0, character: "", onset: "", notes: "" }
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function FieldLabel({
  children,
  optional = true,
}: {
  children: React.ReactNode
  optional?: boolean
}) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {children}{" "}
      {optional && <span className="text-gray-400 font-normal">(optional)</span>}
    </label>
  )
}

function inputCls() {
  return "w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
}

function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        {title}
        <svg
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-4 py-4 flex flex-col gap-4">{children}</div>}
    </div>
  )
}

// ─── Pain entry row ───────────────────────────────────────────────────────────

function PainEntryRow({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: PainEntry
  index: number
  onChange: (index: number, field: keyof PainEntry, value: string | number) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="border border-orange-100 rounded-xl p-4 flex flex-col gap-3 bg-orange-50/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-orange-500">
          Area {index + 1}
        </span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-gray-400 hover:text-red-500 text-xs"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <input
            placeholder="Location (e.g. left knee, right hip)"
            value={entry.location}
            onChange={(e) => onChange(index, "location", e.target.value)}
            className={inputCls()}
          />
        </div>

        <select
          value={entry.side}
          onChange={(e) => onChange(index, "side", e.target.value)}
          className={inputCls()}
        >
          <option value="">Side</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="bilateral">Both</option>
          <option value="none">N/A</option>
        </select>

        <select
          value={entry.character}
          onChange={(e) => onChange(index, "character", e.target.value)}
          className={inputCls()}
        >
          <option value="">Type</option>
          <option value="ache">Ache</option>
          <option value="sharp">Sharp</option>
          <option value="tight">Tight</option>
          <option value="burning">Burning</option>
          <option value="fatigue">Fatigue</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Pain level</span>
          <span className="font-semibold text-orange-600">{entry.level0to10}/10</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={entry.level0to10}
          onChange={(e) => onChange(index, "level0to10", parseInt(e.target.value))}
          className="w-full accent-orange-500"
        />
      </div>

      <select
        value={entry.onset}
        onChange={(e) => onChange(index, "onset", e.target.value)}
        className={inputCls()}
      >
        <option value="">When did it start?</option>
        <option value="during_warmup">During warm-up</option>
        <option value="mid_run">Mid-run</option>
        <option value="post_run">After run</option>
        <option value="at_rest">At rest</option>
        <option value="other">Other</option>
      </select>

      <input
        placeholder="Notes (optional)"
        value={entry.notes}
        onChange={(e) => onChange(index, "notes", e.target.value)}
        className={inputCls()}
      />
    </div>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function LogWorkoutForm({ unitsSystem }: { unitsSystem: UnitsSystem }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [painEntries, setPainEntries] = useState<PainEntry[]>([])
  const painJsonRef = useRef<HTMLInputElement>(null)
  const timezoneRef = useRef<HTMLInputElement>(null)

  const isImperial = unitsSystem === "imperial"

  // Capture browser timezone once on mount
  useEffect(() => {
    if (timezoneRef.current) {
      try {
        timezoneRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch {
        // fallback: leave empty
      }
    }
  }, [])

  function updatePain(index: number, field: keyof PainEntry, value: string | number) {
    setPainEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: value } : e))
    )
  }

  function removePain(index: number) {
    setPainEntries((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Serialize pain entries into the hidden field before building FormData
    if (painJsonRef.current) {
      const cleaned = painEntries
        .filter((p) => p.location.trim() !== "")
        .map(({ side, character, onset, ...rest }) => ({
          ...rest,
          ...(side ? { side } : {}),
          ...(character ? { character } : {}),
          ...(onset ? { onset } : {}),
        }))
      painJsonRef.current.value = JSON.stringify(cleaned)
    }

    const formData = new FormData(e.currentTarget)

    // Convert temperature from °F to °C if user is in imperial mode
    if (isImperial) {
      const rawF = parseFloat(formData.get("outsideTempC") as string)
      if (!isNaN(rawF)) {
        formData.set("outsideTempC", String(((rawF - 32) * 5) / 9))
      }
    }

    const result = await uploadWorkout(formData)

    setLoading(false)
    if (result?.error) {
      setError(result.error)
      // If it's a duplicate, offer to navigate to the existing workout
      if ("workoutId" in result && result.workoutId) {
        setTimeout(() => router.push(`/workout/${result.workoutId}`), 2000)
      }
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-white px-6 py-12">
      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-bold text-gray-900">Log a workout</h1>
        <p className="mt-2 text-gray-500">
          Upload your Garmin .fit file (or a .zip containing one).
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          {/* Hidden fields */}
          <input ref={timezoneRef} type="hidden" name="timezone" />
          <input ref={painJsonRef} type="hidden" name="painEntriesJson" defaultValue="[]" />

          {/* File upload */}
          <div>
            <FieldLabel optional={false}>Workout file (.fit or .zip)</FieldLabel>
            <input
              name="fitFile"
              type="file"
              accept=".fit,.zip"
              required
              className="w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-orange-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-orange-600 hover:file:bg-orange-100"
            />
          </div>

          {/* Session kind override */}
          <div>
            <FieldLabel>Workout type</FieldLabel>
            <select name="sessionKindOverride" className={inputCls()}>
              <option value="">Auto-detect</option>
              <option value="easy">Easy</option>
              <option value="long">Long run</option>
              <option value="tempo">Tempo</option>
              <option value="threshold">Threshold</option>
              <option value="recovery">Recovery</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Perceived effort */}
          <div>
            <FieldLabel>Perceived effort (RPE)</FieldLabel>
            <select name="perceivedEffort" className={inputCls()}>
              <option value="">— skip —</option>
              <option value="1">1 — Very easy</option>
              <option value="2">2 — Easy</option>
              <option value="3">3 — Moderate</option>
              <option value="4">4 — Hard</option>
              <option value="5">5 — Very hard</option>
            </select>
          </div>

          {/* Post-run context */}
          <Collapsible title="Conditions &amp; context">
            <div>
              <FieldLabel>How did the run feel overall?</FieldLabel>
              <textarea
                name="feel"
                rows={2}
                placeholder='e.g. "Legs felt heavy in the first mile but opened up"'
                className={`${inputCls()} resize-none`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Outside temp ({isImperial ? "°F" : "°C"})</FieldLabel>
                <input
                  name="outsideTempC"
                  type="number"
                  step="1"
                  min={isImperial ? "-58" : "-50"}
                  max={isImperial ? "140" : "60"}
                  placeholder={isImperial ? "e.g. 65" : "e.g. 18"}
                  className={inputCls()}
                />
              </div>
              <div>
                <FieldLabel>Humidity (%)</FieldLabel>
                <input
                  name="humidityPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  placeholder="e.g. 65"
                  className={inputCls()}
                />
              </div>
            </div>

            <div>
              <FieldLabel>Sleep quality last night</FieldLabel>
              <select name="sleepQuality" className={inputCls()}>
                <option value="">— skip —</option>
                <option value="1">1 — Very poor</option>
                <option value="2">2 — Poor</option>
                <option value="3">3 — OK</option>
                <option value="4">4 — Good</option>
                <option value="5">5 — Excellent</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-gray-700">Lifestyle factors</p>
              {(
                [
                  { name: "travel", label: "Traveling / time-zone shift" },
                  { name: "massage", label: "Had a massage" },
                  { name: "illness", label: "Feeling unwell" },
                ] as const
              ).map(({ name, label }) => (
                <label key={name} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" name={name} className="accent-orange-500 w-4 h-4" />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>

            <div>
              <FieldLabel>Nutrition notes</FieldLabel>
              <input
                name="nutritionNotes"
                type="text"
                placeholder="e.g. fasted, gel at 45 min, well-hydrated"
                className={inputCls()}
              />
            </div>

            <div>
              <FieldLabel>Anything else?</FieldLabel>
              <textarea
                name="contextFreeText"
                rows={2}
                placeholder="Other relevant context"
                className={`${inputCls()} resize-none`}
              />
            </div>
          </Collapsible>

          {/* Pain observations */}
          <Collapsible title={`Pain or tightness${painEntries.length > 0 ? ` (${painEntries.length})` : ""}`}>
            {painEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No pain logged for this workout.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {painEntries.map((entry, i) => (
                  <PainEntryRow
                    key={i}
                    entry={entry}
                    index={i}
                    onChange={updatePain}
                    onRemove={removePain}
                  />
                ))}
              </div>
            )}

            {painEntries.length < 10 && (
              <button
                type="button"
                onClick={() => setPainEntries((prev) => [...prev, emptyPain()])}
                className="mt-1 text-sm font-medium text-orange-500 hover:text-orange-600"
              >
                + Add area
              </button>
            )}
          </Collapsible>

          {/* Notes */}
          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea
              name="notes"
              rows={3}
              placeholder="Anything else to note about the workout?"
              className={`${inputCls()} resize-none`}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Saving…" : "Upload workout"}
          </button>
        </form>
      </div>
    </main>
  )
}
