"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { deleteWorkout } from "@/app/workout/actions"
import { fmtPace, fmtDistance, fmtDuration, fmtDate, resolveSpeedMps } from "@/lib/fmt"

interface WorkoutRow {
  id: string
  sport: string | null
  startTime: Date | string
  totalDistanceM: number | null
  totalTimerSecs: number | null
  avgSpeedMps: number | null
  avgHr: number | null
  hrDriftBpm: number | null
  perceivedEffort: number | null
  sessionKindOverride: string | null
  observedSessionKind: string | null
}

const KIND_LABELS: Record<string, string> = {
  easy: "Easy run",
  long: "Long run",
  tempo: "Tempo run",
  threshold: "Threshold",
  recovery: "Recovery run",
  other: "Run",
}

function sessionLabel(log: WorkoutRow): string {
  const kind = log.sessionKindOverride ?? log.observedSessionKind
  if (kind && KIND_LABELS[kind]) return KIND_LABELS[kind]
  const sport = log.sport ?? "activity"
  return sport.charAt(0).toUpperCase() + sport.slice(1)
}

export function RecentWorkoutsCard({ logs }: { logs: WorkoutRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  function handleDeleteClick(id: string) {
    setConfirmId(id)
  }

  function handleCancelDelete() {
    setConfirmId(null)
  }

  function handleConfirmDelete(id: string) {
    setDeletingId(id)
    setConfirmId(null)
    startTransition(async () => {
      await deleteWorkout(id)
      setDeletingId(null)
      router.refresh()
    })
  }

  if (logs.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No workouts logged yet.{" "}
        <Link href="/log" className="text-orange-500 hover:underline">
          Upload your first one →
        </Link>
      </p>
    )
  }

  return (
    <ul className="space-y-0 divide-y divide-gray-50">
      {logs.map((log) => {
        const sport = sessionLabel(log)
        const isDeleting = deletingId === log.id
        const isConfirming = confirmId === log.id
        const speedMps = resolveSpeedMps(log.avgSpeedMps, log.totalDistanceM, log.totalTimerSecs)

        return (
          <li key={log.id} className={isDeleting ? "opacity-40 pointer-events-none" : ""}>
            {isConfirming ? (
              /* Inline confirmation row */
              <div className="flex items-center justify-between py-4 gap-4 bg-red-50 -mx-2 px-2 rounded-xl">
                <p className="text-sm text-red-700 font-medium">Delete this workout?</p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleConfirmDelete(log.id)}
                    className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={handleCancelDelete}
                    className="text-xs font-semibold text-gray-600 hover:text-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 bg-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between py-4 gap-4 group">
                {/* Left: link to detail */}
                <Link
                  href={`/workout/${log.id}`}
                  className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{sport}</p>
                    {log.perceivedEffort && (
                      <span className="text-[10px] font-semibold bg-orange-50 text-orange-500 rounded-full px-2 py-0.5">
                        {log.perceivedEffort}/5
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmtDate(new Date(log.startTime))}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                    <span className="font-semibold text-gray-800">{fmtDistance(log.totalDistanceM)}</span>
                    <span className="text-gray-300">·</span>
                    <span>{fmtDuration(log.totalTimerSecs)}</span>
                    <span className="text-gray-300">·</span>
                    <span>{fmtPace(speedMps)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {log.avgHr && <span>HR {log.avgHr} bpm</span>}
                    {log.hrDriftBpm != null && (
                      <span className={log.hrDriftBpm > 5 ? "text-amber-500" : ""}>
                        drift {log.hrDriftBpm > 0 ? "+" : ""}{log.hrDriftBpm.toFixed(1)} bpm
                      </span>
                    )}
                  </div>
                </Link>

                {/* Right: action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/workout/${log.id}`}
                    className="p-1.5 text-gray-400 hover:text-orange-500 transition-colors rounded-lg hover:bg-orange-50"
                    title="View / edit"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </Link>
                  <button
                    onClick={() => handleDeleteClick(log.id)}
                    disabled={pending}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                    title="Delete workout"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
