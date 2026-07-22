import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export interface RecordPoint {
  t: number           // seconds from activity start
  speedMps: number | null
  hr: number | null
  cadence: number | null   // full spm (single-foot × 2)
  altitude: number | null  // meters
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const rows = await db
    .select({ records: workoutLogs.records })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.id, id), eq(workoutLogs.userId, session.user.id)))
    .limit(1)

  if (!rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const raw = rows[0].records as Array<Record<string, unknown>> | null
  if (!raw || raw.length === 0) {
    return NextResponse.json({ points: [] })
  }

  // Downsample: target ~400 points max
  const step = Math.max(1, Math.floor(raw.length / 400))

  // Compute start time from first record's timestamp for elapsed fallback
  const firstTs = raw[0]?.timestamp as string | undefined
  const startMs = firstTs ? new Date(firstTs).getTime() : null

  const points: RecordPoint[] = raw
    .filter((_, i) => i % step === 0)
    .map((r) => {
      // Prefer timestamp-derived elapsed (reliable across all stored records),
      // fall back to fit-file-parser's elapsed field, then 0.
      const ts = r.timestamp as string | undefined
      let t: number
      if (startMs !== null && ts) {
        t = (new Date(ts).getTime() - startMs) / 1000
      } else {
        const elapsed = r.elapsed as number | undefined
        t = typeof elapsed === "number" ? elapsed : 0
      }
      const speed = (r.enhanced_speed ?? r.speed) as number | undefined
      const hr = r.heart_rate as number | undefined
      const cad = (r.running_cadence ?? r.cadence) as number | undefined
      const alt = (r.enhanced_altitude ?? r.altitude) as number | undefined
      return {
        t,
        speedMps: (speed != null && speed > 0.3) ? speed : null,
        hr: hr ?? null,
        cadence: cad ? cad * 2 : null,
        altitude: alt ?? null,
      }
    })
    .filter((p) => p.t >= 0)

  return NextResponse.json({ points })
}
