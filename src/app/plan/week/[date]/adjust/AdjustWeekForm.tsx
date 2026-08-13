"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { previewWeekAdjustment, applyWeekAdjustment } from "@/app/plan/week-actions"
import { ALL_WEEKDAYS } from "@/lib/plan/blueprint"
import type { Weekday } from "@/lib/plan/types"
import type { WeekAdjustmentAction } from "@/lib/plan/weekAdjustment"

export interface AdjustWeekDay {
  weekday: string
  date: string
  sessions: Array<{ label: string; chipClass: string }>
}

interface Props {
  monday: string
  days: AdjustWeekDay[]
}

type Constraint = "normal" | "blocked" | "lighten"

const OPTIONS: Array<{ value: Constraint; label: string; activeCls: string }> = [
  { value: "normal", label: "Normal", activeCls: "bg-gray-800 text-white" },
  { value: "lighten", label: "Lighten", activeCls: "bg-amber-500 text-white" },
  { value: "blocked", label: "Can't run", activeCls: "bg-red-500 text-white" },
]

export function AdjustWeekForm({ monday, days }: Props) {
  const router = useRouter()
  const [constraints, setConstraints] = useState<Record<Weekday, Constraint>>(() =>
    Object.fromEntries(ALL_WEEKDAYS.map((w) => [w, "normal"])) as Record<Weekday, Constraint>,
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ actions: WeekAdjustmentAction[]; summary: string[] } | null>(null)

  const dayByWeekday = new Map(days.map((d) => [d.weekday, d]))
  const hasAnyConstraint = Object.values(constraints).some((c) => c !== "normal")

  function setDay(weekday: Weekday, value: Constraint) {
    setConstraints((prev) => ({ ...prev, [weekday]: value }))
    setPreview(null) // stale once inputs change
    setError(null)
  }

  function runPreview() {
    setError(null)
    startTransition(async () => {
      const result = await previewWeekAdjustment(monday, constraints)
      if (!result.ok) {
        setError(result.error ?? "Could not preview changes")
        setPreview(null)
        return
      }
      setPreview({ actions: result.actions ?? [], summary: result.summary ?? [] })
    })
  }

  function apply() {
    setError(null)
    startTransition(async () => {
      const result = await applyWeekAdjustment(monday, constraints)
      if (!result.ok) {
        setError(result.error ?? "Could not apply changes")
        return
      }
      router.push(`/plan/week/${monday}`)
    })
  }

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs text-gray-400 mb-4">
          Mark the days that need to change. We&apos;ll move or lighten sessions to keep the
          week as close to your plan as possible.
        </p>

        <div className="space-y-3">
          {ALL_WEEKDAYS.map((weekday) => {
            const day = dayByWeekday.get(weekday)
            const value = constraints[weekday]

            return (
              <div key={weekday} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800">{weekday}</p>
                  {day && day.sessions.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {day.sessions.map((s, i) => (
                        <span
                          key={i}
                          className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${s.chipClass}`}
                        >
                          {s.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-300 mt-0.5">Rest</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0 bg-gray-50 rounded-full p-0.5">
                  {OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDay(weekday, opt.value)}
                      className={`text-[11px] font-semibold rounded-full px-2.5 py-1.5 transition-colors ${
                        value === opt.value ? opt.activeCls : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
      )}

      {!preview && (
        <button
          type="button"
          onClick={runPreview}
          disabled={isPending || !hasAnyConstraint}
          className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
        >
          {isPending ? "Working it out…" : "Preview changes"}
        </button>
      )}

      {preview && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {preview.actions.length === 0 ? "No changes needed" : "What will change"}
          </p>

          {preview.actions.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nothing needs to move — the days you marked don&apos;t conflict with what&apos;s scheduled.
            </p>
          ) : (
            <ul className="space-y-2">
              {preview.summary.map((line, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-orange-400 shrink-0">•</span>
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={isPending}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Back
            </button>
            {preview.actions.length > 0 && (
              <button
                type="button"
                onClick={apply}
                disabled={isPending}
                className="flex-1 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Applying…" : "Apply this adjustment"}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
