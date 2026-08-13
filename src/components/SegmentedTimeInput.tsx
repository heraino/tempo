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
  /**
   * Colon-separated value, e.g. "1:45:00" or "8:00", or "" for empty. The
   * source of truth: a change here (e.g. a sibling field auto-calculating
   * this one) re-renders the displayed digits.
   */
  value: string
  /** Fires with the new combined value whenever the athlete edits a segment. */
  onChange: (combined: string) => void
  segments: TimeSegmentDef[]
}

/** Right-align a colon-separated value onto a segment list. */
export function seedSegmentValues(value: string, segmentCount: number): string[] {
  const parts = value ? value.split(":") : []
  const offset = segmentCount - parts.length
  return Array.from({ length: segmentCount }, (_, i) => {
    const idx = i - offset
    return idx >= 0 ? (parts[idx] ?? "") : ""
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
 *
 * Controlled via `value`/`onChange` so a parent can auto-fill this field from
 * a sibling (e.g. deriving a finish time from distance + pace) — an external
 * value change re-seeds the displayed digits without disturbing an edit the
 * athlete is mid-typing in this field.
 */
export function SegmentedTimeInput({ name, value, onChange, segments }: Props) {
  const [localValues, setLocalValues] = useState<string[]>(() =>
    seedSegmentValues(value, segments.length),
  )

  // Re-seed from an externally-changed value (e.g. a sibling field's
  // auto-calc) during render, per React's documented pattern for adjusting
  // state from a changed prop — not in an effect, so this commits in the
  // same render pass instead of causing a visible flash on the next one.
  // Skipped when `value` already matches what we'd produce ourselves, which
  // is just an echo of our own onChange and must not reset mid-edit.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (value !== combineSegmentValues(localValues)) {
      setLocalValues(seedSegmentValues(value, segments.length))
    }
  }

  const refs = useRef<Array<HTMLInputElement | null>>([])

  function handleChange(i: number, raw: string) {
    let digits = raw.replace(/\D/g, "").slice(0, 2)
    if (digits !== "" && parseInt(digits, 10) > segments[i].max) {
      digits = String(segments[i].max)
    }
    const next = [...localValues]
    next[i] = digits
    setLocalValues(next)
    onChange(combineSegmentValues(next))

    if (digits.length === 2 && i < segments.length - 1) {
      refs.current[i + 1]?.focus()
      refs.current[i + 1]?.select()
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && localValues[i] === "" && i > 0) {
      refs.current[i - 1]?.focus()
    }
  }

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={value} />
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
            value={localValues[i]}
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
