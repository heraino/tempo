"use client"

import { useEffect, useState } from "react"
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"

export interface PacePoint { date: string; paceDecimal: number }
export interface ReadinessPoint { date: string; score: number }

type Period = "weekly" | "monthly" | "yearly"
interface MileageBucket { label: string; miles: number }

function fmtPaceDecimal(decimal: number): string {
  const m = Math.floor(decimal)
  const s = Math.round((decimal - m) * 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const tooltipStyle = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  fontSize: 12,
  padding: "6px 10px",
  boxShadow: "0 2px 8px rgba(0,0,0,.08)",
}

function MileageChart() {
  const [period, setPeriod] = useState<Period>("weekly")
  const [buckets, setBuckets] = useState<MileageBucket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/trends/mileage?period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        setBuckets(data.buckets ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [period])

  const hasMileage = buckets.some((b) => b.miles > 0)
  const maxMiles = Math.max(...buckets.map((b) => b.miles), 1)
  const currentMiles = buckets[buckets.length - 1]?.miles ?? 0
  const previousMiles = buckets[buckets.length - 2]?.miles ?? 0
  const currentLabel = period === "yearly" ? "This year" : period === "monthly" ? "This month" : "This week"
  const previousLabel = period === "yearly" ? "Last year" : period === "monthly" ? "Last month" : "Last week"

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Mileage</p>
          <div className="flex gap-0.5">
            {(["weekly", "monthly", "yearly"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-[9px] font-semibold rounded-full px-2 py-0.5 transition-colors ${
                  period === p
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span>{currentLabel}: <span className="font-semibold text-gray-800">{currentMiles.toFixed(1)} mi</span></span>
          <span className="text-gray-200">·</span>
          <span>{previousLabel}: <span className="font-semibold text-gray-800">{previousMiles.toFixed(1)} mi</span></span>
        </div>
      </div>

      {loading ? (
        <div className="bg-gray-50 rounded animate-pulse" style={{ height: 100 }} />
      ) : !hasMileage ? (
        <p className="text-xs text-gray-300 italic">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#9CA3AF" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#9CA3AF" }}
              axisLine={false}
              tickLine={false}
              width={24}
              tickFormatter={(v: number) => `${v}`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "#F9FAFB" }}
              labelFormatter={(label) => String(label)}
              formatter={(v) => [`${Number(v).toFixed(1)} mi`, "Mileage"]}
            />
            <Bar dataKey="miles" fill="#F97316" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function TrendCharts({
  paceTrend,
  readinessTrend,
}: {
  paceTrend: PacePoint[]
  readinessTrend: ReadinessPoint[]
}) {
  const hasPace = paceTrend.length >= 3
  const hasReadiness = readinessTrend.length >= 3

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Training trends</h2>

      <MileageChart />

      {hasPace && (
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Easy pace</p>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={paceTrend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                width={42}
                reversed
                tickFormatter={fmtPaceDecimal}
                domain={["dataMin - 0.3", "dataMax + 0.3"]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ stroke: "#F3F4F6", strokeWidth: 1 }}
                labelFormatter={(label) => String(label)}
                formatter={(v) => [`${fmtPaceDecimal(Number(v))}/mi`, "Easy pace"]}
              />
              <Line
                type="monotone"
                dataKey="paceDecimal"
                stroke="#EF4444"
                strokeWidth={1.5}
                dot={{ r: 3, fill: "#EF4444", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#EF4444", strokeWidth: 2, stroke: "#fff" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasReadiness && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Readiness score</p>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={readinessTrend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                width={28}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ stroke: "#F3F4F6", strokeWidth: 1 }}
                labelFormatter={(label) => String(label)}
                formatter={(v) => [`${Number(v)}/100`, "Readiness"]}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#22C55E"
                strokeWidth={1.5}
                dot={{ r: 3, fill: "#22C55E", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#22C55E", strokeWidth: 2, stroke: "#fff" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
