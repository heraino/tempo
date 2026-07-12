"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { parseFitBuffer } from "@/lib/fit/parser"

export async function uploadWorkout(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in" }

  const file = formData.get("fitFile") as File | null
  if (!file || file.size === 0) return { error: "Please choose a .fit file" }
  if (!file.name.toLowerCase().endsWith(".fit")) return { error: "File must be a .fit file" }

  const notes = (formData.get("notes") as string) || null
  const effortRaw = formData.get("perceivedEffort") as string
  const perceivedEffort = effortRaw ? parseInt(effortRaw) : null

  let parsed
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    parsed = await parseFitBuffer(buffer, file.name)
  } catch (err) {
    console.error("FIT parse error:", err)
    return { error: "Could not parse FIT file. Make sure it's a valid Garmin activity." }
  }

  await db.insert(workoutLogs).values({
    userId: session.user.id,
    fitFileName: file.name,
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
    notes,
    perceivedEffort,
  })

  return { ok: true }
}
