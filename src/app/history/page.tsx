import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, desc, and, gte, lte } from "drizzle-orm"
import { fmtPace, fmtDistance, fmtDuration, fmtDate, resolveSpeedMps } from "@/lib/fmt"

const KIND_LABELS: Record<string, string> = {
  easy: "Easy",
  long: "Long run",
  tempo: "Tempo",
  threshold: "Threshold",
  recovery: "Recovery",
  other: "Other",
}

const KIND_COLORS: Record<string, string> = {
  easy: "bg-green-50 text-green-700",
  long: "bg-blue-50 text-blue-700",
  tempo: "bg-orange-50 text-orange-700",
  threshold: "bg-red-50 text-red-700",
  recovery: "bg-gray-100 text-gray-500",
  other: "bg-gray-100 text-gray-500",
}

const PAGE_SIZE = 20

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  const userId = session.user.id

  const sp = await searchParams
  const kind = typeof sp.kind === "string" ? sp.kind : "all"
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10))

  const conditions = [eq(workoutLogs.userId, userId)]

  // Build filter: kind "all" shows everything; otherwise filter by sessionKindOverride
  // (observedSessionKind fallback would require a subquery — skip for now)
  const kindOptions = ["all", "easy", "long", "tempo", "threshold", "recovery", "other"]

  const rows = await db
    .select({
      id: workoutLogs.id,
      startTime: workoutLogs.startTime,
      sport: workoutLogs.sport,
      subSport: workoutLogs.subSport,
      totalDistanceM: workoutLogs.totalDistanceM,
      totalTimerSecs: workoutLogs.totalTimerSecs,
      avgSpeedMps: workoutLogs.avgSpeedMps,
      avgHr: workoutLogs.avgHr,
      perceivedEffort: workoutLogs.perceivedEffort,
      sessionKindOverride: workoutLogs.sessionKindOverride,
      observedSessionKind: workoutLogs.observedSessionKind,
    })
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(desc(workoutLogs.startTime))
    .limit(PAGE_SIZE + 1)  // fetch one extra to detect next page
    .offset((page - 1) * PAGE_SIZE)

  const hasNext = rows.length > PAGE_SIZE
  const workouts = rows.slice(0, PAGE_SIZE)

  function makeUrl(newKind: string, newPage: number) {
    const params = new URLSearchParams()
    if (newKind !== "all") params.set("kind", newKind)
    if (newPage > 1) params.set("page", String(newPage))
    const qs = params.toString()
    return `/history${qs ? `?${qs}` : ""}`
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workout history</h1>
          <p className="text-sm text-gray-400 mt-0.5">{workouts.length} workouts shown</p>
        </div>

        {/* Kind filter */}
        <div className="flex gap-2 flex-wrap">
          {kindOptions.map((k) => (
            <Link
              key={k}
              href={makeUrl(k, 1)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 transition-colors ${
                kind === k
                  ? "bg-orange-500 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-orange-300"
              }`}
            >
              {k === "all" ? "All" : KIND_LABELS[k] ?? k}
            </Link>
          ))}
        </div>

        {/* Workout list */}
        {workouts.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No workouts found.</p>
        ) : (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {workouts.map((w) => {
              const resolvedKind = w.sessionKindOverride ?? w.observedSessionKind ?? null
              const kindLabel = resolvedKind ? (KIND_LABELS[resolvedKind] ?? resolvedKind) : null
              const kindColor = resolvedKind ? (KIND_COLORS[resolvedKind] ?? KIND_COLORS.other) : KIND_COLORS.other
              const speedMps = resolveSpeedMps(w.avgSpeedMps, w.totalDistanceM, w.totalTimerSecs)
              const rawSport = w.sport ?? ""
              const rawSub = w.subSport ?? ""
              const isGeneric = rawSport === "running" && (!rawSub || rawSub === "generic" || rawSub === rawSport)
              const sportDisplay = isGeneric
                ? "Overall Run"
                : rawSport
                ? rawSport.charAt(0).toUpperCase() + rawSport.slice(1)
                : "Activity"

              return (
                <Link
                  key={w.id}
                  href={`/workout/${w.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group"
                >
                  {/* Date */}
                  <div className="w-10 shrink-0 text-center">
                    <p className="text-[10px] font-semibold uppercase text-gray-400 leading-none">
                      {new Date(w.startTime).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                    </p>
                    <p className="text-lg font-bold text-gray-800 leading-tight mt-0.5">
                      {new Date(w.startTime).getUTCDate()}
                    </p>
                    <p className="text-[9px] text-gray-400 leading-none">
                      {new Date(w.startTime).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}
                    </p>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-gray-900 truncate">{sportDisplay}</p>
                      {kindLabel && (
                        <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${kindColor}`}>
                          {kindLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span className="font-semibold text-gray-800">{fmtDistance(w.totalDistanceM)}</span>
                      <span className="text-gray-300">·</span>
                      <span>{fmtDuration(w.totalTimerSecs)}</span>
                      <span className="text-gray-300">·</span>
                      <span>{fmtPace(speedMps)}</span>
                      {w.avgHr && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>{w.avgHr} bpm</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Effort + chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    {w.perceivedEffort && (
                      <span className="text-[10px] font-semibold bg-orange-50 text-orange-500 rounded-full px-2 py-0.5">
                        {w.perceivedEffort}/5
                      </span>
                    )}
                    <svg className="text-gray-300 group-hover:text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </Link>
              )
            })}
          </section>
        )}

        {/* Pagination */}
        {(page > 1 || hasNext) && (
          <div className="flex justify-between pt-2">
            {page > 1 ? (
              <Link href={makeUrl(kind, page - 1)} className="text-sm font-medium text-orange-500 hover:underline">
                ← Newer
              </Link>
            ) : <span />}
            {hasNext && (
              <Link href={makeUrl(kind, page + 1)} className="text-sm font-medium text-orange-500 hover:underline">
                Older →
              </Link>
            )}
          </div>
        )}

      </div>
    </main>
  )
}
