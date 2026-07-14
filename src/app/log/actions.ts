"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { workoutLogs } from "@/lib/db/schema"
import { parseFitBuffer } from "@/lib/fit/parser"
import { uploadWorkoutSchema } from "@/lib/validation/actions"

export async function uploadWorkout(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in" }

  const file = formData.get("fitFile") as File | null
  if (!file || file.size === 0) return { error: "Please choose a .fit file" }
  if (!file.name.toLowerCase().endsWith(".fit")) return { error: "File must be a .fit file" }

  const parsed = uploadWorkoutSchema.safeParse({
    perceivedEffort: formData.get("perceivedEffort"),
    notes: formData.get("notes"),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }
  const { perceivedEffort, notes } = parsed.data

  let workout
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    workout = await parseFitBuffer(buffer)
  } catch (err) {
    console.error("FIT parse error:", err)
    return { error: "Could not parse FIT file. Make sure it's a valid Garmin activity." }
  }

  await db.insert(workoutLogs).values({
    userId: session.user.id,
    fitFileName: file.name,
    startTime: workout.startTime,
    totalElapsedSecs: workout.totalElapsedSecs,
    totalTimerSecs: workout.totalTimerSecs,
    sport: workout.sport,
    subSport: workout.subSport,
    totalDistanceM: workout.totalDistanceM,
    avgHr: workout.avgHr,
    maxHr: workout.maxHr,
    avgSpeedMps: workout.avgSpeedMps,
    maxSpeedMps: workout.maxSpeedMps,
    avgCadence: workout.avgCadence,
    maxCadence: workout.maxCadence,
    totalAscentM: workout.totalAscentM,
    totalDescentM: workout.totalDescentM,
    avgAltitudeM: workout.avgAltitudeM,
    maxAltitudeM: workout.maxAltitudeM,
    minAltitudeM: workout.minAltitudeM,
    totalCalories: workout.totalCalories,
    avgTemperatureC: workout.avgTemperatureC,
    maxTemperatureC: workout.maxTemperatureC,
    avgVerticalOscillationMm: workout.avgVerticalOscillationMm,
    avgStanceTimeMs: workout.avgStanceTimeMs,
    avgStanceTimePct: workout.avgStanceTimePct,
    avgVerticalRatio: workout.avgVerticalRatio,
    avgStrideLengthM: workout.avgStrideLengthM,
    trainingLoad: workout.trainingLoad,
    aerobicTrainingEffect: workout.aerobicTrainingEffect,
    anaerobicTrainingEffect: workout.anaerobicTrainingEffect,
    aerobicTeMessage: workout.aerobicTeMessage,
    anaerobicTeMessage: workout.anaerobicTeMessage,
    avgRespirationRate: workout.avgRespirationRate,
    maxRespirationRate: workout.maxRespirationRate,
    vo2Max: workout.vo2Max,
    necLat: workout.necLat,
    necLong: workout.necLong,
    swcLat: workout.swcLat,
    swcLong: workout.swcLong,
    firstHalfAvgHr: workout.firstHalfAvgHr,
    secondHalfAvgHr: workout.secondHalfAvgHr,
    hrDriftBpm: workout.hrDriftBpm,
    runOnlyDistanceM: workout.runOnlyDistanceM,
    runOnlyDurationSecs: workout.runOnlyDurationSecs,
    runOnlyAvgSpeedMps: workout.runOnlyAvgSpeedMps,
    runOnlyAvgHr: workout.runOnlyAvgHr,
    walkDurationSecs: workout.walkDurationSecs,
    laps: workout.laps,
    records: workout.records,
    events: workout.events,
    deviceInfo: workout.deviceInfo,
    notes: notes ?? null,
    perceivedEffort: perceivedEffort ?? null,
  })

  return { ok: true }
}
