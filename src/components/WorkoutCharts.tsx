"use client"

import { useEffect, useState } from "react"
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"
import type { RecordPoint } from "@/app/api/workout/[id]/records/route"

function fmtElapsed(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const rm = m % 60
    return `${h}:${rm.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }
  return `${m}:${s.toString().padStart(2, "0")}`
}

function mpsToMinPerMile(mps: number | null): string {
  if (!mps || mps < 0.5) return "—"
  const secsPerMile = 1609.344 / mps
  const m = Math.floor(secsPerMile / 60)
  const s = Math.round(secsPerMile % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// Y-axis tick for pace: converts m/s back to mm:ss/mi
function paceTick(mps: number): string {
  if (!mps || mps < 0.5) return ""
  const secsPerMile = 1609.344 / mps
  const m = Math.floor(secsPerMile / 60)
  const s = Math.round(secsPerMile % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// Y-axis tick for altitude: m → ft
function altTick(m: number): string {
  return `${Math.round(m * 3.28084)}ft`
}

interface ChartPanelProps {
  title: string
  data: RecordPoint[]
  dataKey: keyof RecordPoint
  color: string
  yTickFormatter?: (v: number) => string
  tooltipFormatter?: (v: number) => string
  unit?: string
  reversed?: boolean
  chartType?: "area" | "line"
  gradientId?: string
  domain?: [string | number, string | number]
}

function ChartPanel({
  title,
  data,
  dataKey,
  color,
  yTickFormatter,
  tooltipFormatter,
  unit,
  reversed = false,
  chartType = "area",
  gradientId,
  domain,
}: ChartPanelProps) {
  const validData = data.filter((p) => p[dataKey] != null)
  if (validData.length < 3) {
    return (
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{title}</p>
        <p className="text-xs text-gray-300 italic">No data</p>
      </div>
    )
  }

  const xFormatter = (v: number) => fmtElapsed(v)
  const tooltipFmt = tooltipFormatter ?? ((v: number) => unit ? `${v} ${unit}` : String(v))

  const chart = chartType === "area" ? (
    <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
      {gradientId && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0.03} />
          </linearGradient>
        </defs>
      )}
      <XAxis
        dataKey="t"
        tickFormatter={xFormatter}
        tick={{ fontSize: 10, fill: "#9CA3AF" }}
        axisLine={false}
        tickLine={false}
        minTickGap={60}
      />
      <YAxis
        tickFormatter={yTickFormatter}
        tick={{ fontSize: 10, fill: "#9CA3AF" }}
        axisLine={false}
        tickLine={false}
        width={42}
        reversed={reversed}
        domain={domain}
      />
      <Tooltip
        contentStyle={{
          background: "var(--chart-tooltip-bg, #fff)",
          border: "1px solid #E5E7EB",
          borderRadius: 8,
          fontSize: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,.08)",
        }}
        labelFormatter={(v) => fmtElapsed(Number(v))}
        formatter={(v) => [tooltipFmt(Number(v)), title]}
      />
      <Area
        type="monotone"
        dataKey={dataKey as string}
        stroke={color}
        strokeWidth={1.5}
        fill={gradientId ? `url(#${gradientId})` : "transparent"}
        dot={false}
        connectNulls={false}
        isAnimationActive={false}
      />
    </AreaChart>
  ) : (
    <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
      <XAxis
        dataKey="t"
        tickFormatter={xFormatter}
        tick={{ fontSize: 10, fill: "#9CA3AF" }}
        axisLine={false}
        tickLine={false}
        minTickGap={60}
      />
      <YAxis
        tickFormatter={yTickFormatter}
        tick={{ fontSize: 10, fill: "#9CA3AF" }}
        axisLine={false}
        tickLine={false}
        width={42}
        reversed={reversed}
        domain={domain}
      />
      <Tooltip
        contentStyle={{
          background: "var(--chart-tooltip-bg, #fff)",
          border: "1px solid #E5E7EB",
          borderRadius: 8,
          fontSize: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,.08)",
        }}
        labelFormatter={(v) => fmtElapsed(Number(v))}
        formatter={(v) => [tooltipFmt(Number(v)), title]}
      />
      <Line
        type="monotone"
        dataKey={dataKey as string}
        stroke={color}
        strokeWidth={1.5}
        dot={false}
        connectNulls={false}
        isAnimationActive={false}
      />
    </LineChart>
  )

  return (
    <div className="mb-5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{title}</p>
      <ResponsiveContainer width="100%" height={110}>
        {chart}
      </ResponsiveContainer>
    </div>
  )
}

export function WorkoutCharts({ workoutId }: { workoutId: string }) {
  const [points, setPoints] = useState<RecordPoint[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/workout/${workoutId}/records`)
      .then((r) => r.json())
      .then((data) => setPoints(data.points ?? []))
      .catch(() => setError(true))
  }, [workoutId])

  if (points === null) {
    if (error) {
      return (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Activity</h2>
          <p className="text-sm text-gray-400">No per-second data in this file. Charts are available for workouts recorded with a GPS watch.</p>
        </section>
      )
    }
    // Loading skeleton
    return (
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">Activity</h2>
        <div className="space-y-5">
          {[120, 110, 100, 90].map((h, i) => (
            <div key={i}>
              <div className="h-2 w-16 bg-gray-100 rounded mb-2 animate-pulse" />
              <div className="bg-gray-50 rounded animate-pulse" style={{ height: h }} />
            </div>
          ))}
        </div>
      </section>
    )
  }
  if (points.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Activity</h2>
        <p className="text-sm text-gray-400">No per-second data in this file. Charts are available for workouts recorded with a GPS watch.</p>
      </section>
    )
  }

  const hasAltitude = points.some((p) => p.altitude != null && p.altitude > 0)

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">Activity</h2>

      {/* Pace — line chart, faster (higher speed) at top */}
      <ChartPanel
        title="Pace"
        data={points}
        dataKey="speedMps"
        color="#F97316"
        chartType="line"
        yTickFormatter={paceTick}
        tooltipFormatter={mpsToMinPerMile}
        reversed={false}
      />

      {/* Heart Rate */}
      <ChartPanel
        title="Heart rate"
        data={points}
        dataKey="hr"
        color="#EF4444"
        chartType="area"
        gradientId="hrGrad"
        unit="bpm"
        domain={["dataMin - 5", "dataMax + 5"]}
      />

      {/* Cadence */}
      <ChartPanel
        title="Cadence"
        data={points}
        dataKey="cadence"
        color="#3B82F6"
        chartType="line"
        unit="spm"
        domain={["dataMin - 5", "dataMax + 5"]}
      />

      {/* Elevation — only if data exists */}
      {hasAltitude && (
        <ChartPanel
          title="Elevation"
          data={points}
          dataKey="altitude"
          color="#22C55E"
          chartType="area"
          gradientId="altGrad"
          yTickFormatter={altTick}
          tooltipFormatter={(v) => `${Math.round(v * 3.28084)} ft`}
        />
      )}
    </section>
  )
}
