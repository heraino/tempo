"use client"

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"

export interface WeekBucket { week: string; miles: number }
export interface PacePoint { date: string; paceDecimal: number }
export interface ReadinessPoint { date: string; score: number }

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

export function TrendCharts({
  weeklyMileage,
  paceTrend,
  readinessTrend,
}: {
  weeklyMileage: WeekBucket[]
  paceTrend: PacePoint[]
  readinessTrend: ReadinessPoint[]
}) {
  const hasMileage = weeklyMileage.some((w) => w.miles > 0)
  const hasPace = paceTrend.length >= 3
  const hasReadiness = readinessTrend.length >= 3

  if (!hasMileage && !hasPace && !hasReadiness) return null

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Training trends</h2>

      {hasMileage && (
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Weekly mileage</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={weeklyMileage} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="week"
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
                labelFormatter={(label) => `Week of ${label}`}
                formatter={(v) => [`${Number(v).toFixed(1)} mi`, "Mileage"]}
              />
              <Bar dataKey="miles" fill="#F97316" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

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
