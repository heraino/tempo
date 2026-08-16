"use client"

import { useState, useTransition } from "react"
import { savePreferences } from "@/app/settings/actions"
import { TimezoneField } from "@/components/TimezoneDetectButton"

interface Props {
  unitsSystem: "imperial" | "metric"
  timezone: string | null
  maxHr: number | null
}

export function SettingsForm({ unitsSystem, timezone, maxHr }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await savePreferences(formData)
      if (!result.ok) setError(result.error ?? "Could not save settings. Try again shortly.")
    })
  }

  return (
    <form action={handleSubmit}>
      {/* Units */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Units</h2>
        <p className="text-xs text-gray-400 mb-4">Controls how distances, pace, and temperature are displayed</p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="unitsSystem"
              value="imperial"
              defaultChecked={unitsSystem !== "metric"}
              className="accent-orange-500 w-4 h-4"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Imperial</p>
              <p className="text-xs text-gray-400">Miles, feet, °F</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="unitsSystem"
              value="metric"
              defaultChecked={unitsSystem === "metric"}
              className="accent-orange-500 w-4 h-4"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Metric</p>
              <p className="text-xs text-gray-400">Kilometers, meters, °C</p>
            </div>
          </label>
        </div>
      </section>

      {/* Timezone */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Timezone</h2>
        <p className="text-xs text-gray-400 mb-3">
          Auto-detected from your device. Override if the wrong day is shown.
        </p>
        <TimezoneField savedValue={timezone} />
        {timezone && <p className="text-xs text-gray-400 mt-1.5">Saved: {timezone}</p>}
      </section>

      {/* Max heart rate */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Max heart rate</h2>
        <p className="text-xs text-gray-400 mb-3">
          Optional. Once set, planned sessions show a target heart-rate range
          alongside pace. Leave blank to hide HR targets.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            name="maxHr"
            inputMode="numeric"
            min={100}
            max={230}
            placeholder="e.g. 185"
            defaultValue={maxHr ?? ""}
            className="w-full max-w-[160px] rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <span className="text-sm text-gray-400">bpm</span>
        </div>
      </section>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Saving…" : "Save settings"}
      </button>
      {error && <p className="text-sm text-red-600 text-center mt-2">{error}</p>}
    </form>
  )
}
