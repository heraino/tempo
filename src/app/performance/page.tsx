import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getKpiSnapshot } from "@/lib/services/kpi.service"
import { computeReadiness, programContextFromPlanJson, type MilestoneStage } from "@/lib/analytics/readiness"
import { getActiveGoal } from "@/lib/services/goal.service"
import { getActivePlanVersion } from "@/lib/services/plan.service"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import { describeGoal } from "@/lib/goals/goal"
import { fmtPace, fmtDistance, fmtNum } from "@/lib/fmt"

/** Formatted target string for a metric at a given milestone stage, or null
 *  when there's no goal (and so no ladder) to read a target from. */
function targetAt(stages: MilestoneStage[], stageId: string, metric: string): string | null {
  return stages.find((s) => s.id === stageId)?.targets.find((t) => t.metric === metric)?.target ?? null
}

/** Whether the athlete's current value has already met a stage's target. */
function achievedAt(stages: MilestoneStage[], stageId: string, metric: string): boolean {
  return stages.find((s) => s.id === stageId)?.targets.find((t) => t.metric === metric)?.achieved ?? false
}

function StatRow({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: "good" | "warn"
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-semibold tabular-nums ${
          highlight === "good" ? "text-green-600" :
          highlight === "warn" ? "text-amber-600" :
          "text-gray-900"
        }`}>{value}</span>
        {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      {eyebrow && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">{eyebrow}</p>
      )}
      <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  )
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-[10px] font-semibold text-gray-500 w-28 shrink-0 truncate">{label}</p>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-1.5 rounded-full bg-orange-400 transition-all" style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-gray-400 w-8 text-right shrink-0">{score}</span>
    </div>
  )
}

export default async function PerformancePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  const userId = session.user.id

  const [kpis, activeGoal, activePlanVersion, prefs] = await Promise.all([
    getKpiSnapshot(userId).catch(() => null),
    getActiveGoal(userId).catch(() => null),
    getActivePlanVersion(userId).catch(() => null),
    getUserPreferences(userId),
  ])

  if (!kpis) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
        <div className="max-w-2xl mx-auto space-y-5">
          <Link href="/dashboard" className="text-sm text-orange-500 hover:underline">← Dashboard</Link>
          <p className="text-sm text-gray-400 text-center py-12">No workout data yet. Log some runs to see your performance breakdown.</p>
        </div>
      </main>
    )
  }

  const units = prefs.unitsSystem as "imperial" | "metric"
  const programContext = activePlanVersion ? programContextFromPlanJson(activePlanVersion.planJson) : null
  const r = computeReadiness(kpis, null, activeGoal, programContext)
  const hasLadder = r.milestoneStages.length > 1

  const cadenceEasySpm   = kpis.cadenceEasy  != null ? kpis.cadenceEasy  * 2 : null
  const cadenceTempoSpm  = kpis.cadenceTempo != null ? kpis.cadenceTempo * 2 : null

  const confidenceColor =
    r.confidenceLabel === "High"    ? "text-green-600 bg-green-50" :
    r.confidenceLabel === "Moderate" ? "text-amber-600 bg-amber-50" :
                                       "text-gray-500 bg-gray-100"

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Back link + header */}
        <div>
          <Link href="/dashboard" className="text-sm text-orange-500 hover:underline">← Dashboard</Link>
          <div className="flex items-end justify-between mt-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {activeGoal ? `Goal: ${describeGoal(activeGoal, units)}` : "General fitness"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold tabular-nums text-gray-900">{r.total}<span className="text-sm font-normal text-gray-400">/100</span></p>
              <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${confidenceColor}`}>
                {r.confidenceLabel} confidence
              </span>
            </div>
          </div>
        </div>

        {/* Readiness score breakdown */}
        <Section eyebrow="Goal readiness" title={r.milestoneLabel}>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div className="h-2 rounded-full bg-orange-500" style={{ width: `${r.total}%` }} />
          </div>
          <div className="space-y-2.5">
            {[
              r.components.aerobicEngine,
              r.components.threshold,
              r.components.longRun,
              r.components.consistency,
              r.components.frequency,
              r.components.economy,
            ]
              .filter((c) => c.weight > 0)
              .map((c) => (
                <ScoreBar key={c.label} score={c.score} label={`${c.label} · ${c.weight}%`} />
              ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-4">
            Confidence {r.confidence}/100 · based on {kpis.recentWorkoutCount} recent workouts
          </p>
        </Section>

        {/* System 1: Aerobic Engine */}
        <Section eyebrow={`System 1 · ${r.components.aerobicEngine.weight}% weight`} title="Aerobic Engine">
          {kpis.easyPaceAt140Mps ? (
            <>
              <StatRow
                label="Easy pace @140 bpm"
                value={fmtPace(kpis.easyPaceAt140Mps)}
                sub="HR-normalized to 140 bpm"
                highlight={achievedAt(r.milestoneStages, "m1", "Aerobic engine") ? "good" : undefined}
              />
              {kpis.easyPaceAt145Mps != null && (
                <StatRow
                  label="Easy pace @145 bpm"
                  value={fmtPace(kpis.easyPaceAt145Mps)}
                  sub="HR-normalized to 145 bpm"
                />
              )}
              {kpis.aerobicEfficiency != null && (
                <StatRow
                  label="Aerobic efficiency"
                  value={fmtNum(kpis.aerobicEfficiency, 2, "m/min/bpm")}
                  sub="Speed per HR unit"
                />
              )}
              {kpis.hrDrift != null && (
                <StatRow
                  label="HR drift (last easy run)"
                  value={`${kpis.hrDrift > 0 ? "+" : ""}${kpis.hrDrift.toFixed(1)} bpm`}
                  sub={kpis.hrDrift > 5 ? "Elevated — monitor" : "Normal"}
                  highlight={kpis.hrDrift > 5 ? "warn" : "good"}
                />
              )}
              {kpis.decouplingPct != null && (
                <StatRow
                  label="Aerobic decoupling"
                  value={`${kpis.decouplingPct > 0 ? "+" : ""}${kpis.decouplingPct.toFixed(1)}%`}
                  sub={kpis.decouplingPct > 5 ? "Elevated cardiac drift" : kpis.decouplingPct <= 5 ? "Well-coupled" : "Normal"}
                  highlight={kpis.decouplingPct > 5 ? "warn" : "good"}
                />
              )}
              {cadenceEasySpm != null && (
                <StatRow
                  label="Cadence (easy)"
                  value={`${cadenceEasySpm} spm`}
                  sub={cadenceEasySpm >= 170 ? "Excellent" : cadenceEasySpm >= 160 ? "Good" : "Room to improve"}
                  highlight={cadenceEasySpm >= 170 ? "good" : cadenceEasySpm < 155 ? "warn" : undefined}
                />
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No easy run data yet. Log an easy run for aerobic engine metrics.</p>
          )}

          {hasLadder && (
            <div className="mt-4 pt-3 border-t border-gray-50">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Milestone targets</p>
              <div className="flex flex-wrap gap-3 text-[11px]">
                {(["m1", "m2", "m3", "goal"] as const).map((stageId, i) => {
                  const target = targetAt(r.milestoneStages, stageId, "Aerobic engine")
                  if (!target) return null
                  const stageLabel = stageId === "goal" ? "Goal" : `M${i + 1}`
                  return (
                    <span key={stageId} className="text-gray-500">
                      {i > 0 && <span className="text-gray-300 mr-3">·</span>}
                      {stageLabel}: <span className="font-semibold text-gray-700">{target}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </Section>

        {/* System 2: Threshold */}
        <Section eyebrow={`System 2 · ${r.components.threshold.weight}% weight`} title="Threshold">
          {kpis.thresholdSpeedMps ? (
            <>
              <StatRow
                label="Threshold pace"
                value={fmtPace(kpis.thresholdSpeedMps)}
                sub="Quality laps only (no warmup/cooldown)"
                highlight={achievedAt(r.milestoneStages, "m1", "Threshold") ? "good" : undefined}
              />
              {kpis.thresholdSpeedMpsPrev != null && (
                (() => {
                  const deltaSecs = 1609.344 / kpis.thresholdSpeedMpsPrev - 1609.344 / (kpis.thresholdSpeedMps ?? 1)
                  const dir = deltaSecs > 5 ? "↑ faster" : deltaSecs < -5 ? "↓ slower" : "≈ same"
                  const abs = Math.abs(Math.round(deltaSecs))
                  const label = Math.abs(deltaSecs) < 5 ? "≈ same as previous" : `${dir} (${abs}s/mi vs previous)`
                  return (
                    <StatRow
                      label="Trend vs previous"
                      value={label}
                      highlight={deltaSecs > 5 ? "good" : deltaSecs < -5 ? "warn" : undefined}
                    />
                  )
                })()
              )}
              {cadenceTempoSpm != null && (
                <StatRow
                  label="Cadence (tempo/threshold)"
                  value={`${cadenceTempoSpm} spm`}
                  sub="Quality laps · single-foot × 2"
                  highlight={cadenceTempoSpm >= 172 ? "good" : cadenceTempoSpm < 160 ? "warn" : undefined}
                />
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No threshold or tempo run data yet.</p>
          )}

          {hasLadder && (
            <div className="mt-4 pt-3 border-t border-gray-50">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Milestone targets</p>
              <div className="flex flex-wrap gap-3 text-[11px]">
                {(["m1", "m2", "m3", "goal"] as const).map((stageId, i) => {
                  const target = targetAt(r.milestoneStages, stageId, "Threshold")
                  if (!target) return null
                  const stageLabel = stageId === "goal" ? "Goal" : `M${i + 1}`
                  return (
                    <span key={stageId} className="text-gray-500">
                      {i > 0 && <span className="text-gray-300 mr-3">·</span>}
                      {stageLabel}: <span className="font-semibold text-gray-700">{target}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </Section>

        {/* System 3: Long Run */}
        <Section eyebrow={`System 3 · ${r.components.longRun.weight}% weight`} title="Long Run">
          {kpis.longRunDistanceM ? (
            <>
              <StatRow
                label="Last long run"
                value={fmtDistance(kpis.longRunDistanceM)}
                highlight={achievedAt(r.milestoneStages, "m1", "Long run") ? "good" : undefined}
              />
              {kpis.weeklyMileage != null && (
                <StatRow
                  label="Weekly mileage"
                  value={`${fmtDistance(kpis.weeklyMileage)}/wk`}
                  sub="Last 7 days"
                />
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No long run data yet. Log a long run to see durability metrics.</p>
          )}

          {hasLadder && (
            <div className="mt-4 pt-3 border-t border-gray-50">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Milestone targets</p>
              <div className="flex flex-wrap gap-3 text-[11px]">
                {(["m1", "m2", "m3", "goal"] as const).map((stageId, i) => {
                  const target = targetAt(r.milestoneStages, stageId, "Long run")
                  if (!target) return null
                  const stageLabel = stageId === "goal" ? "Goal" : `M${i + 1}`
                  return (
                    <span key={stageId} className="text-gray-500">
                      {i > 0 && <span className="text-gray-300 mr-3">·</span>}
                      {stageLabel}: <span className="font-semibold text-gray-700">{target}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </Section>

        {/* System 4: Running Economy */}
        <Section eyebrow={`System 4 · ${r.components.economy.weight}% weight`} title="Running Economy">
          {cadenceEasySpm == null && cadenceTempoSpm == null && kpis.vertOscMm == null ? (
            <p className="text-sm text-gray-400">No economy data yet. Upload workouts from a GPS watch to see these metrics.</p>
          ) : (
            <>
              {/* Cadence */}
              {cadenceEasySpm != null && (
                <StatRow
                  label="Cadence — easy runs"
                  value={`${cadenceEasySpm} spm`}
                  sub="Higher is generally more efficient"
                  highlight={cadenceEasySpm >= 170 ? "good" : cadenceEasySpm < 155 ? "warn" : undefined}
                />
              )}
              {cadenceTempoSpm != null && (
                <StatRow
                  label="Cadence — tempo/threshold"
                  value={`${cadenceTempoSpm} spm`}
                  sub="Quality laps only"
                  highlight={cadenceTempoSpm >= 172 ? "good" : cadenceTempoSpm < 160 ? "warn" : undefined}
                />
              )}

              {/* Running dynamics (Garmin) */}
              {kpis.vertOscMm != null && (
                <StatRow
                  label="Vertical oscillation"
                  value={`${kpis.vertOscMm.toFixed(1)} mm`}
                  sub="Lower = less wasted vertical energy"
                  highlight={kpis.vertOscMm < 70 ? "good" : kpis.vertOscMm > 85 ? "warn" : undefined}
                />
              )}
              {kpis.stanceTimeMs != null && (
                <StatRow
                  label="Ground contact time"
                  value={`${Math.round(kpis.stanceTimeMs)} ms`}
                  sub="Lower = more elastic, less braking"
                  highlight={kpis.stanceTimeMs < 220 ? "good" : kpis.stanceTimeMs > 260 ? "warn" : undefined}
                />
              )}
              {kpis.vertRatio != null && (
                <StatRow
                  label="Vertical ratio"
                  value={`${kpis.vertRatio.toFixed(1)}%`}
                  sub="Oscillation / stride length — lower is better"
                  highlight={kpis.vertRatio < 8 ? "good" : kpis.vertRatio > 10 ? "warn" : undefined}
                />
              )}
              {kpis.strideLengthM != null && (
                <StatRow
                  label="Stride length"
                  value={`${kpis.strideLengthM.toFixed(2)} m`}
                  sub="Session average"
                />
              )}
            </>
          )}

          <div className="mt-4 pt-3 border-t border-gray-50 space-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Cadence benchmarks</p>
              <div className="flex flex-wrap gap-3 text-[11px]">
                <span className="text-gray-500">Floor: <span className="font-semibold text-gray-700">150 spm</span></span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500">Good: <span className="font-semibold text-gray-700">160–170 spm</span></span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500">Optimal: <span className="font-semibold text-gray-700">172+ spm</span></span>
              </div>
            </div>
            {kpis.vertOscMm != null && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Running dynamics benchmarks</p>
                <div className="flex flex-wrap gap-3 text-[11px]">
                  <span className="text-gray-500">Osc: <span className="font-semibold text-gray-700">&lt;70mm good</span></span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-500">GCT: <span className="font-semibold text-gray-700">&lt;220ms good</span></span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-500">Vert ratio: <span className="font-semibold text-gray-700">&lt;8% good</span></span>
                </div>
              </div>
            )}
          </div>
        </Section>

      </div>
    </main>
  )
}
