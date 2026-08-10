"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { setTrainingMode } from "@/app/goal/program-actions"

interface Props {
  mode: "just_run" | "goal_program"
  hasPlan: boolean
  goalSummary: string | null
}

export function TrainingModeSection({ mode, hasPlan, goalSummary }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function switchTo(next: "just_run" | "goal_program") {
    if (next === mode) return
    setError(null)
    startTransition(async () => {
      const result = await setTrainingMode(next)
      if (!result.ok) {
        setError(result.error ?? "Could not change mode")
        return
      }
      if (result.needsProgram) {
        router.push("/goal/program")
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">How you&apos;re training</h2>
      <p className="text-xs text-gray-400 mb-4">
        Switch whenever you like — your workout history is kept either way.
      </p>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => switchTo("just_run")}
          disabled={isPending}
          className={`text-left rounded-xl border px-4 py-3 transition-colors disabled:opacity-50 ${
            mode === "just_run"
              ? "border-orange-400 bg-orange-50"
              : "border-gray-200 hover:border-orange-200"
          }`}
        >
          <p
            className={`text-sm font-semibold ${
              mode === "just_run" ? "text-orange-700" : "text-gray-800"
            }`}
          >
            Just running
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Track your runs and get coaching insights. No assigned schedule.
          </p>
        </button>

        <button
          type="button"
          onClick={() => switchTo("goal_program")}
          disabled={isPending}
          className={`text-left rounded-xl border px-4 py-3 transition-colors disabled:opacity-50 ${
            mode === "goal_program"
              ? "border-orange-400 bg-orange-50"
              : "border-gray-200 hover:border-orange-200"
          }`}
        >
          <p
            className={`text-sm font-semibold ${
              mode === "goal_program" ? "text-orange-700" : "text-gray-800"
            }`}
          >
            Following a program
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {hasPlan
              ? goalSummary
                ? `Working toward ${goalSummary}`
                : "A structured plan with a session for each day"
              : "Build a program around a goal — your coach designs it, you approve it"}
          </p>
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {mode === "just_run" && (
        <div className="mt-4 pt-4 border-t border-gray-50">
          <p className="text-sm text-gray-600 mb-3">
            Ready to train for something specific? Your coach can build a program
            around your goal and your week.
          </p>
          <Link
            href="/goal/program"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            Build me a program
          </Link>
        </div>
      )}

      {mode === "goal_program" && !hasPlan && (
        <div className="mt-4 pt-4 border-t border-gray-50">
          <p className="text-sm text-gray-600 mb-3">
            You don&apos;t have a program yet.
          </p>
          <Link
            href="/goal/program"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            Build me a program
          </Link>
        </div>
      )}
    </section>
  )
}
