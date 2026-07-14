import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { workoutLogs, fitFiles } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import {
  fmtPace, fmtDistance, fmtDuration, fmtDateLong, fmtTemp, fmtNum, resolveSpeedMps,
} from "@/lib/fmt"
import { getAthleteContextForWorkout } from "@/lib/services/athleteContext.service"
import { getPainObservationsForWorkout } from "@/lib/services/painObservation.service"

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

const PAIN_LEVEL_COLORS: Record<number, string> = {
  0: "text-green-600",
  1: "text-green-600",
  2: "text-green-600",
  3: "text-yellow-600",
  4: "text-yellow-600",
  5: "text-orange-500",
  6: "text-orange-500",
  7: "text-red-500",
  8: "text-red-500",
  9: "text-red-700",
  10: "text-red-700",
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

  // Load workout log + fit file + athlete context + pain observations in parallel
  const [rows, athleteContext, painObs] = await Promise.all([
    db
      .select({
        log: workoutLogs,
        fitFile: fitFiles,
      })
      .from(workoutLogs)
      .leftJoin(fitFiles, eq(workoutLogs.fitFileId, fitFiles.id))
      .where(and(eq(workoutLogs.id, id), eq(workoutLogs.userId, session.user.id)))
      .limit(1),
    getAthleteContextForWorkout(id),
    getPainObservationsForWorkout(id),
  ])

  const row = rows[0]
  if (!row) notFound()

  const { log, fitFile } = row
  const startDate = new Date(log.startTime)
  const sportLabel = log.sport
    ? log.sport.charAt(0).toUpperCase() + log.sport.slice(1)
    : "Activity"
  const subLabel = log.subSport && log.subSport !== log.sport ? log.subSport : null

  const hasRunWalk =
    log.runOnlyDistanceM != null || log.walkDurationSecs != null

  const laps = (log.laps as Record<string, unknown>[] | null) ?? []

  // Fallback for workouts uploaded before the parser fix (treadmill/indoor)
  const avgSpeedMps = resolveSpeedMps(log.avgSpeedMps, log.totalDistanceM, log.totalTimerSecs)

  // Backward-compat: old rows stored training_load_peak as raw scaled uint32 (scale=65536)
  const displayTrainingLoad =
    log.trainingLoad != null
      ? log.trainingLoad > 1000
        ? log.trainingLoad / 65536
        : log.trainingLoad
      : null

  // Laps totals for the summary row
  let lapSumDist = 0, lapSumTime = 0, lapSumAscent = 0, lapSumDescent = 0
  let lapHasElevation = false
  for (const lap of laps) {
    lapSumDist += (lap.total_distance as number | undefined) ?? 0
    lapSumTime += ((lap.total_timer_time ?? lap.total_elapsed_time) as number | undefined) ?? 0
    const a = lap.total_ascent as number | undefined
    const d = lap.total_descent as number | undefined
    if (a != null) { lapSumAscent += a; lapHasElevation = true }
    if (d != null) lapSumDescent += d
  }
  const lapTotalSpeed = lapSumTime > 0 ? lapSumDist / lapSumTime : null
  const lapTotalGapSpeed =
    lapHasElevation && lapTotalSpeed != null && lapSumDist > 0
      ? lapTotalSpeed * (1 + 0.029 * ((lapSumAscent - lapSumDescent) / lapSumDist) * 100)
      : null

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
            <Stat label="Avg pace" value={fmtPace(avgSpeedMps)} />
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

        {/* Athlete context */}
        {athleteContext && (
          <Section title="Post-run context">
            <div className="space-y-3">
              {athleteContext.feel && (
                <p className="text-sm text-gray-700 italic border-l-2 border-orange-200 pl-3">
                  &ldquo;{athleteContext.feel}&rdquo;
                </p>
              )}
              <div className="grid grid-cols-3 gap-4">
                {athleteContext.outsideTempC != null && (
                  <Stat label="Conditions" value={fmtTemp(athleteContext.outsideTempC)} sub={athleteContext.humidityPct != null ? `${athleteContext.humidityPct}% humidity` : undefined} />
                )}
                {athleteContext.sleepQuality != null && (
                  <Stat label="Sleep" value={`${athleteContext.sleepQuality}/5`} />
                )}
                {athleteContext.rpe != null && (
                  <Stat label="RPE" value={`${athleteContext.rpe}/5`} />
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {athleteContext.travel && (
                  <span className="text-xs bg-blue-50 text-blue-600 rounded-full px-2.5 py-1 font-medium">Traveling</span>
                )}
                {athleteContext.massage && (
                  <span className="text-xs bg-green-50 text-green-600 rounded-full px-2.5 py-1 font-medium">Massage</span>
                )}
                {athleteContext.illness && (
                  <span className="text-xs bg-red-50 text-red-600 rounded-full px-2.5 py-1 font-medium">Unwell</span>
                )}
              </div>
              {athleteContext.nutritionNotes && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Nutrition:</span> {athleteContext.nutritionNotes}
                </p>
              )}
              {athleteContext.freeText && (
                <p className="text-xs text-gray-500">{athleteContext.freeText}</p>
              )}
            </div>
          </Section>
        )}

        {/* Pain observations */}
        {painObs.length > 0 && (
          <Section title={`Pain observations (${painObs.length})`}>
            <div className="space-y-3">
              {painObs.map((obs) => (
                <div key={obs.id} className="flex items-start gap-3 border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                  <div className={`text-lg font-bold ${PAIN_LEVEL_COLORS[obs.level0to10] ?? "text-gray-700"} shrink-0 w-8 text-center`}>
                    {obs.level0to10}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {obs.side && obs.side !== "none" ? `${obs.side.charAt(0).toUpperCase() + obs.side.slice(1)} ` : ""}
                      {obs.location}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {obs.character && (
                        <span className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{obs.character}</span>
                      )}
                      {obs.onset && (
                        <span className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                          {obs.onset.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    {obs.notes && (
                      <p className="text-xs text-gray-400 mt-1">{obs.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

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
            <Stat label="Avg pace" value={fmtPace(avgSpeedMps)} />
            <Stat label="Best pace" value={fmtPace(log.maxSpeedMps)} />
            <Stat label="Avg cadence" value={log.avgCadence ? `${log.avgCadence * 2} spm` : "—"} sub={log.maxCadence ? `max ${log.maxCadence * 2}` : undefined} />
          </StatGrid>
        </Section>

        {/* Running dynamics */}
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

        {/* Training impact */}
        {(displayTrainingLoad != null || log.aerobicTrainingEffect != null) && (
          <Section title="Training impact">
            <StatGrid>
              {displayTrainingLoad != null && (
                <Stat label="Training load" value={fmtNum(displayTrainingLoad, 0)} />
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
                    <th className="pb-2 font-semibold pr-3">GAP</th>
                    <th className="pb-2 font-semibold pr-3">HR</th>
                  </tr>
                </thead>
                <tbody>
                  {laps.map((lap, i) => {
                    const dist = lap.total_distance as number | undefined
                    const time = (lap.total_timer_time ?? lap.total_elapsed_time) as number | undefined
                    const speed = (
                      lap.avg_speed ??
                      lap.enhanced_avg_speed ??
                      (dist && time && time > 0 ? dist / time : undefined)
                    ) as number | undefined
                    const hr = lap.avg_heart_rate as number | undefined
                    const ascent = lap.total_ascent as number | undefined
                    const descent = lap.total_descent as number | undefined
                    const gapSpeed =
                      ascent != null && descent != null && dist && dist > 0 && speed
                        ? speed * (1 + 0.029 * ((ascent - descent) / dist) * 100)
                        : null
                    return (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 pr-3 text-gray-400">{i + 1}</td>
                        <td className="py-2 pr-3 font-medium text-gray-800">{fmtDistance(dist ?? null)}</td>
                        <td className="py-2 pr-3 text-gray-600">{fmtDuration(time ?? null)}</td>
                        <td className="py-2 pr-3 text-gray-600">{fmtPace(speed ?? null)}</td>
                        <td className="py-2 pr-3 text-gray-600">{fmtPace(gapSpeed)}</td>
                        <td className="py-2 pr-3 text-gray-600">{hr ? `${hr} bpm` : "—"}</td>
                      </tr>
                    )
                  })}
                  {/* Totals row */}
                  <tr className="border-t-2 border-gray-100 font-semibold text-gray-800">
                    <td className="pt-3 pr-3 text-gray-400">Σ</td>
                    <td className="pt-3 pr-3">{fmtDistance(lapSumDist || null)}</td>
                    <td className="pt-3 pr-3">{fmtDuration(lapSumTime || null)}</td>
                    <td className="pt-3 pr-3">{fmtPace(lapTotalSpeed)}</td>
                    <td className="pt-3 pr-3">{fmtPace(lapTotalGapSpeed)}</td>
                    <td className="pt-3 pr-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Source data */}
        {fitFile && (
          <Section title="Source data">
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-gray-400 shrink-0 w-28">File</dt>
                <dd className="text-gray-700 break-all">{fitFile.fileName ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 shrink-0 w-28">Size</dt>
                <dd className="text-gray-700">
                  {fitFile.fileSizeBytes != null
                    ? `${(fitFile.fileSizeBytes / 1024).toFixed(1)} KB`
                    : "—"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 shrink-0 w-28">SHA-256</dt>
                <dd className="text-gray-500 font-mono text-xs break-all">{fitFile.sha256}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 shrink-0 w-28">Parser</dt>
                <dd className="text-gray-500 font-mono text-xs">{fitFile.parserVersion}</dd>
              </div>
              {fitFile.blobUrl && !fitFile.blobUrl.startsWith("local://") && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-28">Source file</dt>
                  <dd>
                    <a
                      href={fitFile.blobUrl}
                      className="text-orange-500 hover:underline text-xs"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download original ↗
                    </a>
                  </dd>
                </div>
              )}
              {fitFile.blobUrl?.startsWith("local://") && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 shrink-0 w-28">Storage</dt>
                  <dd className="text-gray-400 text-xs italic">Local dev (no blob)</dd>
                </div>
              )}
            </dl>
          </Section>
        )}

      </div>
    </main>
  )
}
