import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { importChunk } from "@/lib/db/schema"
import { and, eq, lt } from "drizzle-orm"

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({}))
  const { uploadId, chunkIndex, totalChunks, data } = body

  if (
    typeof uploadId !== "string" ||
    typeof chunkIndex !== "number" ||
    typeof totalChunks !== "number" ||
    typeof data !== "string"
  ) {
    return NextResponse.json({ error: "Invalid chunk payload" }, { status: 400 })
  }

  // Clean up stale chunks from this user older than 2 hours
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
  await db
    .delete(importChunk)
    .where(and(eq(importChunk.userId, userId), lt(importChunk.createdAt, twoHoursAgo)))
    .catch(() => null)

  await db
    .insert(importChunk)
    .values({ uploadId, chunkIndex, userId, totalChunks, chunkData: data })
    .onConflictDoUpdate({
      target: [importChunk.uploadId, importChunk.chunkIndex],
      set: { chunkData: data },
    })

  return NextResponse.json({ ok: true })
}
