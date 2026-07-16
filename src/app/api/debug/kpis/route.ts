import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { heuristicClassify } from "@/lib/analytics/classify"
import { computeKpiSnapshot } from "@/lib/analytics/kpis"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  try {
    const rows = await db
      .select({
        id: workoutLogs.id,
        startTime: workoutLogs.startTime,
        sport: workoutLogs.sport,
        totalTimerSecs: workoutLogs.totalTimerSecs,
        totalDistanceM: workoutLogs.totalDistanceM,
        avgSpeedMps: workoutLogs.avgSpeedMps,
        avgHr: workoutLogs.avgHr,
        hrDriftBpm: workoutLogs.hrDriftBpm,
        avgCadence: workoutLogs.avgCadence,
        observedSessionKind: workoutLogs.observedSessionKind,
      })
      .from(workoutLogs)
      .where(eq(workoutLogs.userId, session.user.id))
      .orderBy(desc(workoutLogs.startTime))
      .limit(30)

    const enriched = rows.map((w) => ({
      ...w,
      computedKind:
        w.observedSessionKind ??
        heuristicClassify({
          totalTimerSecs: w.totalTimerSecs,
          totalDistanceM: w.totalDistanceM,
          avgHr: w.avgHr,
        }),
    }))

    const kpis = computeKpiSnapshot(enriched.map(w => ({ ...w, observedSessionKind: w.computedKind })), Date.now())

    return NextResponse.json({ workoutCount: rows.length, workouts: enriched, kpis })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
