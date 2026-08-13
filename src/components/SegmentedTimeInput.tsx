"use client"

import { useRef, useState } from "react"

export interface TimeSegmentDef {
  key: string
  label: string
  /** Values above this are clamped as the athlete types. */
  max: number
}

interface Props {
  /** Form field name for the combined, colon-joined hidden input. */
  name: string
  /** Colon-separated seed value, e.g. "1:45:00" or "8:00", or "" for empty. */
  defaultValue: string
  segments: TimeSegmentDef[]
}

/** Right-align a colon-separated seed value onto a segment list. */
export function seedSegmentValues(defaultValue: string, segmentCount: number): string[] {
  const seedParts = defaultValue ? defaultValue.split(":") : []
  const offset = segmentCount - seedParts.length
  return Array.from({ length: segmentCount }, (_, i) => {
    const idx = i - offset
    return idx >= 0 ? (seedParts[idx] ?? "") : ""
  })
}

/**
 * Join per-segment digit strings into a colon-separated value the server's
 * colon-string parsers understand — "" only when every segment is untouched,
 * otherwise every segment is filled (blank segments become "0") so no
 * segment is ever an empty string within a non-empty result.
 */
export function combineSegmentValues(values: string[]): string {
  const touched = values.some((v) => v !== "")
  if (!touched) return ""
  return values
    .map((v) => v || "0")
    .map((v, i) => (i === 0 ? v : v.padStart(2, "0")))
    .join(":")
}

/**
 * A colon-free time entry control: one small numeric box per segment
 * (hours / minutes / seconds), auto-advancing as each fills.
 *
 * Exists because iOS's numeric keypad (inputMode="numeric") has no colon key,
 * making a single "H:MM:SS" text field impossible to fill on a phone. Emits a
 * hidden colon-joined field so the existing colon-string parsers on the server
 * need no changes.
 */
export function SegmentedTimeInput({ name, defaultValue, segments }: Props) {
  const [values, setValues] = useState<string[]>(() =>
    seedSegmentValues(defaultValue, segments.length),
  )
  const refs = useRef<Array<HTMLInputElement | null>>([])

  function handleChange(i: number, raw: string) {
    let digits = raw.replace(/\D/g, "").slice(0, 2)
    if (digits !== "" && parseInt(digits, 10) > segments[i].max) {
      digits = String(segments[i].max)
    }
    const next = [...values]
    next[i] = digits
    setValues(next)

    if (digits.length === 2 && i < segments.length - 1) {
      refs.current[i + 1]?.focus()
      refs.current[i + 1]?.select()
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && values[i] === "" && i > 0) {
      refs.current[i - 1]?.focus()
    }
  }

  const combined = combineSegmentValues(values)

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={combined} />
      {segments.map((seg, i) => (
        <div key={seg.key} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-300 font-medium">:</span>}
          <input
            ref={(el) => {
              refs.current[i] = el
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={values[i]}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            placeholder={seg.label}
            aria-label={seg.label}
            className="w-12 rounded-lg border border-gray-200 px-1 py-2.5 text-sm text-center tabular-nums text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      ))}
    </div>
  )
}
