import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import {
  fmtPace, fmtDistance, fmtDuration, fmtDateLong, fmtTemp, fmtNum,
} from "@/lib/fmt"

// ── small helpers ─────────────────────────────────────────────────────────────

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-base font-bold text-gray-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">{title}</h2>
      {children}
    </section>
  )
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-4">{children}</div>
}

// ── effort label ──────────────────────────────────────────────────────────────

const EFFORT_LABELS: Record<number, string> = {
  1: "Very easy", 2: "Easy", 3: "Moderate", 4: "Hard", 5: "Very hard",
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const { id } = await params

  const rows = await db
    .select()
    .from(workoutLogs)
    .where(and(eq(workoutLogs.id, id), eq(workoutLogs.userId, session.user.id)))
    .limit(1)

  const log = rows[0]
  if (!log) notFound()

  const startDate = new Date(log.startTime)
  const sportLabel = log.sport
    ? log.sport.charAt(0).toUpperCase() + log.sport.slice(1)
    : "Activity"
  const subLabel = log.subSport && log.subSport !== log.sport ? log.subSport : null

  const hasRunWalk =
    log.runOnlyDistanceM != null || log.walkDurationSecs != null

  const laps = (log.laps as Record<string, unknown>[] | null) ?? []

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Back link */}
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Dashboard
        </Link>

        {/* Hero header */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500 mb-1">
            {sportLabel}{subLabel ? ` · ${subLabel}` : ""}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            {fmtDistance(log.totalDistanceM)}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{fmtDateLong(startDate)}</p>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-gray-50">
            <Stat label="Time" value={fmtDuration(log.totalTimerSecs)} />
            <Stat label="Avg pace" value={fmtPace(log.avgSpeedMps)} />
            <Stat label="Avg HR" value={log.avgHr ? `${log.avgHr} bpm` : "—"} sub={log.maxHr ? `max ${log.maxHr}` : undefined} />
          </div>

          {log.perceivedEffort && (
            <div className="mt-4">
              <span className="inline-block text-xs font-medium bg-orange-50 text-orange-600 rounded-full px-3 py-1">
                Effort {log.perceivedEffort}/5 — {EFFORT_LABELS[log.perceivedEffort]}
              </span>
            </div>
          )}

          {log.notes && (
            <p className="mt-4 text-sm text-gray-600 italic border-l-2 border-orange-200 pl-3">
              {log.notes}
            </p>
          )}
        </section>

        {/* Heart rate */}
        <Section title="Heart rate">
          <StatGrid>
            <Stat label="Avg" value={log.avgHr ? `${log.avgHr} bpm` : "—"} />
            <Stat label="Max" value={log.maxHr ? `${log.maxHr} bpm` : "—"} />
            <Stat
              label="HR drift"
              value={log.hrDriftBpm != null ? `${log.hrDriftBpm > 0 ? "+" : ""}${log.hrDriftBpm.toFixed(1)} bpm` : "—"}
              sub={log.hrDriftBpm != null && log.hrDriftBpm > 5 ? "⚠ High decoupling" : undefined}
            />
            <Stat label="1st half" value={log.firstHalfAvgHr ? `${log.firstHalfAvgHr} bpm` : "—"} />
            <Stat label="2nd half" value={log.secondHalfAvgHr ? `${log.secondHalfAvgHr} bpm` : "—"} />
            {log.avgRespirationRate != null && (
              <Stat label="Resp rate" value={fmtNum(log.avgRespirationRate, 1, "br/min")} />
            )}
          </StatGrid>
        </Section>

        {/* Pace & cadence */}
        <Section title="Pace & cadence">
          <StatGrid>
            <Stat label="Avg pace" value={fmtPace(log.avgSpeedMps)} />
            <Stat label="Best pace" value={fmtPace(log.maxSpeedMps)} />
            <Stat label="Avg cadence" value={log.avgCadence ? `${log.avgCadence * 2} spm` : "—"} sub={log.maxCadence ? `max ${log.maxCadence * 2}` : undefined} />
          </StatGrid>
        </Section>

        {/* Running dynamics — only show if we have data */}
        {(log.avgStrideLengthM != null ||
          log.avgVerticalOscillationMm != null ||
          log.avgStanceTimeMs != null) && (
          <Section title="Running dynamics">
            <StatGrid>
              <Stat label="Stride" value={fmtNum(log.avgStrideLengthM, 2, "m")} />
              <Stat label="Vert osc." value={fmtNum(log.avgVerticalOscillationMm, 1, "mm")} />
              <Stat label="Stance time" value={fmtNum(log.avgStanceTimeMs, 0, "ms")} />
              <Stat label="Stance %" value={fmtNum(log.avgStanceTimePct, 1, "%")} />
              <Stat label="Vert ratio" value={fmtNum(log.avgVerticalRatio, 1, "%")} />
            </StatGrid>
          </Section>
        )}

        {/* Training load */}
        {(log.trainingLoad != null ||
          log.aerobicTrainingEffect != null) && (
          <Section title="Training impact">
            <StatGrid>
              {log.trainingLoad != null && (
                <Stat label="Training load" value={fmtNum(log.trainingLoad, 0)} />
              )}
              {log.aerobicTrainingEffect != null && (
                <Stat
                  label="Aerobic TE"
                  value={fmtNum(log.aerobicTrainingEffect, 1)}
                  sub={log.aerobicTeMessage ?? undefined}
                />
              )}
              {log.anaerobicTrainingEffect != null && (
                <Stat
                  label="Anaerobic TE"
                  value={fmtNum(log.anaerobicTrainingEffect, 1)}
                  sub={log.anaerobicTeMessage ?? undefined}
                />
              )}
              {log.vo2Max != null && (
                <Stat label="VO₂ max" value={fmtNum(log.vo2Max, 1)} />
              )}
            </StatGrid>
          </Section>
        )}

        {/* Elevation */}
        {log.totalAscentM != null && (
          <Section title="Elevation">
            <StatGrid>
              <Stat label="Ascent" value={fmtNum(log.totalAscentM, 0, "m")} />
              <Stat label="Descent" value={fmtNum(log.totalDescentM, 0, "m")} />
              <Stat label="Max alt." value={fmtNum(log.maxAltitudeM, 0, "m")} />
            </StatGrid>
          </Section>
        )}

        {/* Run / walk split */}
        {hasRunWalk && (
          <Section title="Run / walk split">
            <div className="space-y-3">
              {log.runOnlyDistanceM != null && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Running</p>
                  <div className="grid grid-cols-3 gap-4">
                    <Stat label="Distance" value={fmtDistance(log.runOnlyDistanceM)} />
                    <Stat label="Time" value={fmtDuration(log.runOnlyDurationSecs)} />
                    <Stat label="Avg pace" value={fmtPace(log.runOnlyAvgSpeedMps)} />
                  </div>
                </div>
              )}
              {log.walkDurationSecs != null && log.walkDurationSecs > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-3 mb-2">Walking</p>
                  <Stat label="Time" value={fmtDuration(log.walkDurationSecs)} />
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Other */}
        <Section title="Other">
          <StatGrid>
            <Stat label="Calories" value={log.totalCalories ? `${log.totalCalories} kcal` : "—"} />
            <Stat label="Avg temp" value={fmtTemp(log.avgTemperatureC)} />
            <Stat label="Duration" value={fmtDuration(log.totalElapsedSecs)} sub="elapsed" />
          </StatGrid>
        </Section>

        {/* Laps */}
        {laps.length > 0 && (
          <Section title={`Laps (${laps.length})`}>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-50">
                    <th className="pb-2 font-semibold pr-3">#</th>
                    <th className="pb-2 font-semibold pr-3">Dist</th>
                    <th className="pb-2 font-semibold pr-3">Time</th>
                    <th className="pb-2 font-semibold pr-3">Pace</th>
                    <th className="pb-2 font-semibold pr-3">HR</th>
                  </tr>
                </thead>
                <tbody>
                  {laps.map((lap, i) => {
                    const dist = lap.total_distance as number | undefined
                    const time = (lap.total_timer_time ?? lap.total_elapsed_time) as number | undefined
                    const speed = lap.avg_speed as number | undefined
                    const hr = lap.avg_heart_rate as number | undefined
                    return (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pr-3 text-gray-400">{i + 1}</td>
                        <td className="py-2 pr-3 font-medium text-gray-800">{fmtDistance(dist ?? null)}</td>
                        <td className="py-2 pr-3 text-gray-600">{fmtDuration(time ?? null)}</td>
                        <td className="py-2 pr-3 text-gray-600">{fmtPace(speed ?? null)}</td>
                        <td className="py-2 pr-3 text-gray-600">{hr ? `${hr} bpm` : "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

      </div>
    </main>
  )
}
