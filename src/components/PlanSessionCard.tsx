"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  skipSessionAction,
  restoreSessionAction,
  moveSessionAction,
  changeSessionTypeAction,
} from "@/app/plan/actions"
import { sessionKindMeta, SWAPPABLE_KINDS } from "@/lib/plan/sessionKinds"

export interface PlanSession {
  id: string
  sessionKind: string
  label: string
  prescription: string
  isRunSession: boolean
  isStrengthSession: boolean
  status: string
}

interface Props {
  session: PlanSession
  dateStr: string
}

type Menu = null | "root" | "swap" | "move"

/** Shift a YYYY-MM-DD date by n days without timezone drift. */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function dayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function PlanSessionCard({ session, dateStr }: Props) {
  const router = useRouter()
  const [menu, setMenu] = useState<Menu>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  const meta = sessionKindMeta(session.sessionKind)
  const isEditable = session.status === "planned" || session.status === "skipped"

  useEffect(() => {
    if (!menu) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [menu])

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    setMenu(null)
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) setError(result.error ?? "Something went wrong")
      else router.refresh()
    })
  }

  // Candidate days to move to: ±3 days around the current date, excluding today
  const moveTargets = [-3, -2, -1, 1, 2, 3].map((offset) => shiftDate(dateStr, offset))

  return (
    <li
      className={`rounded-xl border p-4 transition-opacity ${
        session.status === "skipped" ? "border-gray-100 bg-gray-50/60" : "border-gray-100"
      } ${isPending ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${meta.chipClass}`}
            >
              {session.sessionKind}
            </span>
            {session.isRunSession && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Run
              </span>
            )}
            {session.isStrengthSession && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Strength
              </span>
            )}
          </div>
          <p
            className={`text-sm font-semibold ${
              session.status === "skipped" ? "text-gray-400 line-through" : "text-gray-900"
            }`}
          >
            {session.label}
          </p>
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">{session.prescription}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <StatusPill status={session.status} />

          {isEditable && (
            <div ref={ref} className="relative">
              <button
                type="button"
                onClick={() => setMenu((m) => (m ? null : "root"))}
                disabled={isPending}
                aria-label="Edit session"
                className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>

              {menu === "root" && (
                <Dropdown>
                  {session.status === "skipped" ? (
                    <MenuItem
                      onClick={() => run(() => restoreSessionAction(session.id, dateStr))}
                    >
                      Restore to plan
                    </MenuItem>
                  ) : (
                    <>
                      <MenuItem onClick={() => setMenu("swap")}>Change type…</MenuItem>
                      <MenuItem onClick={() => setMenu("move")}>Move to…</MenuItem>
                      <div className="border-t border-gray-50" />
                      <MenuItem
                        destructive
                        onClick={() => run(() => skipSessionAction(session.id, dateStr))}
                      >
                        Skip this session
                      </MenuItem>
                    </>
                  )}
                </Dropdown>
              )}

              {menu === "swap" && (
                <Dropdown>
                  <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Change type
                  </p>
                  {SWAPPABLE_KINDS.filter((k) => k !== session.sessionKind).map((k) => {
                    const km = sessionKindMeta(k)
                    return (
                      <MenuItem
                        key={k}
                        onClick={() =>
                          run(() => changeSessionTypeAction(session.id, dateStr, k))
                        }
                      >
                        <span
                          className={`text-[11px] font-semibold rounded-full px-1.5 py-0.5 ${km.chipClass}`}
                        >
                          {km.label}
                        </span>
                      </MenuItem>
                    )
                  })}
                </Dropdown>
              )}

              {menu === "move" && (
                <Dropdown>
                  <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Move to
                  </p>
                  {moveTargets.map((target) => (
                    <MenuItem
                      key={target}
                      onClick={() =>
                        run(() => moveSessionAction(session.id, dateStr, target))
                      }
                    >
                      {dayLabel(target)}
                    </MenuItem>
                  ))}
                </Dropdown>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </li>
  )
}

function Dropdown({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden py-1">
      {children}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors ${
        destructive ? "text-red-500" : "text-gray-700"
      }`}
    >
      {children}
    </button>
  )
}

function StatusPill({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-green-50 text-green-600">
        Done
      </span>
    )
  }
  if (status === "skipped") {
    return (
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-gray-100 text-gray-400">
        Skipped
      </span>
    )
  }
  if (status === "rescheduled") {
    return (
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-amber-50 text-amber-500">
        Moved
      </span>
    )
  }
  return null
}
