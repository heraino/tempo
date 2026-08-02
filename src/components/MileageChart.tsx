"use client"

import { useState } from "react"

interface Bucket {
  label: string
  miles: number
}

export function MileageChart({ buckets }: { buckets: Bucket[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const maxMiles = Math.max(...buckets.map((b) => b.miles), 1)

  function handleBarClick(idx: number) {
    setSelectedIdx((prev) => (prev === idx ? null : idx))
  }

  return (
    <div
      className="flex items-end gap-0.5"
      onClick={(e) => {
        // Dismiss if clicking the container but not a bar
        if (e.target === e.currentTarget) setSelectedIdx(null)
      }}
    >
      {buckets.map(({ label, miles }, idx) => {
        const heightPx = Math.round((miles / maxMiles) * 52)
        const isCurrent = idx === buckets.length - 1
        const isSelected = idx === selectedIdx

        return (
          <div
            key={label}
            className="flex-1 flex flex-col items-center gap-1 relative cursor-pointer select-none"
            onClick={() => handleBarClick(idx)}
          >
            {/* Tooltip */}
            {isSelected && (
              <div
                className="absolute z-10 -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap pointer-events-none"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
              >
                {miles > 0 ? `${miles.toFixed(1)} mi` : "0 mi"}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
              </div>
            )}

            {/* Miles label above bar */}
            <span className="text-[8px] text-gray-400 tabular-nums h-3 leading-3">
              {miles > 0 ? miles.toFixed(0) : ""}
            </span>

            {/* Bar */}
            <div className="w-full flex flex-col justify-end" style={{ height: 52 }}>
              {heightPx > 0 ? (
                <div
                  className={`w-full rounded-t-sm transition-colors ${
                    isSelected
                      ? "bg-orange-500"
                      : isCurrent
                      ? "bg-orange-500"
                      : "bg-orange-200"
                  }`}
                  style={{ height: heightPx }}
                />
              ) : (
                <div className="w-full" style={{ height: 2 }} />
              )}
            </div>

            {/* Period label */}
            <span className={`text-[7px] text-center leading-tight whitespace-nowrap ${isSelected ? "text-orange-500 font-semibold" : "text-gray-400"}`}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
