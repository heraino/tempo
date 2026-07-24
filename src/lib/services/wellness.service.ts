import { db } from "@/lib/db"
import { dailyWellness } from "@/lib/db/schema"
import { sql } from "drizzle-orm"
import type { WellnessDay } from "@/lib/fit/garmin-wellness"

export async function upsertWellnessDays(
  userId: string,
  days: WellnessDay[],
): Promise<{ inserted: number; updated: number }> {
  if (days.length === 0) return { inserted: 0, updated: 0 }

  let inserted = 0
  const updated = 0

  // Batch in chunks to avoid hitting parameter limits
  const CHUNK = 50
  for (let i = 0; i < days.length; i += CHUNK) {
    const chunk = days.slice(i, i + CHUNK)
    const rows = chunk.map((d) => ({
      id: crypto.randomUUID(),
      userId,
      calendarDate: d.calendarDate,
      source: "garmin" as const,
      totalSteps: d.totalSteps ?? null,
      totalDistanceMeters: d.totalDistanceMeters ?? null,
      activeCalories: d.activeCalories ?? null,
      totalCalories: d.totalCalories ?? null,
      avgStressLevel: d.avgStressLevel ?? null,
      maxStressLevel: d.maxStressLevel ?? null,
      bodyBatteryHigh: d.bodyBatteryHigh ?? null,
      bodyBatteryLow: d.bodyBatteryLow ?? null,
      bodyBatteryLatest: d.bodyBatteryLatest ?? null,
      restingHr: d.restingHr ?? null,
      avgWakingHr: d.avgWakingHr ?? null,
      minHr: d.minHr ?? null,
      maxHr: d.maxHr ?? null,
      hrvLastNightAvg: d.hrvLastNightAvg ?? null,
      hrv5MinHigh: d.hrv5MinHigh ?? null,
      hrvWeeklyAvg: d.hrvWeeklyAvg ?? null,
      hrvStatus: d.hrvStatus ?? null,
      sleepDurationSecs: d.sleepDurationSecs ?? null,
      sleepDeepSecs: d.sleepDeepSecs ?? null,
      sleepLightSecs: d.sleepLightSecs ?? null,
      sleepRemSecs: d.sleepRemSecs ?? null,
      sleepScore: d.sleepScore ?? null,
      sleepWindowStart: d.sleepWindowStart ? new Date(d.sleepWindowStart) : null,
      sleepWindowEnd: d.sleepWindowEnd ? new Date(d.sleepWindowEnd) : null,
      avgSpo2: d.avgSpo2 ?? null,
      avgRespiration: d.avgRespiration ?? null,
    }))

    const result = await db
      .insert(dailyWellness)
      .values(rows)
      .onConflictDoUpdate({
        target: [dailyWellness.userId, dailyWellness.calendarDate],
        set: {
          totalSteps: sql`COALESCE(EXCLUDED.total_steps, daily_wellness.total_steps)`,
          totalDistanceMeters: sql`COALESCE(EXCLUDED.total_distance_meters, daily_wellness.total_distance_meters)`,
          activeCalories: sql`COALESCE(EXCLUDED.active_calories, daily_wellness.active_calories)`,
          totalCalories: sql`COALESCE(EXCLUDED.total_calories, daily_wellness.total_calories)`,
          avgStressLevel: sql`COALESCE(EXCLUDED.avg_stress_level, daily_wellness.avg_stress_level)`,
          maxStressLevel: sql`COALESCE(EXCLUDED.max_stress_level, daily_wellness.max_stress_level)`,
          bodyBatteryHigh: sql`COALESCE(EXCLUDED.body_battery_high, daily_wellness.body_battery_high)`,
          bodyBatteryLow: sql`COALESCE(EXCLUDED.body_battery_low, daily_wellness.body_battery_low)`,
          bodyBatteryLatest: sql`COALESCE(EXCLUDED.body_battery_latest, daily_wellness.body_battery_latest)`,
          restingHr: sql`COALESCE(EXCLUDED.resting_hr, daily_wellness.resting_hr)`,
          avgWakingHr: sql`COALESCE(EXCLUDED.avg_waking_hr, daily_wellness.avg_waking_hr)`,
          minHr: sql`COALESCE(EXCLUDED.min_hr, daily_wellness.min_hr)`,
          maxHr: sql`COALESCE(EXCLUDED.max_hr, daily_wellness.max_hr)`,
          hrvLastNightAvg: sql`COALESCE(EXCLUDED.hrv_last_night_avg, daily_wellness.hrv_last_night_avg)`,
          hrv5MinHigh: sql`COALESCE(EXCLUDED.hrv_5min_high, daily_wellness.hrv_5min_high)`,
          hrvWeeklyAvg: sql`COALESCE(EXCLUDED.hrv_weekly_avg, daily_wellness.hrv_weekly_avg)`,
          hrvStatus: sql`COALESCE(EXCLUDED.hrv_status, daily_wellness.hrv_status)`,
          sleepDurationSecs: sql`COALESCE(EXCLUDED.sleep_duration_secs, daily_wellness.sleep_duration_secs)`,
          sleepDeepSecs: sql`COALESCE(EXCLUDED.sleep_deep_secs, daily_wellness.sleep_deep_secs)`,
          sleepLightSecs: sql`COALESCE(EXCLUDED.sleep_light_secs, daily_wellness.sleep_light_secs)`,
          sleepRemSecs: sql`COALESCE(EXCLUDED.sleep_rem_secs, daily_wellness.sleep_rem_secs)`,
          sleepScore: sql`COALESCE(EXCLUDED.sleep_score, daily_wellness.sleep_score)`,
          sleepWindowStart: sql`COALESCE(EXCLUDED.sleep_window_start, daily_wellness.sleep_window_start)`,
          sleepWindowEnd: sql`COALESCE(EXCLUDED.sleep_window_end, daily_wellness.sleep_window_end)`,
          avgSpo2: sql`COALESCE(EXCLUDED.avg_spo2, daily_wellness.avg_spo2)`,
          avgRespiration: sql`COALESCE(EXCLUDED.avg_respiration, daily_wellness.avg_respiration)`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: dailyWellness.id })

    // result.length gives us all rows (both inserted and updated); we can't
    // distinguish without an xmax trick, so count all as "processed"
    inserted += result.length
  }

  return { inserted, updated }
}
