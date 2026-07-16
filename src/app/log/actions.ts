"use server"

import { createHash } from "crypto"
import { auth } from "@/auth"
import { parseFitBuffer, PARSER_VERSION } from "@/lib/fit/parser"
import { extractFitFromZip } from "@/lib/fit/zip"
import { uploadRawFile } from "@/lib/storage/blob"
import { uploadWorkoutSchema } from "@/lib/validation/actions"
import { findFitFileByUserAndSha256, createFitFile, findWorkoutByFitFileId, updateFitFileParseStatus } from "@/lib/services/fitFile.service"
import { createWorkout } from "@/lib/services/workout.service"
import { classifyWorkout } from "@/lib/analytics/classify"
import { upsertAthleteContext } from "@/lib/services/athleteContext.service"
import { createPainObservations } from "@/lib/services/painObservation.service"

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB

export async function uploadWorkout(formData: FormData) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in" }
  const userId = session.user.id

  // ── 2. File validation ───────────────────────────────────────────────────────
  const file = formData.get("fitFile") as File | null
  if (!file || file.size === 0) return { error: "Please choose a .fit or .zip file" }
  if (file.size > MAX_UPLOAD_BYTES) return { error: "File too large (max 50 MB)" }

  const nameLower = file.name.toLowerCase()
  const isZip = nameLower.endsWith(".zip")
  const isFit = nameLower.endsWith(".fit")
  if (!isZip && !isFit) return { error: "File must be a .fit or .zip file" }

  // ── 3. Validate context + pain fields ────────────────────────────────────────
  const validation = uploadWorkoutSchema.safeParse({
    perceivedEffort: formData.get("perceivedEffort"),
    notes: formData.get("notes"),
    timezone: formData.get("timezone"),
    feel: formData.get("feel"),
    outsideTempC: formData.get("outsideTempC"),
    humidityPct: formData.get("humidityPct"),
    sleepQuality: formData.get("sleepQuality"),
    travel: formData.get("travel"),
    massage: formData.get("massage"),
    illness: formData.get("illness"),
    nutritionNotes: formData.get("nutritionNotes"),
    contextFreeText: formData.get("contextFreeText"),
    painEntriesJson: formData.get("painEntriesJson"),
    sessionKindOverride: formData.get("sessionKindOverride"),
  })
  if (!validation.success) return { error: validation.error.errors[0].message }
  const data = validation.data

  // ── 4. Get raw bytes ─────────────────────────────────────────────────────────
  const rawBuffer = Buffer.from(await file.arrayBuffer())

  // ── 5. Extract FIT content (handles ZIP) ─────────────────────────────────────
  let fitBuffer: Buffer
  try {
    fitBuffer = isZip ? extractFitFromZip(rawBuffer) : rawBuffer
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid archive" }
  }

  // ── 6. SHA-256 of FIT content (dedup key, scoped to user) ────────────────────
  const sha256 = createHash("sha256").update(fitBuffer).digest("hex")

  // ── 7. Duplicate check ───────────────────────────────────────────────────────
  // Block only when BOTH the fit_file AND a workout_log exist for this hash.
  // If the workout was deleted, the fit_file record stays but the workout is gone —
  // in that case fall through and re-create the workout using the existing fit_file.
  const existingFile = await findFitFileByUserAndSha256(userId, sha256)
  if (existingFile) {
    const existingWorkout = await findWorkoutByFitFileId(existingFile.id, userId)
    if (existingWorkout) {
      return {
        error: "This workout has already been uploaded",
        workoutId: existingWorkout.id,
      }
    }
  }

  // ── 8 & 9. Upload to Blob + insert fit_file (skipped when reusing existing) ───
  let fitFile = existingFile
  if (!fitFile) {
    let blobUrl = ""
    try {
      const upload = await uploadRawFile(rawBuffer, file.name, userId, sha256)
      blobUrl = upload.url
    } catch (err) {
      console.error("Blob upload error:", err)
      return { error: "Failed to store source file. Please try again." }
    }

    try {
      fitFile = await createFitFile({
        userId,
        sha256,
        fileName: file.name,
        fileSizeBytes: rawBuffer.length,
        blobUrl,
        parserVersion: PARSER_VERSION,
      })
    } catch (err) {
      console.error("fit_file insert error:", err)
      return { error: "Failed to record source file metadata" }
    }
  }

  if (!fitFile) return { error: "Internal: failed to obtain fit file record" }

  // ── 10. Parse FIT ─────────────────────────────────────────────────────────────
  // Blob and fit_file record are preserved if parsing fails — raw file is safe.
  let parsed
  try {
    parsed = await parseFitBuffer(fitBuffer)
  } catch (err) {
    console.error("FIT parse error:", err)
    const msg = err instanceof Error ? err.message : String(err)
    await updateFitFileParseStatus(fitFile.id, "failed", msg).catch(console.error)
    return {
      error: "Could not parse FIT file. Your source file has been saved and can be re-processed.",
      fitFileId: fitFile.id,
    }
  }

  // ── 11. Insert workout_log ────────────────────────────────────────────────────
  let workout
  try {
    workout = await createWorkout({
      userId,
      fitFileId: fitFile.id,
      fitFileName: file.name,
      athleteTimezone: data.timezone ?? null,
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
      notes: data.notes ?? null,
      perceivedEffort: data.perceivedEffort ?? null,
      sessionKindOverride: data.sessionKindOverride ?? null,
      observedSessionKind: classifyWorkout({
        totalTimerSecs: parsed.totalTimerSecs,
        totalDistanceM: parsed.totalDistanceM,
        avgHr: parsed.avgHr,
        sessionKindOverride: data.sessionKindOverride ?? null,
      }),
    })
  } catch (err) {
    console.error("workout_log insert error:", err)
    const msg = err instanceof Error ? err.message : String(err)
    await updateFitFileParseStatus(fitFile.id, "workout_save_failed", msg).catch(console.error)
    return {
      error: "Failed to save workout. Your source file has been preserved.",
      fitFileId: fitFile.id,
    }
  }

  // ── 11b. Mark fit_file as fully parsed ───────────────────────────────────────
  await updateFitFileParseStatus(fitFile.id, "parsed").catch(console.error)

  // ── 12. Athlete context ───────────────────────────────────────────────────────
  const hasContext =
    data.feel != null ||
    data.outsideTempC != null ||
    data.humidityPct != null ||
    data.sleepQuality != null ||
    data.travel ||
    data.massage ||
    data.illness ||
    data.nutritionNotes != null ||
    data.contextFreeText != null

  if (hasContext) {
    try {
      await upsertAthleteContext(workout.id, userId, {
        feel: data.feel ?? null,
        rpe: data.perceivedEffort ?? null,
        outsideTempC: data.outsideTempC ?? null,
        humidityPct: data.humidityPct ?? null,
        sleepQuality: data.sleepQuality ?? null,
        travel: data.travel ?? false,
        massage: data.massage ?? false,
        illness: data.illness ?? false,
        nutritionNotes: data.nutritionNotes ?? null,
        freeText: data.contextFreeText ?? null,
      })
    } catch (err) {
      console.error("athlete_context insert error:", err)
      // Non-fatal: workout is logged; context capture failed
    }
  }

  // ── 13. Pain observations ─────────────────────────────────────────────────────
  if (data.painEntriesJson.length > 0) {
    const observationDate = parsed.startTime.toISOString().split("T")[0]
    try {
      await createPainObservations(userId, workout.id, observationDate, data.painEntriesJson)
    } catch (err) {
      console.error("pain_observations insert error:", err)
      // Non-fatal: workout is logged; pain capture failed
    }
  }

  return { ok: true, workoutId: workout.id, fitFileId: fitFile.id }
}
