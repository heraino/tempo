import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { workoutLogs, coachingAnalyses } from "@/lib/db/schema"
import { eq, desc, and, gte, asc } from "drizzle-orm"
import { getScheduleRange, getAthleteTimezone } from "@/lib/services/plan.service"
import { resolveLocalDate } from "@/lib/plan/localDate"
import { RecentWorkoutsCard } from "@/components/RecentWorkoutsCard"
import { TrendCharts } from "@/components/TrendCharts"
import type { WeekBucket, PacePoint, ReadinessPoint } from "@/components/TrendCharts"
import { getKpiSnapshot } from "@/lib/services/kpi.service"
import { fmtPace, fmtDistance, fmtNum } from "@/lib/fmt"
import { computeReadiness } from "@/lib/analytics/readiness"
import type { NotebookEntry } from "@/app/workout/coach-actions"

function KpiCard({
  label,
  value,
  sub,
  highlight = false,
  trend,
  trendUp,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
  trend?: string
  trendUp?: boolean
}) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${highlight ? "text-amber-500" : "text-gray-900"}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      {trend && (
        <p className={`text-[10px] mt-0.5 ${trendUp ? "text-green-600" : "text-red-500"}`}>{trend}</p>
      )}
    </div>
  )
}

function paceTrend(
  currentMps: number | null,
  prevMps: number | null,
): { text: string; up: boolean } | null {
  if (currentMps == null || prevMps == null) return null
  const deltaSecs = 1609.344 / prevMps - 1609.344 / currentMps
  if (Math.abs(deltaSecs) < 5) return { text: "≈ same", up: true }
  const absSecs = Math.abs(Math.round(deltaSecs))
  let formatted: string
  if (absSecs >= 60) {
    const m = Math.floor(absSecs / 60)
    const s = absSecs % 60
    formatted = `${m}:${s.toString().padStart(2, "0")}/mi`
  } else {
    formatted = `${absSecs}s/mi`
  }
  return deltaSecs > 0
    ? { text: `↑ ${formatted} faster`, up: true }
    : { text: `↓ ${formatted} slower`, up: false }
}

function cadenceTrend(
  currentCad: number | null,
  prevCad: number | null,
): { text: string; up: boolean } | null {
  if (currentCad == null || prevCad == null) return null
  const delta = (currentCad - prevCad) * 2
  if (Math.abs(delta) < 2) return { text: "≈ same", up: true }
  const abs = Math.abs(Math.round(delta))
  return delta > 0
    ? { text: `↑ ${abs} spm`, up: true }
    : { text: `↓ ${abs} spm`, up: false }
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const userId = session.user.id

  const tz = await getAthleteTimezone(userId)
  const todayStr = resolveLocalDate(tz)

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const [scheduleResult, recentLogs, kpis, recentSnapshots, latestNotebook, trendWorkouts] = await Promise.all([
    getScheduleRange(userId, todayStr, 8),
    db
      .select({
        id: workoutLogs.id,
        sport: workoutLogs.sport,
        startTime: workoutLogs.startTime,
        totalDistanceM: workoutLogs.totalDistanceM,
        totalTimerSecs: workoutLogs.totalTimerSecs,
        avgSpeedMps: workoutLogs.avgSpeedMps,
        avgHr: workoutLogs.avgHr,
        hrDriftBpm: workoutLogs.hrDriftBpm,
        perceivedEffort: workoutLogs.perceivedEffort,
        sessionKindOverride: workoutLogs.sessionKindOverride,
      })
      .from(workoutLogs)
      .where(eq(workoutLogs.userId, userId))
      .orderBy(desc(workoutLogs.startTime))
      .limit(10),
    getKpiSnapshot(userId).catch(() => null),
    db
      .select({ responseParsed: coachingAnalyses.responseParsed, createdAt: coachingAnalyses.createdAt })
      .from(coachingAnalyses)
      .where(and(
        eq(coachingAnalyses.userId, userId),
        eq(coachingAnalyses.analysisType, "readiness_snapshot"),
      ))
      .orderBy(desc(coachingAnalyses.createdAt))
      .limit(20),
    db
      .select({ responseParsed: coachingAnalyses.responseParsed, createdAt: coachingAnalyses.createdAt })
      .from(coachingAnalyses)
      .where(and(
        eq(coachingAnalyses.userId, userId),
        eq(coachingAnalyses.analysisType, "notebook"),
      ))
      .orderBy(desc(coachingAnalyses.createdAt))
      .limit(1),
    db
      .select({
        startTime: workoutLogs.startTime,
        totalDistanceM: workoutLogs.totalDistanceM,
        avgSpeedMps: workoutLogs.avgSpeedMps,
        observedSessionKind: workoutLogs.observedSessionKind,
        sessionKindOverride: workoutLogs.sessionKindOverride,
      })
      .from(workoutLogs)
      .where(and(eq(workoutLogs.userId, userId), gte(workoutLogs.startTime, ninetyDaysAgo)))
      .orderBy(asc(workoutLogs.startTime)),
  ])

  if (!scheduleResult) redirect("/onboarding")

  const { scheduledDays } = scheduleResult
  const todayDay = scheduledDays[0]
  const upcomingDays = scheduledDays.slice(1)

  const todayLabel = todayDay
    ? `Week ${todayDay.cycleWeekId} · ${todayDay.weekday}`
    : ""

  const todaySessionSummary = todayDay && !todayDay.isRestDay && todayDay.sessions.length > 0
    ? todayDay.sessions.map((s) => s.label).join(" + ")
    : null

  // Readiness delta from last two snapshots
  let readinessDelta: number | null = null
  let readinessDeltaComponents: Record<string, number> | null = null
  if (recentSnapshots.length >= 2) {
    const curr = (recentSnapshots[0].responseParsed as Record<string, unknown> | null)
    const prev = (recentSnapshots[1].responseParsed as Record<string, unknown> | null)
    if (curr && prev && typeof curr.total === "number" && typeof prev.total === "number") {
      readinessDelta = curr.total - prev.total
      const currComp = curr.components as Record<string, number> | undefined
      const prevComp = prev.components as Record<string, number> | undefined
      if (currComp && prevComp) {
        readinessDeltaComponents = {
          aerobicEngine: (currComp.aerobicEngine ?? 0) - (prevComp.aerobicEngine ?? 0),
          threshold: (currComp.threshold ?? 0) - (prevComp.threshold ?? 0),
          longRun: (currComp.longRun ?? 0) - (prevComp.longRun ?? 0),
          consistency: (currComp.consistency ?? 0) - (prevComp.consistency ?? 0),
        }
      }
    }
  }

  const notebook = latestNotebook[0]?.responseParsed
    ? (latestNotebook[0].responseParsed as NotebookEntry)
    : null

  // Build trend chart data
  function weekStartKey(d: Date): string {
    const date = new Date(d)
    const day = date.getUTCDay()
    date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day))
    date.setUTCHours(0, 0, 0, 0)
    return date.toISOString().slice(0, 10)
  }

  // Generate last 8 week buckets (oldest → newest)
  const now = new Date()
  const weekBuckets = new Map<string, WeekBucket>()
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(now)
    const day = ws.getUTCDay()
    ws.setUTCDate(ws.getUTCDate() + (day === 0 ? -6 : 1 - day) - i * 7)
    ws.setUTCHours(0, 0, 0, 0)
    const key = ws.toISOString().slice(0, 10)
    const label = ws.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    weekBuckets.set(key, { week: label, miles: 0 })
  }
  for (const w of trendWorkouts) {
    if (!w.totalDistanceM || !w.startTime) continue
    const key = weekStartKey(new Date(w.startTime))
    const bucket = weekBuckets.get(key)
    if (bucket) bucket.miles = Math.round((bucket.miles + w.totalDistanceM / 1609.344) * 10) / 10
  }
  const weeklyMileageData: WeekBucket[] = Array.from(weekBuckets.values())

  // Easy + long runs for pace trend (last 15)
  const EASY_KINDS = new Set(["easy", "long", "recovery"])
  const paceTrendData: PacePoint[] = trendWorkouts
    .filter((w) => {
      const kind = w.sessionKindOverride ?? w.observedSessionKind
      return kind && EASY_KINDS.has(kind) && w.avgSpeedMps && w.avgSpeedMps > 0.5
    })
    .slice(-15)
    .map((w) => ({
      date: new Date(w.startTime!).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      paceDecimal: Math.round((1609.344 / w.avgSpeedMps! / 60) * 100) / 100,
    }))

  // Readiness score over time (oldest → newest)
  const readinessTrendData: ReadinessPoint[] = recentSnapshots
    .slice()
    .reverse()
    .flatMap((s) => {
      const p = s.responseParsed as Record<string, unknown> | null
      if (!p || typeof p.total !== "number" || !s.createdAt) return []
      return [{
        date: new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
        score: p.total,
      }]
    })

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tempo</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(todayStr + "T00:00:00.000Z").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </p>
        </div>

        {/* Today's workout */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
                {todayLabel}
              </p>
              <h2 className="text-lg font-bold text-gray-900 mt-1">Today&apos;s workout</h2>
            </div>
            <Link
              href="/log"
              className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
            >
              + Log workout
            </Link>
          </div>

          {todayDay ? (
            <Link href={`/plan/${todayStr}`} className="block mt-4 group">
              {todayDay.isRestDay ? (
                <p className="text-sm text-gray-400">Rest day — no sessions scheduled.</p>
              ) : (
                <div className="text-gray-700 text-sm leading-relaxed">
                  {todaySessionSummary ?? "View sessions"}
                </div>
              )}
              <p className="mt-3 text-sm font-medium text-orange-500 group-hover:underline">
                View full workout →
              </p>
            </Link>
          ) : (
            <p className="mt-4 text-sm text-gray-400">No schedule found for today.</p>
          )}
        </section>

        {/* Upcoming workouts */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Next 7 days</h2>
          <ul className="space-y-0">
            {upcomingDays.map((day) => {
              const dateObj = new Date(day.date + "T00:00:00.000Z")
              const weekLabel = `Week ${day.cycleWeekId}`
              const firstSession = day.sessions[0]
              const firstLine = firstSession ? firstSession.label : null

              return (
                <li key={day.id}>
                  <Link
                    href={`/plan/${day.date}`}
                    className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded-xl transition-colors"
                  >
                    <div className="w-10 shrink-0 text-center">
                      <p className="text-[11px] font-semibold uppercase text-gray-400 leading-none">
                        {dateObj.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                      </p>
                      <p className="text-lg font-bold text-gray-800 leading-tight mt-0.5">
                        {dateObj.getUTCDate()}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-1">
                        {weekLabel}
                      </span>
                      {day.isRestDay ? (
                        <p className="text-sm text-gray-300">Rest</p>
                      ) : firstLine ? (
                        <p className="text-sm text-gray-700 truncate">{firstLine}</p>
                      ) : (
                        <p className="text-sm text-gray-300">No sessions</p>
                      )}
                    </div>
                    <svg className="shrink-0 text-gray-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Goal Readiness Score + Milestone Forecasting */}
        {kpis != null && (() => {
          const r = computeReadiness(kpis)
          const componentList = [
            r.components.aerobicEngine,
            r.components.threshold,
            r.components.longRun,
            r.components.consistency,
            r.components.economy,
          ]

          const confidenceColor =
            r.confidenceLabel === "High"    ? "text-green-600 bg-green-50" :
            r.confidenceLabel === "Moderate" ? "text-amber-600 bg-amber-50" :
                                               "text-gray-500 bg-gray-100"

          // Explain delta in terms of components
          let deltaExplain = ""
          if (readinessDeltaComponents) {
            const parts: string[] = []
            const names: Record<string, string> = {
              aerobicEngine: "aerobic engine",
              threshold: "threshold",
              longRun: "long run",
              consistency: "consistency",
            }
            for (const [key, delta] of Object.entries(readinessDeltaComponents)) {
              if (Math.abs(delta) >= 3) {
                parts.push(`${delta > 0 ? "+" : ""}${delta} ${names[key] ?? key}`)
              }
            }
            if (parts.length > 0) deltaExplain = parts.join(", ")
          }

          return (
            <>
              {/* Readiness score card */}
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Goal readiness</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Half marathon · 7:20/mi · age 50</p>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <p className="text-3xl font-bold tabular-nums text-gray-900">{r.total}<span className="text-sm font-normal text-gray-400">/100</span></p>
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${confidenceColor}`}>
                      {r.confidenceLabel} confidence
                    </span>
                  </div>
                </div>

                {/* Delta row */}
                {readinessDelta != null && Math.abs(readinessDelta) >= 1 && (
                  <p className={`text-xs mb-3 ${readinessDelta >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {readinessDelta >= 0 ? `↑${readinessDelta}` : `↓${Math.abs(readinessDelta)}`} since last analysis
                    {deltaExplain ? ` · ${deltaExplain}` : ""}
                  </p>
                )}

                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1 mt-3">
                  <div className="h-2 rounded-full bg-orange-500 transition-all" style={{ width: `${r.total}%` }} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-4">{r.milestoneLabel}</p>
                <div className="space-y-2">
                  {componentList.map((c) => (
                    <div key={c.label} className="flex items-center gap-3">
                      <p className="text-[10px] font-semibold text-gray-500 w-24 shrink-0 truncate">{c.label}</p>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-1.5 rounded-full bg-orange-400" style={{ width: `${c.score}%` }} />
                      </div>
                      <span className="text-[10px] tabular-nums text-gray-400 w-8 text-right shrink-0">{c.score}</span>
                      <p className="w-28 text-[10px] text-gray-400 truncate hidden sm:block">{c.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-50">
                  <Link href="/performance" className="text-xs font-medium text-orange-500 hover:underline">
                    View full performance breakdown →
                  </Link>
                </div>
              </section>

              {/* Milestone Forecasting card */}
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-5">Milestones</h2>
                <div className="relative">
                  {r.milestoneStages.map((stage, idx) => {
                    const isGoal = stage.id === "goal"
                    const isCurrent = stage.id === "current"
                    const isLast = idx === r.milestoneStages.length - 1
                    const dotColor = stage.completed
                      ? "bg-green-500 border-green-500"
                      : stage.active
                      ? "bg-orange-500 border-orange-500"
                      : isCurrent
                      ? "bg-gray-900 border-gray-900"
                      : "bg-white border-gray-300"
                    const labelColor = stage.completed
                      ? "text-green-600"
                      : stage.active
                      ? "text-orange-500"
                      : isCurrent
                      ? "text-gray-900"
                      : "text-gray-400"

                    return (
                      <div key={stage.id} className="flex gap-4">
                        {/* Timeline spine */}
                        <div className="flex flex-col items-center w-5 shrink-0">
                          <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 ${dotColor}`} />
                          {!isLast && (
                            <div className={`w-px flex-1 my-1 ${stage.completed ? "bg-green-200" : "bg-gray-100"}`} />
                          )}
                        </div>

                        {/* Content */}
                        <div className={`pb-5 flex-1 min-w-0 ${isLast ? "pb-0" : ""}`}>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <p className={`text-sm font-bold ${labelColor}`}>{stage.label}</p>
                            {stage.completed && (
                              <span className="text-[10px] font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">Done</span>
                            )}
                            {stage.active && (
                              <span className="text-[10px] font-semibold text-orange-500 bg-orange-50 rounded-full px-2 py-0.5">In progress</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 mb-2">{stage.description}</p>

                          {isGoal ? null : (
                            <div className="space-y-1.5">
                              {stage.targets.map((t) => (
                                <div key={t.metric} className="flex items-start gap-2">
                                  <span className={`text-xs font-bold shrink-0 mt-0.5 ${
                                    t.achieved ? "text-green-500" : isCurrent ? "text-gray-500" : "text-gray-300"
                                  }`}>
                                    {isCurrent ? "·" : t.achieved ? "✓" : "·"}
                                  </span>
                                  <span className="text-[11px] text-gray-500 w-28 shrink-0">{t.metric}</span>
                                  <span className={`text-[11px] tabular-nums font-semibold ${
                                    isCurrent ? "text-gray-800" : t.achieved ? "text-green-700" : "text-gray-700"
                                  }`}>
                                    {t.current}
                                  </span>
                                  {!isCurrent && t.target && (
                                    <>
                                      <span className="text-[11px] text-gray-200 shrink-0">→</span>
                                      <span className="text-[11px] text-gray-400">{t.target}</span>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </>
          )
        })()}

        {/* Coach's Notebook */}
        {notebook && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-bold text-gray-900">Coach&apos;s Notebook</h2>
              <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                notebook.trajectory === "improving"   ? "bg-green-50 text-green-700" :
                notebook.trajectory === "plateauing"  ? "bg-amber-50 text-amber-700" :
                notebook.trajectory === "declining"   ? "bg-red-50 text-red-600" :
                                                        "bg-gray-100 text-gray-500"
              }`}>
                {notebook.trajectory === "improving"         ? "Improving" :
                 notebook.trajectory === "plateauing"        ? "Plateauing" :
                 notebook.trajectory === "declining"         ? "Declining" :
                 "Insufficient data"}
              </span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">{notebook.summary}</p>

            <div className="grid sm:grid-cols-2 gap-4">
              {notebook.strengths.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-1.5">Strengths</p>
                  <ul className="space-y-1">
                    {notebook.strengths.map((s, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-gray-600">
                        <span className="text-green-500 shrink-0 mt-0.5">↑</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {notebook.limiters.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1.5">Limiters</p>
                  <ul className="space-y-1">
                    {notebook.limiters.map((l, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-gray-600">
                        <span className="text-amber-500 shrink-0 mt-0.5">·</span>
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {notebook.nextUnlock && (
              <div className="mt-4 pt-3 border-t border-gray-50">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-1">Next unlock</p>
                <p className="text-xs text-gray-600">{notebook.nextUnlock}</p>
              </div>
            )}
          </section>
        )}

        {/* Performance KPIs */}
        {recentLogs.length > 0 && kpis != null && (() => {
          const threshTrend = paceTrend(kpis.thresholdSpeedMps, kpis.thresholdSpeedMpsPrev)
          const cadTempoTrend = cadenceTrend(kpis.cadenceTempo, kpis.cadenceTempoPrev)
          return (
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Performance</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KpiCard
                  label="Weekly mileage"
                  value={kpis.weeklyMileage != null ? fmtDistance(kpis.weeklyMileage) : "—"}
                />
                <KpiCard
                  label="Easy pace @140"
                  value={fmtPace(kpis.easyPaceAt140Mps)}
                  sub="HR-normalized"
                />
                <KpiCard
                  label="Aerobic efficiency"
                  value={kpis.aerobicEfficiency != null
                    ? fmtNum(kpis.aerobicEfficiency, 2, "m/min/bpm")
                    : "—"}
                />
                <KpiCard
                  label="HR drift"
                  value={kpis.hrDrift != null
                    ? `${kpis.hrDrift > 0 ? "+" : ""}${kpis.hrDrift.toFixed(1)} bpm`
                    : "—"}
                  sub="Last easy run"
                  highlight={kpis.hrDrift != null && kpis.hrDrift > 5}
                />
                <KpiCard
                  label="Threshold pace"
                  value={fmtPace(kpis.thresholdSpeedMps)}
                  sub="Last threshold"
                  trend={threshTrend?.text}
                  trendUp={threshTrend?.up}
                />
                <KpiCard
                  label="Long run"
                  value={fmtDistance(kpis.longRunDistanceM)}
                  sub="Last long run"
                />
                <KpiCard
                  label="Cadence — easy"
                  value={kpis.cadenceEasy != null ? `${kpis.cadenceEasy * 2} spm` : "—"}
                />
                <KpiCard
                  label="Cadence — tempo"
                  value={kpis.cadenceTempo != null ? `${kpis.cadenceTempo * 2} spm` : "—"}
                  trend={cadTempoTrend?.text}
                  trendUp={cadTempoTrend?.up}
                />
              </div>
            </section>
          )
        })()}

        {/* Training trends */}
        <TrendCharts
          weeklyMileage={weeklyMileageData}
          paceTrend={paceTrendData}
          readinessTrend={readinessTrendData}
        />

        {/* Recent workouts */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent workouts</h2>
          <RecentWorkoutsCard logs={recentLogs} />
        </section>

      </div>
    </main>
  )
}
