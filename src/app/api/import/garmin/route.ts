import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { jobs } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { createHash } from "crypto"
import { unzipSync } from "fflate"
import { parseFitBuffer } from "@/lib/fit/parser"
import { classifyWorkout } from "@/lib/analytics/classify"
import { uploadRawFile } from "@/lib/storage/blob"
import {
  findFitFileByUserAndSha256,
  createFitFile,
  updateFitFileParseStatus,
} from "@/lib/services/fitFile.service"
import { createWorkout } from "@/lib/services/workout.service"
import { PARSER_VERSION } from "@/lib/fit/parser"

export const maxDuration = 300

type ImportPayload = {
  blobUrl: string
  totalFiles: number
  processedFiles: number
  skippedFiles: number
  failedFiles: number
  errors: string[]
}

// POST /api/import/garmin  { blobUrl: string }
// → creates job, processes entire import, returns { jobId, ...counts }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({}))
  const blobUrl = typeof body.blobUrl === "string" ? body.blobUrl : null
  if (!blobUrl) return NextResponse.json({ error: "blobUrl is required" }, { status: 400 })

  // Create job record
  const payload: ImportPayload = {
    blobUrl,
    totalFiles: 0,
    processedFiles: 0,
    skippedFiles: 0,
    failedFiles: 0,
    errors: [],
  }
  const [job] = await db.insert(jobs).values({
    userId,
    type: "garmin_import",
    status: "processing",
    payload,
  }).returning()

  try {
    const result = await runImport(userId, job.id, blobUrl)
    await db.update(jobs).set({
      status: "complete",
      payload: result,
      updatedAt: new Date(),
    }).where(eq(jobs.id, job.id))

    return NextResponse.json({ jobId: job.id, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.update(jobs).set({
      status: "failed",
      lastError: msg,
      updatedAt: new Date(),
    }).where(eq(jobs.id, job.id))
    return NextResponse.json({ error: msg, jobId: job.id }, { status: 500 })
  }
}

// GET /api/import/garmin?jobId=xxx  → job status
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get("jobId")
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 })

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, session.user.id)))
    .limit(1)

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ status: job.status, payload: job.payload, error: job.lastError })
}

// ─── Core import logic ────────────────────────────────────────────────────────

async function runImport(userId: string, jobId: string, blobUrl: string): Promise<ImportPayload> {
  // 1. Fetch the zip from Vercel Blob
  const res = await fetch(blobUrl)
  if (!res.ok) throw new Error(`Failed to fetch export file: HTTP ${res.status}`)
  const zipBuffer = new Uint8Array(await res.arrayBuffer())

  // 2. Recursively extract all .fit files (handles Garmin's nested zip structure)
  const fitFiles = extractFitFiles(zipBuffer)
  if (fitFiles.length === 0) {
    throw new Error("No .fit files found in the export. Make sure you're uploading your full Garmin Connect data export zip.")
  }

  const payload: ImportPayload = {
    blobUrl,
    totalFiles: fitFiles.length,
    processedFiles: 0,
    skippedFiles: 0,
    failedFiles: 0,
    errors: [],
  }

  // Update total count so polls can show it while processing
  await db.update(jobs).set({ payload, updatedAt: new Date() }).where(eq(jobs.id, jobId))

  // 3. Process each FIT file
  for (const { name, data } of fitFiles) {
    try {
      const fitBuffer = Buffer.from(data)
      const sha256 = createHash("sha256").update(fitBuffer).digest("hex")

      // Skip duplicate (already uploaded)
      const existing = await findFitFileByUserAndSha256(userId, sha256)
      if (existing) {
        payload.skippedFiles++
        continue
      }

      // Parse FIT
      const parsed = await parseFitBuffer(fitBuffer)

      // Upload raw FIT to blob storage
      let blobResult: { url: string }
      try {
        blobResult = await uploadRawFile(fitBuffer, name, userId, sha256)
      } catch {
        blobResult = { url: `local://${sha256}` }
      }

      // Insert fit_file record
      const fitFileRecord = await createFitFile({
        userId,
        sha256,
        fileName: name,
        fileSizeBytes: fitBuffer.length,
        blobUrl: blobResult.url,
        parserVersion: PARSER_VERSION,
      })

      // Insert workout_log
      await createWorkout({
        userId,
        fitFileId: fitFileRecord.id,
        fitFileName: name,
        athleteTimezone: null,
        startTime: parsed.startTime,
        totalElapsedSecs: parsed.totalElapsedSecs,
        totalTimerSecs: parsed.totalTimerSecs,
        sport: parsed.sport,
        subSport: parsed.subSport,
        totalDistanceM: parsed.totalDistanceM,
        avgHr: parsed.avgHr,
        maxHr: parsed.maxHr,
        avgSpeedMps: parsed.avgSpeedMps,
        maxSpeedMps: parsed.maxSpeedMps,
        avgCadence: parsed.avgCadence,
        maxCadence: parsed.maxCadence,
        totalAscentM: parsed.totalAscentM,
        totalDescentM: parsed.totalDescentM,
        avgAltitudeM: parsed.avgAltitudeM,
        maxAltitudeM: parsed.maxAltitudeM,
        minAltitudeM: parsed.minAltitudeM,
        totalCalories: parsed.totalCalories,
        avgTemperatureC: parsed.avgTemperatureC,
        maxTemperatureC: parsed.maxTemperatureC,
        avgVerticalOscillationMm: parsed.avgVerticalOscillationMm,
        avgStanceTimeMs: parsed.avgStanceTimeMs,
        avgStanceTimePct: parsed.avgStanceTimePct,
        avgVerticalRatio: parsed.avgVerticalRatio,
        avgStrideLengthM: parsed.avgStrideLengthM,
        trainingLoad: parsed.trainingLoad,
        aerobicTrainingEffect: parsed.aerobicTrainingEffect,
        anaerobicTrainingEffect: parsed.anaerobicTrainingEffect,
        aerobicTeMessage: parsed.aerobicTeMessage,
        anaerobicTeMessage: parsed.anaerobicTeMessage,
        avgRespirationRate: parsed.avgRespirationRate,
        maxRespirationRate: parsed.maxRespirationRate,
        vo2Max: parsed.vo2Max,
        necLat: parsed.necLat,
        necLong: parsed.necLong,
        swcLat: parsed.swcLat,
        swcLong: parsed.swcLong,
        firstHalfAvgHr: parsed.firstHalfAvgHr,
        secondHalfAvgHr: parsed.secondHalfAvgHr,
        hrDriftBpm: parsed.hrDriftBpm,
        runOnlyDistanceM: parsed.runOnlyDistanceM,
        runOnlyDurationSecs: parsed.runOnlyDurationSecs,
        runOnlyAvgSpeedMps: parsed.runOnlyAvgSpeedMps,
        runOnlyAvgHr: parsed.runOnlyAvgHr,
        walkDurationSecs: parsed.walkDurationSecs,
        laps: parsed.laps,
        records: parsed.records,
        events: parsed.events,
        deviceInfo: parsed.deviceInfo,
        notes: null,
        perceivedEffort: null,
        sessionKindOverride: null,
        observedSessionKind: classifyWorkout({
          totalTimerSecs: parsed.totalTimerSecs,
          totalDistanceM: parsed.totalDistanceM,
          avgHr: parsed.avgHr,
          sessionKindOverride: null,
        }),
      })

      await updateFitFileParseStatus(fitFileRecord.id, "parsed").catch(() => null)
      payload.processedFiles++
    } catch (err) {
      payload.failedFiles++
      if (payload.errors.length < 30) {
        const msg = err instanceof Error ? err.message : String(err)
        payload.errors.push(`${name}: ${msg.slice(0, 120)}`)
      }
    }

    // Persist progress every 10 files so polls see live updates
    if ((payload.processedFiles + payload.skippedFiles + payload.failedFiles) % 10 === 0) {
      await db.update(jobs).set({ payload, updatedAt: new Date() }).where(eq(jobs.id, jobId))
    }
  }

  return payload
}

// ─── Zip extraction ───────────────────────────────────────────────────────────

function extractFitFiles(
  zipData: Uint8Array,
  depth = 0,
): Array<{ name: string; data: Uint8Array }> {
  if (depth > 3) return [] // guard against pathological nesting

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(zipData)
  } catch {
    return []
  }

  const results: Array<{ name: string; data: Uint8Array }> = []

  for (const [path, data] of Object.entries(entries)) {
    const lower = path.toLowerCase()
    // Skip macOS metadata and hidden files
    if (lower.includes("__macosx") || lower.includes("/.") || path.startsWith(".")) continue

    if (lower.endsWith(".fit")) {
      const name = path.split("/").pop() ?? path
      results.push({ name, data })
    } else if (lower.endsWith(".zip")) {
      // Garmin exports FIT files inside nested zips (ActivitiesUntitledExport-*.zip)
      const nested = extractFitFiles(data, depth + 1)
      results.push(...nested)
    }
  }

  return results
}
