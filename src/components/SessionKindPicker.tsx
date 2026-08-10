"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { setSessionKind } from "@/app/workout/actions"

const KINDS = [
  { value: "easy",      label: "Easy",       chip: "bg-green-50 text-green-700" },
  { value: "long",      label: "Long run",   chip: "bg-blue-50 text-blue-700" },
  { value: "tempo",     label: "Tempo",      chip: "bg-orange-50 text-orange-700" },
  { value: "threshold", label: "Threshold",  chip: "bg-red-50 text-red-700" },
  { value: "recovery",  label: "Recovery",   chip: "bg-gray-100 text-gray-500" },
  { value: "other",     label: "Other",      chip: "bg-gray-100 text-gray-500" },
]

const KIND_MAP = Object.fromEntries(KINDS.map(k => [k.value, k]))

interface Props {
  workoutId: string
  override: string | null
  observed: string | null
}

export function SessionKindPicker({ workoutId, override, observed }: Props) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<string | null>(override)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  const effectiveKind = current ?? observed ?? null
  const isAutoDetected = current === null && observed !== null
  const meta = effectiveKind ? KIND_MAP[effectiveKind] : null

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  function select(kind: string | null) {
    setCurrent(kind)
    setOpen(false)
    startTransition(async () => { await setSessionKind(workoutId, kind) })
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 transition-opacity ${
          isPending ? "opacity-50" : ""
        } ${
          meta
            ? meta.chip
            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
        }`}
      >
        {meta ? meta.label : "+ Label run"}
        {isAutoDetected && (
          <span className="text-[9px] font-normal opacity-50">auto</span>
        )}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-20 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden w-40">
          {KINDS.map(k => {
            const isActive = current === k.value
            return (
              <button
                key={k.value}
                type="button"
                onClick={() => select(isActive ? null : k.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors"
              >
                <span className={`shrink-0 text-[11px] font-semibold rounded-full px-1.5 py-0.5 ${k.chip}`}>
                  {k.label}
                </span>
                {isActive && (
                  <svg className="ml-auto shrink-0 text-orange-500" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            )
          })}
          {current && (
            <>
              <div className="border-t border-gray-50" />
              <button
                type="button"
                onClick={() => select(null)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-gray-400 hover:bg-gray-50 transition-colors"
              >
                Reset to auto-detect
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
