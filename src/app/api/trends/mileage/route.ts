import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { eq, and, gte, asc } from "drizzle-orm"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const url = new URL(req.url)
  const period = (["weekly", "monthly", "yearly"] as const).includes(
    url.searchParams.get("period") as "weekly" | "monthly" | "yearly"
  )
    ? (url.searchParams.get("period") as "weekly" | "monthly" | "yearly")
    : "weekly"

  const trendDays = period === "yearly" ? 5 * 365 : period === "monthly" ? 2 * 365 : 90
  const cutoff = new Date(Date.now() - trendDays * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({ startTime: workoutLogs.startTime, totalDistanceM: workoutLogs.totalDistanceM })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.userId, userId), gte(workoutLogs.startTime, cutoff)))
    .orderBy(asc(workoutLogs.startTime))

  const now = new Date()
  type Bucket = { label: string; miles: number }
  const bucketMap = new Map<string, Bucket>()

  if (period === "weekly") {
    for (let i = 11; i >= 0; i--) {
      const ws = new Date(now)
      const day = ws.getUTCDay()
      ws.setUTCDate(ws.getUTCDate() + (day === 0 ? -6 : 1 - day) - i * 7)
      ws.setUTCHours(0, 0, 0, 0)
      const key = ws.toISOString().slice(0, 10)
      bucketMap.set(key, {
        label: ws.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
        miles: 0,
      })
    }
    for (const w of rows) {
      if (!w.totalDistanceM || !w.startTime) continue
      const d = new Date(w.startTime)
      const day = d.getUTCDay()
      d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
      d.setUTCHours(0, 0, 0, 0)
      const b = bucketMap.get(d.toISOString().slice(0, 10))
      if (b) b.miles += w.totalDistanceM / 1609.344
    }
  } else if (period === "monthly") {
    for (let i = 23; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
      bucketMap.set(key, {
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
        miles: 0,
      })
    }
    for (const w of rows) {
      if (!w.totalDistanceM || !w.startTime) continue
      const d = new Date(w.startTime)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
      const b = bucketMap.get(key)
      if (b) b.miles += w.totalDistanceM / 1609.344
    }
  } else {
    const startYear = now.getUTCFullYear() - 4
    for (let y = startYear; y <= now.getUTCFullYear(); y++) {
      bucketMap.set(String(y), { label: String(y), miles: 0 })
    }
    for (const w of rows) {
      if (!w.totalDistanceM || !w.startTime) continue
      const key = String(new Date(w.startTime).getUTCFullYear())
      const b = bucketMap.get(key)
      if (b) b.miles += w.totalDistanceM / 1609.344
    }
  }

  const buckets = Array.from(bucketMap.values()).map((b) => ({
    label: b.label,
    miles: Math.round(b.miles * 10) / 10,
  }))

  return NextResponse.json({ buckets, period })
}
